import type { GuildMember } from "discord.js";
import { StreakSettingsRepository } from "@database/repositories";
import { handleError, BotError } from "@core/handlers";
import { isFeatureEnabled } from "@core/features";
import { breakStreak } from "./break-streak";

/**
 * A timeout ends the streak, when the guild has asked for that.
 *
 * This one listener covers every punishment that silences someone: `/mute`, `/jail` and the warn
 * auto-mute are all implemented as Discord timeouts, so there is nothing separate to hook for them.
 *
 * Only the transition *into* timeout counts, so re-applying a role to an already-muted member does
 * not re-break a streak they no longer have.
 */
export async function onTimeoutReset(oldMember: GuildMember, newMember: GuildMember): Promise<void> {
    const wasTimedOut = (oldMember.communicationDisabledUntilTimestamp ?? 0) > Date.now();
    const isTimedOut = (newMember.communicationDisabledUntilTimestamp ?? 0) > Date.now();
    if (wasTimedOut || !isTimedOut) return;

    if (!(await isFeatureEnabled(newMember.guild.id, "streak"))) return;

    try {
        const settings = await StreakSettingsRepository.get(newMember.guild.id);
        if (!(settings?.breakOnTimeout ?? true)) return;

        await breakStreak(newMember, "timeout");
    } catch (err) {
        handleError(new BotError(`Failed to reset streak on timeout: ${err}`, "EVENT"), "main/streak-timeout-reset");
    }
}
