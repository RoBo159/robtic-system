import type { GuildMember } from "discord.js";
import { ActivityRepository } from "@database/repositories/ActivityRepository";
import { ActivityLogRepository } from "@database/repositories/ActivityLogRepository";
import { STAFF_POINTS, AI_MEANINGFUL_SKIP_CONFIDENCE } from "@constants";
import { Logger } from "@logger";
import { analyzeStaffActivity } from "@core/ai";
import { isStaff } from "@bot/utils/access";
import { getTracker } from "./hourly-tracker";
import { isStaffChannel } from "./is-staff-channel";

const CTX = "community:staff";

export async function trackStaffChat(
    member: GuildMember,
    guildId: string,
    channelId: string,
    username: string,
    messageContent?: string,
): Promise<number | null> {
    if (!(await isStaff(member))) return null;

    const isStaffCh = await isStaffChannel(guildId, channelId);
    if (!isStaffCh) {
        Logger.debug(`Channel ${channelId} is not a staff channel for ${username}`, CTX);
        return null;
    }

    if (messageContent) {
        const analysis = await analyzeStaffActivity(messageContent, "staff");
        if (!analysis.meaningful && analysis.confidence >= AI_MEANINGFUL_SKIP_CONFIDENCE) {
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
