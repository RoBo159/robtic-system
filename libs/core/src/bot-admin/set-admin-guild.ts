import { Routes } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { Logger } from "@logger";
import { getAdminGuildId, storeAdminGuildId } from "./admin-guild";

export interface SetAdminGuildResult {
    ok: boolean;
    /** Populated when `ok` is false. */
    error?: string;
    /** How many admin-scoped commands were published to the new guild. */
    registered?: number;
}

/**
 * Points admin-scoped commands at a new guild, or clears the setting when `guildId` is null.
 *
 * Emptying the old route first is not optional. `rest.put` replaces one route's command list, so a
 * route that simply stops being written keeps its stale commands forever — switching admin guilds
 * without this would leave `/system` and `/whitelist` permanently visible in the old server.
 *
 * Re-registration goes through the client directly rather than ClientManager.reload(): nothing on
 * disk changed, and a reload would needlessly re-import every module.
 */
export async function setAdminGuild(client: BotClient, guildId: string | null): Promise<SetAdminGuildResult> {
    if (!client.user) return { ok: false, error: "The bot is not ready yet." };

    if (guildId) {
        if (!client.guilds.cache.has(guildId)) {
            return { ok: false, error: `The bot is not in a guild with id \`${guildId}\`. Invite it there first.` };
        }
    }

    const previous = await getAdminGuildId();

    if (previous && previous !== guildId) {
        try {
            await client.rest_().put(Routes.applicationGuildCommands(client.user.id, previous), { body: [] });
            Logger.info(`Cleared admin commands from previous admin guild ${previous}`, client.botName);
        } catch (error) {
            // A guild the bot has since left cannot be cleared, and that is not a reason to refuse
            // the change — the commands are unreachable there anyway.
            Logger.warn(`Could not clear admin commands from ${previous}: ${error}`, client.botName);
        }
    }

    await storeAdminGuildId(guildId);
    await client.registerSlashCommands();

    const registered = [...client.commands.values()].filter(command => command.scope === "admin").length;
    return { ok: true, registered: guildId ? registered : 0 };
}
