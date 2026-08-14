import type { Guild, Role } from "discord.js";
import { BRANCH_CONFIG } from "@config";

export const PARTNER_ROLE_NAME = BRANCH_CONFIG.partnership.roleName;

export async function ensurePartnerRole(guild: Guild): Promise<Role> {
    const existing = guild.roles.cache.find(
        (r) => r.name.toLowerCase() === PARTNER_ROLE_NAME.toLowerCase()
    );
    if (existing) return existing;

    return guild.roles.create({
        name: PARTNER_ROLE_NAME,
        mentionable: true,
        reason: "Auto-created standard partner role",
    });
}
