import type { Guild } from "discord.js";
import { ActivityRepository, PeriodicStatRepository } from "@database/repositories";
import { randomXP, applyXpGain } from "@bot/services/community/xp";
import { awardVoicePoint } from "@core/points";
import { Logger } from "@logger";

const CTX = "voice";

/**
 * Awards one tick's worth of XP and Points for time spent in voice.
 *
 * Voice feeds the *existing* level system — same randomXP range, same level maths, same rewards
 * and announcement — so a level is a level however it was earned. It writes through
 * `addNonMessageXP` rather than `addXP` so voice time does not inflate the message counters.
 *
 * The message-XP cooldown and the AI meaningfulness check are deliberately skipped: the tick is
 * already once a minute, and there is no message to judge. Voice has its own gates — AFK, the AFK
 * channel, and the alone multiplier.
 */
export async function grantVoiceXp(
    guild: Guild,
    discordId: string,
    username: string,
    multiplier: number,
    activeMinutes: number,
): Promise<number> {
    const base = randomXP();
    const xp = Math.max(1, Math.round(base * multiplier));

    const record = await ActivityRepository.findOrCreate(discordId, guild.id, username);
    const updated = await ActivityRepository.addNonMessageXP(discordId, guild.id, xp);

    if (!updated) {
        Logger.debug(`Could not add voice XP for ${discordId} in ${guild.id}`, CTX);
        return 0;
    }

    await applyXpGain(discordId, guild.id, username, guild, xp, record.level, updated, CTX);

    // Voice XP is also tracked on its own metric, so "voice XP earned" is answerable without
    // unpicking it from chat XP on the shared counter.
    await PeriodicStatRepository.incrementAllPeriods(guild.id, "voiceXp", discordId, xp);

    await awardVoicePoint(guild.id, discordId, username, activeMinutes).catch(err =>
        Logger.warn(`Could not award voice points to ${discordId} in ${guild.id}: ${err}`, CTX)
    );

    return xp;
}
