import { ActivityRepository } from "@database/repositories/ActivityRepository";
import { SupportSessionRepository } from "@database/repositories/SupportSessionRepository";
import { ActivityLogRepository } from "@database/repositories/ActivityLogRepository";
import { calculateLevel } from "../../community/services/xp-service";

export async function getStaffActivity(userId: string, guildId: string) {
    const record = await ActivityRepository.findOrCreate(userId, guildId, "unknown");
    return {
        level: calculateLevel(record.totalXP),
        totalXP: record.totalXP,
        supportPoints: record.staff.supportPoints,
        publicChatPoints: record.staff.publicChatPoints,
        staffChatPoints: record.staff.staffChatPoints,
        penalties: record.staff.penalties,
        totalStaffPoints:
            record.staff.supportPoints +
            record.staff.publicChatPoints +
            record.staff.staffChatPoints -
            record.staff.penalties,
    };
}

export async function getSupportStats(userId: string) {
    return SupportSessionRepository.getStaffStats(userId);
}

export async function getPublicChatActivity(userId: string, guildId: string, since?: Date) {
    return ActivityLogRepository.getUserPointsSum(userId, guildId, "staff_public_points", since);
}

export async function getStaffChatActivity(userId: string, guildId: string, since?: Date) {
    return ActivityLogRepository.getUserPointsSum(userId, guildId, "staff_chat_points", since);
}

export async function getActivityLogs(userId: string, guildId: string, limit = 25) {
    return ActivityLogRepository.getByUser(userId, guildId, limit);
}
