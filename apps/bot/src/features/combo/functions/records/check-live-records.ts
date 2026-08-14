import type { ICombo } from "@database/models";
import { ComboServerRecordsRepository } from "@database/repositories";
import { Logger } from "@logger";
import { getCachedRecords } from "./record-cache";

const CTX = "main:combo-records";

/** Checks records that can be broken mid-conversation (score, heat) — called on every qualifying message; cheap in the common case. */
export async function checkLiveRecords(guildId: string, pair: ICombo, userAId: string, userBId: string): Promise<void> {
    try {
        const doc = await getCachedRecords(guildId);
        let dirty = false;

        if (pair.currentScore > (doc.highestComboEver?.value ?? 0)) {
            doc.highestComboEver = { value: pair.currentScore, userAId, userBId, achievedAt: new Date() };
            dirty = true;
        }
        if (pair.heat > (doc.highestHeat?.value ?? 0)) {
            doc.highestHeat = { value: pair.heat, userAId, userBId, achievedAt: new Date() };
            dirty = true;
        }

        if (dirty) await ComboServerRecordsRepository.save(doc);
    } catch (err) {
        Logger.warn(`Failed to check live combo records for guild ${guildId}: ${err}`, CTX);
    }
}
