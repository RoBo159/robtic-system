import { ApiError, normaliseUuid } from "@sdk";
import { MinecraftLinkRepository, MinecraftRoleStateRepository } from "@database/repositories";
import { Logger } from "@logger";
import { mainBotToken } from "../lib/bot-token";

const CTX = "robtic-api";
const DISCORD_API = "https://discord.com/api/v10";

function botToken(): string | null {
    return mainBotToken();
}

/**
 * Applies a rank change decided by the game server.
 *
 * <h2>Who decides what</h2>
 *
 * The ladder lives in the game server's roles.yml, so the server is what knows that Moderator sits
 * above Helper and which Discord role each one is. It walks its own ladder and sends the concrete
 * outcome: grant this role, revoke that one. This service does not re-derive any of it — an API
 * copy of the ladder is exactly the duplication this design removed.
 *
 * What it does own is the Discord write, because the bot token lives here and the game server has
 * no Discord credentials of its own. Discord remains the record of who holds a rank; roles.yml
 * remains the record of what a rank is.
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
    }): Promise<{ username: string; discordId: string; from: string | null; to: string | null }> {
        const uuid = normaliseUuid(input.uuid);

        const link = await MinecraftLinkRepository.getByUuid(input.guildId, uuid);
        if (!link) throw ApiError.notLinked();

        if (!input.grantRoleId && !input.revokeRoleId) {
            throw ApiError.validation({ rank: "there is nothing to change" });
        }

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
