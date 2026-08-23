import { normaliseUuid, type ManageStaffResponse, type StaffManagementAction } from "@sdk";
import { Logger } from "@logger";
import { MinecraftLinkRepository, MinecraftRoleStateRepository } from "@database/repositories";
import { mainBotToken } from "../lib/bot-token";

const CTX = "minecraft-api";
const DISCORD_API = "https://discord.com/api/v10";

/**
 * Roster changes: somebody added to staff, promoted, demoted, moved, or removed.
 *
 * <h2>What this owns, and what it does not</h2>
 *
 * It owns the Discord write and the audit trail, because the bot token lives here and the game
 * server has no Discord credential. It does *not* own the ladder: the server has already moved the
 * player's LuckPerms group before calling, because that is what makes somebody staff. This mirrors
 * the outcome and records it.
 *
 * That is the same division {@link StaffRankService} already uses for `/staff promote`. This exists
 * alongside it rather than inside it because the roster commands carry a different audit vocabulary
 * — "hired", "fired", "role changed" — and folding them into the rank service would mean one method
 * with five behaviours selected by a flag.
 *
 * <h2>Unlinked players</h2>
 *
 * Not an error. The plugin refuses to *make* somebody staff without a link, but a roster change on
 * an already-staff player whose link was later removed must still be recorded rather than rejected.
 */
export class StaffRosterService {
    static async apply(input: {
        guildId: string;
        action: StaffManagementAction;
        targetUuid: string;
        targetUsername: string;
        fromRank?: string | null;
        toRank?: string | null;
        grantRoleId?: string;
        revokeRoleIds?: string[];
    }): Promise<ManageStaffResponse> {
        const uuid = normaliseUuid(input.targetUuid);
        const link = await MinecraftLinkRepository.getByUuid(input.guildId, uuid);

        if (link) {
            await this.mirrorToDiscord(input.guildId, link.discordId, input.grantRoleId, input.revokeRoleIds ?? []);

            // Keeps the projection the profile and staff tooling read in step with what was applied.
            await MinecraftRoleStateRepository.upsert({
                guildId: input.guildId,
                discordId: link.discordId,
                minecraftUuid: uuid,
                roleIds: [],
                groups: input.toRank ? [input.toRank] : [],
                reason: `staff-${input.action}`,
            }).catch(error => Logger.error(`Failed to project a roster change: ${error}`, CTX));
        }

        return {
            action: input.action,
            targetUuid: uuid,
            discordId: link?.discordId ?? null,
            fromRank: input.fromRank ?? null,
            toRank: input.toRank ?? null,
        };
    }

    /**
     * Applies the Discord roles the game server resolved.
     *
     * Revokes are attempted before the grant so a promotion never leaves the member briefly holding
     * two ranks, and a failure on any single role is logged rather than thrown — the LuckPerms
     * change has already happened, so failing the whole call here would report a change that did in
     * fact take effect as not having.
     */
    private static async mirrorToDiscord(
        guildId: string,
        discordId: string,
        grantRoleId: string | undefined,
        revokeRoleIds: string[],
    ): Promise<void> {
        const token = mainBotToken();

        if (!token) {
            Logger.warn("No bot token is configured — the Discord side of the roster change was skipped", CTX);
            return;
        }

        for (const roleId of revokeRoleIds) {
            if (roleId && roleId !== grantRoleId) {
                await this.write("DELETE", guildId, discordId, roleId, token);
            }
        }

        if (grantRoleId) {
            await this.write("PUT", guildId, discordId, grantRoleId, token);
        }
    }

    private static async write(
        method: "PUT" | "DELETE",
        guildId: string,
        discordId: string,
        roleId: string,
        token: string,
    ): Promise<void> {
        try {
            const response = await fetch(`${DISCORD_API}/guilds/${guildId}/members/${discordId}/roles/${roleId}`, {
                method,
                headers: { Authorization: `Bot ${token}`, "X-Audit-Log-Reason": "Robtic staff roster change" },
                signal: AbortSignal.timeout(5_000),
            });

            if (response.ok || response.status === 204) return;

            // 403 is the common one and the least obvious: the bot's own role sits below the staff
            // role it is being asked to hand out, which Discord will never allow.
            Logger.warn(
                response.status === 403
                    ? `Discord refused role ${roleId} — the bot's role must sit above the staff roles it manages`
                    : `Discord refused ${method} role ${roleId} for ${discordId}: HTTP ${response.status}`,
                CTX,
            );
        } catch (error) {
            Logger.warn(`Could not reach Discord for a roster change: ${error}`, CTX);
        }
    }
}
