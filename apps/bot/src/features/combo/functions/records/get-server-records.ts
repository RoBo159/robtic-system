import type { IComboServerRecords } from "@database/models";
import { getCachedRecords } from "./record-cache";

export async function getServerRecords(guildId: string): Promise<IComboServerRecords> {
    return getCachedRecords(guildId);
}
