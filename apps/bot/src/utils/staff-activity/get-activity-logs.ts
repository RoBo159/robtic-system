import { ActivityLogRepository } from "@database/repositories/ActivityLogRepository";

export async function getActivityLogs(userId: string, guildId: string, limit = 25) {
    return ActivityLogRepository.getByUser(userId, guildId, limit);
}
