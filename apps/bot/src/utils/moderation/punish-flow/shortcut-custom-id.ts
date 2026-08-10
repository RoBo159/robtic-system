import type { PunishType, PunishCustomIdParts } from "@typings/punishment";
import { PUNISH_CUSTOM_ID_SEGMENTS, PUNISH_EXTRA_NONE } from "@constants";

export function shortcutButtonCustomId(
    type: PunishType,
    guildId: string,
    targetId: string,
    reasonKey: string,
    moderatorId: string,
    extra = PUNISH_EXTRA_NONE,
): string {
    return `punish_shortcut_${type}_${guildId}_${targetId}_${reasonKey}_${moderatorId}_${extra}`;
}

export function parseShortcutButtonCustomId(customId: string): PunishCustomIdParts | null {
    const parts = customId.split("_");
    if (parts.length < PUNISH_CUSTOM_ID_SEGMENTS) return null;
    const [, , type, guildId, targetId, reasonKey, moderatorId, extra] = parts;
    return { type: type as PunishType, guildId, targetId, reasonKey, moderatorId, extra: extra ?? PUNISH_EXTRA_NONE };
}
