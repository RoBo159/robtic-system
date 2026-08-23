import { Logger } from "@logger";
import { MinecraftLinkRepository, MinecraftRoleStateRepository } from "@database/repositories";
import type { RoleSyncPlayer, RoleSyncResult } from "@sdk";
import { mainBotToken } from "../lib/bot-token";
import { DiscordRoleService } from "./discord-role-service";

const CTX = "minecraft-api";
const DISCORD_API = "https://discord.com/api/v10";

/**
 * Applies Discord roles from the LuckPerms groups a game server reported.
 *
 * <h2>Minecraft is the authority</h2>
 *
 * The game server reads LuckPerms locally, decides which Discord roles that implies, and sends the
 * concrete outcome. This service performs the Discord write and nothing else — it holds no copy of
 * the rank ladder, never maps a group to a role itself, and never writes back into Minecraft.
 *
 * That one-directionality is the point. The previous design had Discord computing a group delta
 * which the plugin then applied, so both sides wrote the same state and could disagree; whichever
 * ran last won, and a role removed in Discord could reappear from a stale group and vice versa.
 * With a single writer there is no loop to suppress.
 *
 * <h2>Unlinked players</h2>
 *
 * A player with no Discord link is skipped, not failed. Playing without a Discord account is
 * ordinary, and there is no action a game server could take in response to being told about it.
 */
export class RoleSyncService {
    /**
     * Applies one batch.
     *
     * Players are processed sequentially rather than in parallel: each grant or revoke is a
     * separate Discord call, and firing a whole server's worth at once is exactly how a bot hits a
     * 429. A batch is a background reconciliation, so the latency does not matter.
     */
    static async apply(guildId: string, players: RoleSyncPlayer[]): Promise<RoleSyncResult[]> {
        const token = mainBotToken();

        if (!token) {
            Logger.warn("No bot token is configured — Discord roles cannot be applied from Minecraft", CTX);
            return players.map(player => ({
                uuid: player.uuid,
                linked: false,
                granted: [],
                revoked: [],
                error: "the API has no Discord bot token configured",
            }));
        }

        const results: RoleSyncResult[] = [];

        for (const player of players) {
            results.push(await this.applyOne(guildId, player, token));
        }

        return results;
    }

    private static async applyOne(guildId: string, player: RoleSyncPlayer, token: string): Promise<RoleSyncResult> {
        const link = await MinecraftLinkRepository.getByUuid(guildId, player.uuid);

        if (!link) {
            return { uuid: player.uuid, linked: false, granted: [], revoked: [] };
        }

        const granted: string[] = [];
        const revoked: string[] = [];
        let failure: string | undefined;

        for (const roleId of player.grantRoleIds) {
            const error = await this.write("PUT", guildId, link.discordId, roleId, token);
            if (error) failure ??= error;
            else granted.push(roleId);
        }

        for (const roleId of player.revokeRoleIds) {
            const error = await this.write("DELETE", guildId, link.discordId, roleId, token);
            if (error) failure ??= error;
            else revoked.push(roleId);
        }

        // The projection records what the game server observed, so `/api/discord/roles` and the
        // staff tooling can answer "what groups does this player hold?" without asking the server.
        await MinecraftRoleStateRepository.upsert({
            guildId,
            discordId: link.discordId,
            minecraftUuid: player.uuid,
            roleIds: (await DiscordRoleService.rolesOf(guildId, link.discordId)) ?? [],
            groups: player.groups,
            reason: "luckperms-sync",
        });

        // The member's role list just changed, so anything holding the cached copy must not keep
        // serving the pre-change answer for the rest of the TTL.
        if (granted.length > 0 || revoked.length > 0) {
            DiscordRoleService.invalidate(guildId, link.discordId);
        }

        return { uuid: player.uuid, linked: true, granted, revoked, error: failure };
    }

    /**
     * One role write. Returns an error string rather than throwing, so a single refused role does
     * not abandon the rest of the batch.
     */
    private static async write(
        method: "PUT" | "DELETE",
        guildId: string,
        discordId: string,
        roleId: string,
        token: string,
    ): Promise<string | null> {
        try {
            const response = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${discordId}/roles/${roleId}`, {
                method,
                headers: { Authorization: `Bot ${token}` },
                signal: AbortSignal.timeout(5_000),
            });

            if (response.ok || response.status === 204) return null;

            // 403 is by far the most common and the least obvious: the bot's highest role sits
            // below the one it is being asked to hand out, and Discord will never allow that.
            if (response.status === 403) {
                const message = `Discord refused role ${roleId} — the bot's own role must sit above it`;
                Logger.warn(message, CTX);
                return message;
            }

            const message = `Discord refused role ${roleId} for ${discordId}: HTTP ${response.status}`;
            Logger.warn(message, CTX);
            return message;
        } catch (error) {
            const message = `Could not reach Discord to apply role ${roleId}: ${error}`;
            Logger.warn(message, CTX);
            return message;
        }
    }
}
