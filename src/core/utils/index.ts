import { SUPPORTED_LANGUAGES } from "@core/config";
import type { GuildMember } from "discord.js";

export function memberLangDetected(member: GuildMember): string {
    const langRole = member.roles.cache.find(role => Object.values(SUPPORTED_LANGUAGES).some(lang => lang.id === role.id));
    if (!langRole) return "en";
    const detectedLang = Object.entries(SUPPORTED_LANGUAGES).find(([_, lang]) => lang.id === langRole.id);
    return detectedLang ? detectedLang[0] : "en";
}

export * from "./status";
export * from "./cooldown";
export * from "./embed";
export * from "./normalize";
export * from "./formatDuration";