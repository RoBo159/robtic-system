import { GlobalConfigRepository } from "@database/repositories";

/** GlobalConfig key holding the guild that hosts admin-scoped commands (see `!admin-guild`). */
const ADMIN_GUILD_KEY = "adminGuildId";

export async function getAdminGuildId(): Promise<string | null> {
    return GlobalConfigRepository.get(ADMIN_GUILD_KEY);
}

/**
 * Persists the admin guild. Caller must already be authorized, must have validated the id, and is
 * responsible for emptying the previous route and re-registering — see setAdminGuild.
 */
export async function storeAdminGuildId(guildId: string | null): Promise<void> {
    if (!guildId) {
        await GlobalConfigRepository.delete(ADMIN_GUILD_KEY);
        return;
    }
    await GlobalConfigRepository.set(ADMIN_GUILD_KEY, guildId);
}
