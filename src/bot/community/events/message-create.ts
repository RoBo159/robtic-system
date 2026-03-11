import { Events, type Message, type GuildMember } from "discord.js";
import type { BotClient } from "@core/BotClient.ts";
import { Logger } from "@core/libs";
import { analyzeSupportMessage, analyzeUserFeedback, detectStaffChat } from "@core/ai";
import { normalizeElongated } from "@core/utils/normalize";
import { grantXP, isXPChannel, hasAllowedRole } from "../services/xp-service";
import { trackPublicChat, trackStaffChat } from "../services/staff-activity-service";
import { isSupportChannel, createSession, recordResponse, resolveSession, autoClaimSession } from "../services/support-service";
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
} from "../utils/activity-logger";

const staffChatCounters = new Map<string, { staffIds: Set<string>; count: number }>();

function trackStaffToStaff(channelId: string, staffId: string): { isStaffOnly: boolean; count: number } {
    let tracker = staffChatCounters.get(channelId);
    Logger.debug(`[activity:track] Tracking staff message for staffId=${staffId} in channelId=${channelId}. Current tracker: ${tracker ? `count=${tracker.count}, staffIds=[${[...tracker.staffIds].join(", ")}]` : "none"}`, "BotClient");
    if (!tracker) {
        tracker = { staffIds: new Set(), count: 0 };
        Logger.debug(`[activity:track] Initializing staff tracker for channelId=${channelId}`, "BotClient");
        staffChatCounters.set(channelId, tracker);
    }

    Logger.debug(`[activity:track] Adding staffId=${staffId} to tracker for channelId=${channelId}`, "BotClient");
    tracker.staffIds.add(staffId);
    tracker.count++;
    const isStaffOnly = tracker.staffIds.size >= 2 && tracker.count >= 4;
    return { isStaffOnly, count: tracker.count };
}

function resetStaffTracker(channelId: string): void {
    staffChatCounters.delete(channelId);
}

const reminderCooldowns = new Map<string, number>();
const REMINDER_COOLDOWN_MS = 300_000; // 5 minutes

function canSendReminder(staffId: string): boolean {
    const last = reminderCooldowns.get(staffId);
    if (last && Date.now() - last < REMINDER_COOLDOWN_MS) return false;
    reminderCooldowns.set(staffId, Date.now());
    return true;
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
                    await autoClaimSession(channelId, member.id, guildId);

                    const openSessions = await SupportSessionRepository.findOpen(channelId);
                    for (const session of openSessions) {
                        if (session.claimedBy === member.id) {
                            await SupportSessionRepository.addStaffMessage(session.userMessageId, normalizedContent);
                        }
                    }

                    const staffTrack = trackStaffToStaff(channelId, member.id);
                    if (staffTrack.isStaffOnly) {
                        const recentStaffMsgs = openSessions[0]?.staffMessages?.slice(-6) ?? [];
                        const staffChatResult = await detectStaffChat(recentStaffMsgs);

                        if (staffChatResult.isStaffChat && staffChatResult.confidence >= 0.6) {
                            for (const sid of staffChatCounters.get(channelId)?.staffIds ?? []) {
                                await ActivityRepository.findOrCreate(sid, guildId, "staff");
                                await ActivityRepository.addSupportPoints(sid, guildId, -1);
                                await ActivityLogRepository.log({
                                    guildId,
                                    userId: sid,
                                    type: "support_penalty",
                                    amount: -1,
                                    details: "Staff-to-staff chatting in support channel",
                                });
                                await logToChannel(message.guild!, "support_points", staffPenaltyEmbed(
                                    sid, -1, "Staff-to-staff chatting in support channel",
                                ));

                                if (canSendReminder(sid)) {
                                    const staffMember = await message.guild!.members.fetch(sid).catch(() => null);
                                    if (staffMember) {
                                        await staffMember.send({ embeds: [staffReminderEmbed()] }).catch(() => {});
                                        Logger.debug(`[activity] Sent staff chat reminder DM to ${sid}`, client.botName);
                                    }
                                }
                            }
                            resetStaffTracker(channelId);
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
