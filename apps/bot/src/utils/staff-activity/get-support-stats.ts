import { SupportSessionRepository } from "@database/repositories/SupportSessionRepository";

export async function getSupportStats(userId: string) {
    return SupportSessionRepository.getStaffStats(userId);
}
