import type { IComboServerRecords } from "@database/models";
import { ComboServerRecordsRepository } from "@database/repositories";

/**
 * In-memory cache of each guild's server-records document. Record-breaking is rare relative to
 * message volume, so caching avoids a DB read on every message just to compare against the current
 * record — a write only happens when a record is actually broken.
 */
const recordCache = new Map<string, IComboServerRecords>();

export async function getCachedRecords(guildId: string): Promise<IComboServerRecords> {
    let doc = recordCache.get(guildId);
    if (!doc) {
        doc = await ComboServerRecordsRepository.getOrCreate(guildId);
        recordCache.set(guildId, doc);
    }
    return doc;
}
