import { ActivityRepository } from "@database/repositories/ActivityRepository";
import { ActivityLogRepository } from "@database/repositories/ActivityLogRepository";
import { XPSettingsRepository } from "@database/repositories/XPSettingsRepository";
import { STAFF_POINTS } from "@core/config";
import { Logger } from "@core/libs";
import { analyzeStaffActivity } from "@core/ai";
import { isStaff } from "@shared/utils/access";
import type { GuildMember } from "discord.js";

const CTX = "community:staff";

const hourlyTracker = new Map<string, { public: number; staff: number; resetAt: number }>();

function getTracker(userId: string): { public: number; staff: number; resetAt: number } {
    const now = Date.now();
    let tracker = hourlyTracker.get(userId);
    if (!tracker || now >= tracker.resetAt) {
        tracker = { public: 0, staff: 0, resetAt: now + 3_600_000 };
        hourlyTracker.set(userId, tracker);
    }
    return tracker;
}

export async function isStaffChannel(guildId: string, channelId: string): Promise<boolean> {
    const settings = await XPSettingsRepository.get(guildId);
    if (!settings) return false;
    return settings.staffChannels.includes(channelId);
}

export async function trackPublicChat(
    member: GuildMember,
    guildId: string,
    username: string,
    messageContent?: string,
): Promise<number | null> {
    if (!isStaff(member)) {
        Logger.debug(`${username} (${member.id}) is not staff, skipping public chat track`, CTX);
        return null;
    }

    if (messageContent) {
        const analysis = await analyzeStaffActivity(messageContent, "public");
        if (!analysis.meaningful && analysis.confidence >= 0.7) {
            Logger.debug(`${username} public chat skipped by AI: not meaningful (conf=${analysis.confidence.toFixed(2)})`, CTX);
            return null;
        }
    }

    const tracker = getTracker(member.id);
    if (tracker.public >= STAFF_POINTS.maxPublicPerHour) {
        Logger.debug(`${username} hit public chat hourly cap (${tracker.public}/${STAFF_POINTS.maxPublicPerHour})`, CTX);
        return null;
    }

    tracker.public++;
    const points = STAFF_POINTS.publicChatPerMessage;
    Logger.debug(`${username} +${points} public chat point (${tracker.public}/${STAFF_POINTS.maxPublicPerHour})`, CTX);

    await ActivityRepository.findOrCreate(member.id, guildId, username);
    await ActivityRepository.addStaffPublicPoints(member.id, guildId, points);
    await ActivityLogRepository.log({
        guildId,
        userId: member.id,
        type: "staff_public_points",
        amount: points,
        details: `Public chat activity point (${tracker.public}/${STAFF_POINTS.maxPublicPerHour} this hour)`,
    });

    return points;
}

export async function trackStaffChat(
    member: GuildMember,
    guildId: string,
    channelId: string,
    username: string,
    messageContent?: string,
): Promise<number | null> {
    if (!isStaff(member)) return null;

    const isStaffCh = await isStaffChannel(guildId, channelId);
    if (!isStaffCh) {
        Logger.debug(`Channel ${channelId} is not a staff channel for ${username}`, CTX);
        return null;
    }

    if (messageContent) {
        const analysis = await analyzeStaffActivity(messageContent, "staff");
        if (!analysis.meaningful && analysis.confidence >= 0.7) {
            Logger.debug(`${username} staff chat skipped by AI: not meaningful (conf=${analysis.confidence.toFixed(2)})`, CTX);
            return null;
        }
    }

    const tracker = getTracker(member.id);
    if (tracker.staff >= STAFF_POINTS.maxStaffPerHour) {
        Logger.debug(`${username} hit staff chat hourly cap (${tracker.staff}/${STAFF_POINTS.maxStaffPerHour})`, CTX);
        return null;
    }

    tracker.staff++;
    const points = STAFF_POINTS.staffChatPerMessage;
    Logger.debug(`${username} +${points} staff chat point (${tracker.staff}/${STAFF_POINTS.maxStaffPerHour})`, CTX);

    await ActivityRepository.findOrCreate(member.id, guildId, username);
    await ActivityRepository.addStaffChatPoints(member.id, guildId, points);
    await ActivityLogRepository.log({
        guildId,
        userId: member.id,
        type: "staff_chat_points",
        amount: points,
        details: `Staff chat activity point (${tracker.staff}/${STAFF_POINTS.maxStaffPerHour} this hour)`,
    });

    return points;
}
