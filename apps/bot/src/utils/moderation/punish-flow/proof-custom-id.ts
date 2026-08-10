import type { PunishType, PunishCustomIdParts } from "@typings/punishment";
import { PUNISH_CUSTOM_ID_SEGMENTS, PUNISH_EXTRA_NONE } from "@constants";

// Kept short — a Discord customId caps at 100 chars and this packs five IDs/slugs into one string.
export function proofModalCustomId(
    type: PunishType,
    guildId: string,
    targetId: string,
    reasonKey: string,
    moderatorId: string,
    extra = PUNISH_EXTRA_NONE,
): string {
    return `punish_proof_${type}_${guildId}_${targetId}_${reasonKey}_${moderatorId}_${extra}`;
}

export function parseProofCustomId(customId: string): PunishCustomIdParts | null {
    const parts = customId.split("_");
    if (parts.length < PUNISH_CUSTOM_ID_SEGMENTS) return null;
    const [, , type, guildId, targetId, reasonKey, moderatorId, extra] = parts;
    return { type: type as PunishType, guildId, targetId, reasonKey, moderatorId, extra: extra ?? PUNISH_EXTRA_NONE };
}
