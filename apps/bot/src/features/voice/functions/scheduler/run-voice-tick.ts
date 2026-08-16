import type { Client, Guild, GuildMember, VoiceBasedChannel } from "discord.js";
import { PeriodicStatRepository, VoiceSettingsRepository } from "@database/repositories";
import { isFeatureEnabled } from "@core/features";
import { publishMetric } from "@core/metrics";
import { VOICE_CONFIG } from "@constants";
import { Logger } from "@logger";
import { getSession, startSession } from "../session-store";
import { evaluateEligibility } from "../evaluate-eligibility";
import { grantVoiceXp } from "../grant-voice-xp";

const CTX = "voice";
const TICK_SECONDS = VOICE_CONFIG.tickIntervalMs / 1000;
const TICK_MINUTES = TICK_SECONDS / 60;

/**
 * Evaluates every connected member once per interval.
 *
 * Works from the gateway's voice state cache rather than from stored sessions, so a member who was
 * already connected when the bot started is picked up on the first tick — a restart costs at most
 * one interval, not the rest of their evening.
 *
 * Connected time accrues for anyone in a channel; active time and rewards only for members who
 * pass the eligibility rules. The two are tracked separately so "how long were you in voice" and
 * "how long were you actually participating" stay different questions.
 */
export async function runVoiceTick(client: Client): Promise<void> {
    for (const [, guild] of client.guilds.cache) {
        try {
            if (!(await isFeatureEnabled(guild.id, "voice"))) continue;

            const settings = await VoiceSettingsRepository.getCached(guild.id);
            if (!settings.enabled) continue;

            await tickGuild(guild, settings);
        } catch (err) {
            Logger.warn(`Voice tick failed for ${guild.id}: ${err}`, CTX);
        }
    }
}

async function tickGuild(guild: Guild, settings: Awaited<ReturnType<typeof VoiceSettingsRepository.getCached>>): Promise<void> {
    for (const [, state] of guild.voiceStates.cache) {
        const channel = state.channel;
        const member = state.member;

        if (!channel || !member || member.user.bot) continue;

        const session = getSession(guild.id, member.id)
            ?? await startSession(guild.id, member.id, member.user.username, channel.id);
        if (!session) continue;

        session.lastTickAt = Date.now();
        session.connectedSeconds += TICK_SECONDS;
        session.dirty = true;

        const eligibility = await evaluateEligibility(member as GuildMember, channel as VoiceBasedChannel, settings);
        if (!eligibility.eligible) continue;

        session.activeSeconds += TICK_SECONDS;

        const xp = await grantVoiceXp(guild, member.id, member.user.username, eligibility.multiplier, TICK_MINUTES);
        session.xpEarned += xp;

        // Active seconds, not connected — the voice-time leaderboards rank participation.
        await PeriodicStatRepository.incrementAllPeriods(guild.id, "voiceTime", member.id, TICK_SECONDS);
        publishMetric({
            guildId: guild.id,
            discordId: member.id,
            username: member.user.username,
            metric: "voiceTime",
            value: TICK_SECONDS,
        });
    }
}
