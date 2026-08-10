import type { GuildMember } from "discord.js";
import { ActivityRepository } from "@database/repositories/ActivityRepository";
import { ActivityLogRepository } from "@database/repositories/ActivityLogRepository";
import { STAFF_POINTS, AI_MEANINGFUL_SKIP_CONFIDENCE } from "@constants";
import { Logger } from "@logger";
import { analyzeStaffActivity } from "@core/ai";
import { isStaff } from "@bot/utils/access";
import { getTracker } from "./hourly-tracker";

const CTX = "community:staff";

export async function trackPublicChat(
    member: GuildMember,
    guildId: string,
    username: string,
    messageContent?: string,
): Promise<number | null> {
    if (!(await isStaff(member))) {
        Logger.debug(`${username} (${member.id}) is not staff, skipping public chat track`, CTX);
        return null;
    }

    if (messageContent) {
        const analysis = await analyzeStaffActivity(messageContent, "public");
        if (!analysis.meaningful && analysis.confidence >= AI_MEANINGFUL_SKIP_CONFIDENCE) {
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
