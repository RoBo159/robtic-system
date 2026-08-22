import { Events, type Message, type GuildMember } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { Logger } from "@logger";
import { analyzeSupportMessage } from "@core/ai";
import { normalizeElongated } from "@utils";
import { COMMUNITY_MESSAGES, SUPPORT_SCORING } from "@constants";
import { grantXP, isXPChannel, hasAllowedRole } from "../../services/community/xp";
import { isSupportChannel, createSession, recordResponse, autoClaimSession } from "../../services/community/support";
import { SupportSessionRepository } from "@database/repositories/SupportSessionRepository";
import { ActivityRepository } from "@database/repositories/ActivityRepository";
import { ActivityLogRepository } from "@database/repositories/ActivityLogRepository";
import { isStaff } from "@bot/utils/access";
import {
    logToChannel,
    xpGainEmbed,
    supportSessionEmbed,
    staffPenaltyEmbed,
    staffReminderEmbed,
    aiDecisionEmbed,
    claimWarningEmbed,
    claimTakeoverEmbed,
} from "../../utils/community/activity-log";
import { staffChatCounters, trackStaffToStaff, resetStaffTracker } from "../../utils/community/staff-chat-tracker";
import { trackClaimIntrusion, resetClaimIntrusion } from "../../utils/community/claim-intrusion-tracker";
import { handleSessionResolution } from "../../utils/community/handle-session-resolution";

export default {
    name: Events.MessageCreate,
    async execute(message: Message, client: BotClient) {
        if (message.author.bot || !message.guild || !message.member) return;

        const guildId = message.guild.id;
        const channelId = message.channel.id;
        const member = message.member as GuildMember;
        const username = message.author.username;
        const content = message.content;

        try {
            Logger.debug(`[activity] Message from ${username} (${member.id}) in #${channelId}`, client.botName);

            const isSupportCh = await isSupportChannel(guildId, channelId);
            if (isSupportCh) {
                Logger.debug(`[activity] Support channel detected for ${username}`, client.botName);
                const normalizedContent = normalizeElongated(content);

                if (await isStaff(member)) {
                    const claimResult = await autoClaimSession(channelId, member.id, guildId);

                    if (claimResult.takeover) {
                        const { previousStaff, sessionUserId } = claimResult.takeover;
                        Logger.debug(`[activity:claim] Takeover in channelId=${channelId}: ${previousStaff} → ${member.id}`, client.botName);

                        await logToChannel(client, "support_points", supportSessionEmbed(
                            "reassigned", sessionUserId, member.id,
                            COMMUNITY_MESSAGES.resolutionReasons.takeoverDetails(previousStaff),
                        ));
                        await logToChannel(client, "support_points", staffPenaltyEmbed(
                            previousStaff, SUPPORT_SCORING.takeoverPenalty, COMMUNITY_MESSAGES.penaltyReasons.ignoredUser,
                        ));

                        const newStaffMember = await message.guild!.members.fetch(member.id).catch(() => null);
                        if (newStaffMember) {
                            await newStaffMember.send({ embeds: [claimTakeoverEmbed(channelId, previousStaff)] }).catch(() => {});
                        }

                        resetClaimIntrusion(member.id, channelId);
                    }

                    if (claimResult.intruding) {
                        const intrusion = trackClaimIntrusion(member.id, channelId);
                        Logger.debug(`[activity:claim] Staff ${member.id} intruding on session claimed by ${claimResult.intruding.claimedBy} in channelId=${channelId} (warned=${intrusion.warned}, deduct=${intrusion.shouldDeduct})`, client.botName);

                        if (intrusion.warned) {
                            const intruder = await message.guild!.members.fetch(member.id).catch(() => null);
                            if (intruder) {
                                await intruder.send({ embeds: [claimWarningEmbed(channelId)] }).catch(() => {});
                                Logger.debug(`[activity:claim] Sent claim warning DM to ${member.id}`, client.botName);
                            }
                        }

                        if (intrusion.shouldDeduct) {
                            await ActivityRepository.findOrCreate(member.id, guildId, "staff");
                            await ActivityRepository.addSupportPoints(member.id, guildId, SUPPORT_SCORING.intrusionPenalty);
                            await ActivityLogRepository.log({
                                guildId,
                                userId: member.id,
                                type: "support_penalty",
                                amount: SUPPORT_SCORING.intrusionPenalty,
                                details: `Intruding on session claimed by ${claimResult.intruding.claimedBy} in ${channelId}`,
                            });
                            await logToChannel(client, "support_points", staffPenaltyEmbed(
                                member.id, SUPPORT_SCORING.intrusionPenalty, COMMUNITY_MESSAGES.penaltyReasons.intruding(claimResult.intruding.claimedBy),
                            ));
                        }
                    }

                    const openSessions = await SupportSessionRepository.findOpen(channelId);
                    for (const session of openSessions) {
                        if (session.claimedBy === member.id) {
                            await SupportSessionRepository.addStaffMessage(session.userMessageId, normalizedContent);
                        }
                    }

                    const staffTrack = trackStaffToStaff(channelId, member.id);
                    const tracker = staffChatCounters.get(channelId);

                    if (staffTrack.reachedThreshold && tracker) {
                        if (!staffTrack.warned) {
                            tracker.warned = true;
                            Logger.debug(`[activity:track2] Staff-to-staff threshold reached in channelId=${channelId}, sending warnings`, client.botName);

                            for (const sid of tracker.staffIds) {
                                const staffMember = await message.guild!.members.fetch(sid).catch(() => null);
                                if (staffMember) {
                                    await staffMember.send({ embeds: [staffReminderEmbed()] }).catch(() => {});
                                    Logger.debug(`[activity] Sent staff chat reminder DM to ${sid}`, client.botName);
                                }
                            }
                        } else {
                            Logger.debug(`[activity:track2] Post-warning staff message from ${member.id} in channelId=${channelId}, deducting points`, client.botName);

                            await ActivityRepository.findOrCreate(member.id, guildId, "staff");
                            await ActivityRepository.addSupportPoints(member.id, guildId, SUPPORT_SCORING.staffChatPenalty);
                            await ActivityLogRepository.log({
                                guildId,
                                userId: member.id,
                                type: "support_penalty",
                                amount: SUPPORT_SCORING.staffChatPenalty,
                                details: COMMUNITY_MESSAGES.penaltyReasons.staffChatAfterWarning,
                            });
                            await logToChannel(client, "support_points", staffPenaltyEmbed(
                                member.id, SUPPORT_SCORING.staffChatPenalty, COMMUNITY_MESSAGES.penaltyReasons.staffChatAfterWarning,
                            ));
                        }
                    }

                    const hasRef = Boolean(message.reference?.messageId);
                    const analysis = await analyzeSupportMessage(normalizedContent, hasRef);

                    Logger.debug(
                        `[activity] AI support classification for ${username}: ${analysis.classification.classification} ` +
                        `(conf=${analysis.classification.confidence.toFixed(2)}, fallback=${analysis.classification.fallback})`,
                        client.botName,
                    );

                    await logToChannel(client, "ai", aiDecisionEmbed(
                        username, member.id,
                        analysis.classification.classification,
                        analysis.classification.confidence,
                        analysis.classification.fallback,
                        "Support (staff)",
                    ));

                    if (analysis.isConversationEnd) {
                        for (const session of openSessions) {
                            if (session.claimedBy === member.id) {
                                await handleSessionResolution(
                                    session, guildId,
                                    member.id, COMMUNITY_MESSAGES.resolutionReasons.aiConversationEndStaff, client,
                                );
                                resetClaimIntrusion(member.id, channelId);
                            }
                        }
                    }

                    if (analysis.isMeaningfulReply) {
                        for (const session of openSessions) {
                            if (session.claimedBy === member.id && !session.respondedAt) {
                                await recordResponse(session.userMessageId);
                            }
                        }
                    }
                } else {
                    resetStaffTracker(channelId);

                    const hasRef = Boolean(message.reference?.messageId);
                    const analysis = await analyzeSupportMessage(normalizedContent, hasRef);

                    await logToChannel(client, "ai", aiDecisionEmbed(
                        username, member.id,
                        analysis.classification.classification,
                        analysis.classification.confidence,
                        analysis.classification.fallback,
                        "Support (member)",
                    ));

                    if (analysis.isConversationEnd) {
                        const openSessions = await SupportSessionRepository.findOpen(channelId);
                        for (const session of openSessions) {
                            if (session.userId === member.id) {
                                await handleSessionResolution(
                                    session, guildId,
                                    member.id, COMMUNITY_MESSAGES.resolutionReasons.memberEnded, client,
                                );
                            }
                        }
                    } else {
                        const created = await createSession(guildId, channelId, message.id, member.id);
                        if (created) {
                            await logToChannel(client, "support_points", supportSessionEmbed(
                                "created", member.id,
                            ));
                        }
                    }
                }
                return;
            }

            const isXPCh = await isXPChannel(guildId, channelId);
            if (isXPCh) {
                const hasRole = await hasAllowedRole(guildId, member);
                Logger.debug(`[activity] XP channel: hasAllowedRole=${hasRole} for ${username}`, client.botName);
                if (hasRole) {
                    const result = await grantXP(member.id, guildId, username, message.guild, content);
                    if (result) {
                        Logger.debug(`[activity] Granted ${result.xp} XP to ${username} (levelUp=${result.leveledUp}, level=${result.newLevel})`, client.botName);
                        await logToChannel(client, "xp_gain", xpGainEmbed(
                            username, member.id, result.xp, result.leveledUp, result.newLevel,
                        ));
                    }
                }
            }
        } catch (error) {
            Logger.error(`Message activity error: ${error}`, client.botName);
        }
    },
};
