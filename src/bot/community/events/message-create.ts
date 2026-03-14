import { Events, type Message, type GuildMember } from "discord.js";
import type { BotClient } from "@core/BotClient.ts";
import { Logger } from "@core/libs";
import { analyzeSupportMessage, analyzeUserFeedback } from "@core/ai";
import { normalizeElongated } from "@core/utils/normalize";
import { grantXP, isXPChannel, hasAllowedRole } from "../services/xp-service";
import { trackPublicChat, trackStaffChat } from "../services/staff-activity-service";
import { isSupportChannel, createSession, recordResponse, resolveSession, autoClaimSession, type ClaimResult } from "../services/support-service";
import { SupportSessionRepository } from "@database/repositories/SupportSessionRepository";
import { ActivityRepository } from "@database/repositories/ActivityRepository";
import { ActivityLogRepository } from "@database/repositories/ActivityLogRepository";
import { isStaff } from "@shared/utils/access";
import {
    logToChannel,
    xpGainEmbed,
    supportSessionEmbed,
    dynamicSupportPointsEmbed,
    staffActivityEmbed,
    staffPenaltyEmbed,
    staffReminderEmbed,
    sorryDmEmbed,
    ratingFeedbackEmbed,
    aiDecisionEmbed,
    claimWarningEmbed,
    claimTakeoverEmbed,
} from "../utils/activity-logger";

const STAFF_SESSION_TIMEOUT_MS = 3_600_000; // 1 hour
const STAFF_CHAT_THRESHOLD = 4;

interface StaffChatTracker {
    staffIds: Set<string>;
    count: number;
    warned: boolean;
    startedAt: number;
}

const staffChatCounters = new Map<string, StaffChatTracker>();

function trackStaffToStaff(channelId: string, staffId: string): { reachedThreshold: boolean; count: number; warned: boolean } {
    let tracker = staffChatCounters.get(channelId);

    if (tracker && Date.now() - tracker.startedAt >= STAFF_SESSION_TIMEOUT_MS) {
        Logger.debug(`[activity:track] Staff tracker expired for channelId=${channelId}, resetting`, "BotClient");
        staffChatCounters.delete(channelId);
        tracker = undefined;
    }

    Logger.debug(`[activity:track] Tracking staff message for staffId=${staffId} in channelId=${channelId}. Current tracker: ${tracker ? `count=${tracker.count}, warned=${tracker.warned}, staffIds=[${[...tracker.staffIds].join(", ")}]` : "none"}`, "BotClient");
    if (!tracker) {
        tracker = { staffIds: new Set(), count: 0, warned: false, startedAt: Date.now() };
        Logger.debug(`[activity:track] Initializing staff tracker for channelId=${channelId}`, "BotClient");
        staffChatCounters.set(channelId, tracker);
    }

    Logger.debug(`[activity:track] Adding staffId=${staffId} to tracker for channelId=${channelId}`, "BotClient");
    tracker.staffIds.add(staffId);
    tracker.count++;
    const reachedThreshold = tracker.staffIds.size >= 2 && tracker.count >= STAFF_CHAT_THRESHOLD;
    return { reachedThreshold, count: tracker.count, warned: tracker.warned };
}

function resetStaffTracker(channelId: string): void {
    staffChatCounters.delete(channelId);
}

const CLAIM_INTRUSION_TIMEOUT_MS = 3_600_000; // 1 hour

interface ClaimIntrusionTracker {
    count: number;
    warned: boolean;
    startedAt: number;
}

const claimIntrusionCounters = new Map<string, ClaimIntrusionTracker>();

function trackClaimIntrusion(staffId: string, channelId: string): { warned: boolean; shouldDeduct: boolean } {
    const key = `${staffId}:${channelId}`;
    let tracker = claimIntrusionCounters.get(key);

    if (tracker && Date.now() - tracker.startedAt >= CLAIM_INTRUSION_TIMEOUT_MS) {
        claimIntrusionCounters.delete(key);
        tracker = undefined;
    }

    if (!tracker) {
        tracker = { count: 0, warned: false, startedAt: Date.now() };
        claimIntrusionCounters.set(key, tracker);
    }

    tracker.count++;

    if (!tracker.warned) {
        tracker.warned = true;
        return { warned: true, shouldDeduct: false };
    }

    return { warned: false, shouldDeduct: true };
}

function resetClaimIntrusion(staffId: string, channelId: string): void {
    claimIntrusionCounters.delete(`${staffId}:${channelId}`);
}

async function handleSessionResolution(
    message: Message,
    session: { userMessageId: string; userId: string; claimedBy: string | null; responseTimeMs: number | null },
    guildId: string,
    endingContent: string,
    endedBy: string,
    reason: string,
    client: BotClient,
): Promise<void> {
    const resolved = await resolveSession(session.userMessageId, guildId, endingContent);
    if (!resolved) return;

    Logger.debug(`[activity] Session resolved: staff=${resolved.staffId} points=${resolved.points} quality=${resolved.quality} sentiment=${resolved.sentiment}`, client.botName);

    const responseMs = session.responseTimeMs ?? 0;
    let speedPts = 0;
    if (responseMs > 0) {
        if (responseMs <= 60_000) speedPts = 2;
        else if (responseMs <= 300_000) speedPts = 1;
    }
    const qualityPts = resolved.quality === "professional" ? 2 : resolved.quality === "bad" ? -1 : resolved.quality === "normal" ? 1 : 0;
    const sentimentPts = resolved.sentiment === "negative" ? -1 : 0;

    await logToChannel(message.guild!, "support_points", dynamicSupportPointsEmbed(
        resolved.staffId, resolved.points, speedPts, qualityPts, sentimentPts,
        resolved.quality, resolved.sentiment, responseMs,
    ));
    await logToChannel(message.guild!, "support_points", supportSessionEmbed(
        "resolved", session.userId, resolved.staffId, reason,
    ));

    if (resolved.sentiment === "negative" && Math.random() < 0.2) {
        try {
            const user = await message.guild!.members.fetch(session.userId).catch(() => null);
            if (user) {
                await user.send({ embeds: [sorryDmEmbed()] }).catch(() => {});
                Logger.debug(`[activity] Sent sorry DM to user ${session.userId}`, client.botName);
            }
        } catch {}
    }

    if (resolved.sentiment !== "negative" && Math.random() < 0.1) {
        try {
            const user = await message.guild!.members.fetch(session.userId).catch(() => null);
            if (user) {
                await user.send({ embeds: [ratingFeedbackEmbed()] }).catch(() => {});
                Logger.debug(`[activity] Sent rating embed to user ${session.userId}`, client.botName);
            }
        } catch {}
    }
}

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

                if (isStaff(member)) {
                    const claimResult = await autoClaimSession(channelId, member.id, guildId);

                    if (claimResult.takeover) {
                        const { previousStaff, sessionUserId } = claimResult.takeover;
                        Logger.debug(`[activity:claim] Takeover in channelId=${channelId}: ${previousStaff} → ${member.id}`, client.botName);

                        await logToChannel(message.guild!, "support_points", supportSessionEmbed(
                            "reassigned", sessionUserId, member.id,
                            `Previous staff: <@${previousStaff}> (inactive >10min, -1 point)`,
                        ));
                        await logToChannel(message.guild!, "support_points", staffPenaltyEmbed(
                            previousStaff, -1, "Ignored user for 10+ minutes, session reassigned",
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
                            await ActivityRepository.addSupportPoints(member.id, guildId, -1);
                            await ActivityLogRepository.log({
                                guildId,
                                userId: member.id,
                                type: "support_penalty",
                                amount: -1,
                                details: `Intruding on session claimed by ${claimResult.intruding.claimedBy} in ${channelId}`,
                            });
                            await logToChannel(message.guild!, "support_points", staffPenaltyEmbed(
                                member.id, -1, `Intruding on session claimed by <@${claimResult.intruding.claimedBy}>`,
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
                            await ActivityRepository.addSupportPoints(member.id, guildId, -1);
                            await ActivityLogRepository.log({
                                guildId,
                                userId: member.id,
                                type: "support_penalty",
                                amount: -1,
                                details: "Continued staff-to-staff chatting after warning",
                            });
                            await logToChannel(message.guild!, "support_points", staffPenaltyEmbed(
                                member.id, -1, "Continued staff-to-staff chatting after warning",
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

                    await logToChannel(message.guild!, "ai", aiDecisionEmbed(
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
                                    message, session, guildId, normalizedContent,
                                    member.id, "AI-detected conversation end (staff)", client,
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

                    await logToChannel(message.guild!, "ai", aiDecisionEmbed(
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
                                    message, session, guildId, normalizedContent,
                                    member.id, "Member ended conversation", client,
                                );
                            }
                        }
                    } else {
                        const created = await createSession(guildId, channelId, message.id, member.id);
                        if (created) {
                            await logToChannel(message.guild!, "support_points", supportSessionEmbed(
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
                        await logToChannel(message.guild, "xp_gain", xpGainEmbed(
                            username, member.id, result.xp, result.leveledUp, result.newLevel,
                        ));
                    }
                }
            }

            if (isStaff(member)) {
                Logger.debug(`[activity] Staff member ${username}, tracking staff activity`, client.botName);
                const staffResult = await trackStaffChat(member, guildId, channelId, username, content);
                if (staffResult) {
                    await logToChannel(message.guild, "staff_activity", staffActivityEmbed(
                        member.id, username, staffResult, "staff",
                    ));
                } else if (isXPCh) {
                    const publicResult = await trackPublicChat(member, guildId, username, content);
                    if (publicResult) {
                        await logToChannel(message.guild, "staff_activity", staffActivityEmbed(
                            member.id, username, publicResult, "public",
                        ));
                    }
                }
            }
        } catch (error) {
            Logger.error(`Message activity error: ${error}`, client.botName);
        }
    },
};
