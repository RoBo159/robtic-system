import type { ICombo } from "@database/models";
import { ComboServerRecordsRepository } from "@database/repositories";
import { Logger } from "@logger";
import { getCachedRecords } from "./record-cache";

const CTX = "main:combo-records";

/** Checks records that only finalize when a conversation ends (duration, messages, streak). */
export async function checkFinalRecords(
    guildId: string,
    pair: ICombo,
    userAId: string,
    userBId: string,
    streakCurrent: number,
): Promise<void> {
    try {
        const doc = await getCachedRecords(guildId);
        let dirty = false;

        if (pair.totalDurationMs > (doc.longestConversation?.value ?? 0)) {
            doc.longestConversation = { value: pair.totalDurationMs, userAId, userBId, achievedAt: new Date() };
            dirty = true;
        }
        if (pair.messages > (doc.mostMessages?.value ?? 0)) {
            doc.mostMessages = { value: pair.messages, userAId, userBId, achievedAt: new Date() };
            dirty = true;
        }
        if (streakCurrent > (doc.longestConversationStreak?.value ?? 0)) {
            doc.longestConversationStreak = { value: streakCurrent, userAId, userBId, achievedAt: new Date() };
            dirty = true;
        }

        if (dirty) await ComboServerRecordsRepository.save(doc);
    } catch (err) {
        Logger.warn(`Failed to check final combo records for guild ${guildId}: ${err}`, CTX);
    }
}
