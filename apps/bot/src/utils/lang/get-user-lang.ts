import type { GuildMember } from "discord.js";
import type { Lang } from "@typings/lang";
import { ServerConfig } from "@database/models/ServerConfig";
import { User } from "@database/models/User";

/**
 * Resolves the language to render for a member: an explicit self-service choice (User.preferredLang,
 * set via /profile Settings) always wins; otherwise falls back to the guild's Arabic-role convention;
 * otherwise English.
 */
export async function getUserLang(member: GuildMember | null | undefined): Promise<Lang> {
    if (!member) return "en";

    const user = await User.findOne({ discordId: member.id });
    if (user?.preferredLang) return user.preferredLang;

    const config = await ServerConfig.findOne({ guildId: member.guild.id });
    const arRoleId = config?.roles?.ar;
    if (arRoleId && member.roles.cache.has(arRoleId)) return "ar";
    return "en";
}
