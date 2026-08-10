import { ActivityLogRepository } from "@database/repositories/ActivityLogRepository";

export async function getStaffChatActivity(userId: string, guildId: string, since?: Date) {
    return ActivityLogRepository.getUserPointsSum(userId, guildId, "staff_chat_points", since);
}
