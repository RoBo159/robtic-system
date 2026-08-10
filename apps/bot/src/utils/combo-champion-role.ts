import type { Guild } from "discord.js";
import { ComboSettingsRepository } from "@database/repositories";
import { Logger } from "@logger";

const CTX = "main:combo-champion-role";

/**
 * Moves the configured Champion role to whoever currently holds the highest active combo score
 * (ties are all awarded the role, per combo.md). Uses the cached members collection on the role
 * (no extra fetch-all-members call) and only issues add/remove calls for the delta, to stay within
 * Discord rate limits even on servers with many concurrently active combos.
 */
export async function syncChampionRole(guild: Guild, scoreByUser: Map<string, number>): Promise<void> {
    try {
        const settings = await ComboSettingsRepository.get(guild.id);
        const roleId = settings?.championRoleId;
        if (!roleId) return;

        const role = guild.roles.cache.get(roleId);
        if (!role) return;

        let topScore = 0;
        for (const score of scoreByUser.values()) {
            if (score > topScore) topScore = score;
        }

        const shouldHold = new Set<string>();
        if (topScore > 0) {
            for (const [userId, score] of scoreByUser) {
                if (score === topScore) shouldHold.add(userId);
            }
        }

        for (const [userId, member] of role.members) {
            if (!shouldHold.has(userId)) {
                await member.roles.remove(role).catch(() => null);
            }
        }

        for (const userId of shouldHold) {
            if (role.members.has(userId)) continue;
            const member = await guild.members.fetch(userId).catch(() => null);
            if (member) await member.roles.add(role).catch(() => null);
        }
    } catch (err) {
        Logger.warn(`Failed to sync champion role for guild ${guild.id}: ${err}`, CTX);
    }
}
