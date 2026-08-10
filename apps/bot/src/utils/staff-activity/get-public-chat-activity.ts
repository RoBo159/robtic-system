import { ActivityLogRepository } from "@database/repositories/ActivityLogRepository";

export async function getPublicChatActivity(userId: string, guildId: string, since?: Date) {
    return ActivityLogRepository.getUserPointsSum(userId, guildId, "staff_public_points", since);
}
