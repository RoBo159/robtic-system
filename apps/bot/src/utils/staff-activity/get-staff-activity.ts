import { ActivityRepository } from "@database/repositories/ActivityRepository";
import { calculateLevel } from "../../services/community/xp";

export async function getStaffActivity(userId: string, guildId: string) {
    const record = await ActivityRepository.findOrCreate(userId, guildId, "unknown");
    return {
        level: calculateLevel(record.totalXP),
        totalXP: record.totalXP,
        supportPoints: record.staff.supportPoints,
        publicChatPoints: record.staff.publicChatPoints,
        staffChatPoints: record.staff.staffChatPoints,
        moderationPoints: record.staff.moderationPoints,
        penalties: record.staff.penalties,
        totalStaffPoints:
            record.staff.supportPoints +
            record.staff.publicChatPoints +
            record.staff.staffChatPoints +
            record.staff.moderationPoints -
            record.staff.penalties,
    };
}
