import type { GuildMember } from "discord.js";
import data from "@shared/data.json";
import messages from "@shared/messages.json";

export type Lang = "en" | "ar";

export function getUserLang(member: GuildMember | null | undefined): Lang {
    if (!member) return "en";
    if (member.roles.cache.has(data.ar_role_id)) return "ar";
    return "en";
}

export function t(path: string, lang: Lang, vars?: Record<string, string>): string {
    const keys = path.split(".");
    let value: unknown = (messages as Record<string, unknown>)[lang];

    for (const k of keys) {
        if (value && typeof value === "object") {
            value = (value as Record<string, unknown>)[k];
        } else {
            return path;
        }
    }

    if (typeof value !== "string") return path;

    if (vars) {
        for (const [k, v] of Object.entries(vars)) {
            value = (value as string).replaceAll(`{${k}}`, v);
        }
    }

    return value as string;
}
