import type { GuildMember } from "discord.js";
import { StreakRepository } from "@database/repositories";
import { handleError, BotError } from "@core/handlers";
import { isFeatureEnabled } from "@core/features";
import { applyStreakRole } from "../utils/streak-role";

/**
 * A timeout ends the streak: it marks a member who cannot participate, and letting the streak
 * survive would reward waiting the punishment out. Only the transition into timeout counts, so a
 * role change on an already-muted member is ignored.
 */
export async function onTimeoutReset(oldMember: GuildMember, newMember: GuildMember): Promise<void> {
    const wasTimedOut = (oldMember.communicationDisabledUntilTimestamp ?? 0) > Date.now();
    const isTimedOut = (newMember.communicationDisabledUntilTimestamp ?? 0) > Date.now();
    if (wasTimedOut || !isTimedOut) return;

    if (!(await isFeatureEnabled(newMember.guild.id, "streak"))) return;

    try {
        const record = await StreakRepository.find(newMember.id, newMember.guild.id);
        if (!record || !record.active) return;

        await StreakRepository.expire(newMember.id, newMember.guild.id);
        await applyStreakRole(newMember, 0);
    } catch (err) {
        handleError(new BotError(`Failed to reset streak on timeout: ${err}`, "EVENT"), "main/streak-timeout-reset");
    }
}
