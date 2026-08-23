import { ApiError, normaliseUuid } from "@sdk";
import { MinecraftLinkRepository, MinecraftRoleStateRepository } from "@database/repositories";
import { Logger } from "@logger";
import { mainBotToken } from "../lib/bot-token";

const CTX = "minecraft-api";
const DISCORD_API = "https://discord.com/api/v10";

function botToken(): string | null {
    return mainBotToken();
}

/**
 * Records a rank change the game server has already made, and mirrors it onto Discord.
 *
 * <h2>Who decides what</h2>
 *
 * The rank is a LuckPerms group, and the game server has already moved the player into it before
 * calling. The ladder lives in that server's roles.yml, so the server is what knows Moderator sits
 * above Helper. This service re-derives none of it.
 *
 * What it owns is the Discord write, because the bot token lives here and the game server has no
 * Discord credentials of its own. Discord is a mirror of the group, never the source of it — which
 * is why an unlinked player and a rank with no Discord role are both handled rather than refused.
 */
export class StaffRankService {
    static async apply(input: {
        guildId: string;
        uuid: string;
        direction: "promote" | "demote";
        /** Role to add, or null when demoting off the bottom rung. */
        grantRoleId: string | null;
        /** Role to remove, or null when promoting someone who held no rank. */
        revokeRoleId: string | null;
        /** Display names, for the audit line and the message shown in game. */
        from: string | null;
        to: string | null;
    }): Promise<{ username: string; discordId: string | null; from: string | null; to: string | null }> {
        const uuid = normaliseUuid(input.uuid);

        /**
         * A missing link is no longer a failure.
         *
         * The rank has already changed by the time this is called — the game server moved the
         * player's LuckPerms group, which is what a rank *is*. This call records that and mirrors
         * it onto Discord where there is a Discord account to mirror onto. Throwing here would fail
         * a promotion that has, in every sense that matters, already succeeded.
         */
        const link = await MinecraftLinkRepository.getByUuid(input.guildId, uuid);

        if (!link) {
            return { username: uuid, discordId: null, from: input.from, to: input.to };
        }

        // Nothing to mirror is ordinary: roles.yml allows a rank with no Discord role at all.
        if (input.grantRoleId) await this.applyRole("PUT", input.guildId, link.discordId, input.grantRoleId);
        if (input.revokeRoleId) await this.applyRole("DELETE", input.guildId, link.discordId, input.revokeRoleId);

        const state = await MinecraftRoleStateRepository.getByDiscordId(input.guildId, link.discordId);
        const roleIds = (state?.roleIds ?? []).filter(id => id !== input.revokeRoleId);
        if (input.grantRoleId && !roleIds.includes(input.grantRoleId)) {
            roleIds.push(input.grantRoleId);
        }

        await MinecraftRoleStateRepository.upsert({
            guildId: input.guildId,
            discordId: link.discordId,
            minecraftUuid: uuid,
            roleIds,
            groups: state?.groups ?? [],
            reason: input.direction,
        }).catch(error => Logger.error(`Failed to project rank change: ${error}`, CTX));

        return {
            username: link.minecraftUsername,
            discordId: link.discordId,
            from: input.from,
            to: input.to,
        };
    }

    /** Adds or removes one Discord role. Failures are surfaced — a silent no-op would mislead. */
    private static async applyRole(
        method: "PUT" | "DELETE",
        guildId: string,
        discordId: string,
        roleId: string,
    ): Promise<void> {
        const token = botToken();
        if (!token) throw ApiError.internal("No bot token is configured, so Discord roles cannot be changed");

        const response = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${discordId}/roles/${roleId}`, {
            method,
            headers: { Authorization: `Bot ${token}`, "X-Audit-Log-Reason": "Robtic in-game rank change" },
        });

        if (!response.ok) {
            const detail = await response.text().catch(() => "");
            Logger.error(`Discord refused ${method} role ${roleId} for ${discordId}: ${response.status} ${detail}`, CTX);

            throw response.status === 403
                ? ApiError.forbidden(
                      "Discord refused the role change — move the bot's role above the staff roles it manages",
                  )
                : ApiError.upstream(`Discord rejected the role change (${response.status})`);
        }
    }
}
