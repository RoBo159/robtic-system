import type { GuildMember, VoiceBasedChannel } from "discord.js";
import type { IVoiceSettings } from "@database/models";
import { isAfk } from "@core/activity";

export type IneligibleReason =
    | "disabled"
    | "afk-channel"
    | "not-tracked"
    | "excluded-channel"
    | "missing-role"
    | "afk";

export interface Eligibility {
    /** Whether this minute counts as active and earns rewards. */
    eligible: boolean;
    reason?: IneligibleReason;
    /** Multiplier to apply to the reward — 1 normally, the alone rate when they are by themselves. */
    multiplier: number;
    /** Humans in the channel, bots excluded. */
    humans: number;
}

const INELIGIBLE = (reason: IneligibleReason): Eligibility => ({ eligible: false, reason, multiplier: 0, humans: 0 });

/**
 * Decides whether a connected member earns this minute, and at what rate.
 *
 * Mute and deafen are deliberately *not* consulted. Someone studying with their mic off is
 * participating; someone with an open mic who walked away an hour ago is not. Presence is measured
 * by whether they have done anything recently, which is what `isAfk` answers.
 *
 * The guild's own AFK channel never earns, whatever the settings say — that channel exists to mean
 * "not here", and honouring it costs nothing.
 */
export async function evaluateEligibility(
    member: GuildMember,
    channel: VoiceBasedChannel,
    settings: IVoiceSettings,
): Promise<Eligibility> {
    if (!settings.enabled) return INELIGIBLE("disabled");

    if (channel.guild.afkChannelId && channel.id === channel.guild.afkChannelId) {
        return INELIGIBLE("afk-channel");
    }

    if (settings.excludedChannelIds.includes(channel.id)) return INELIGIBLE("excluded-channel");

    if (settings.trackedChannelIds.length && !settings.trackedChannelIds.includes(channel.id)) {
        return INELIGIBLE("not-tracked");
    }

    if (settings.allowedRoleIds.length && !settings.allowedRoleIds.some(id => member.roles.cache.has(id))) {
        return INELIGIBLE("missing-role");
    }

    const humans = channel.members.filter(m => !m.user.bot).size;

    if (await isAfk(member.guild.id, member.id, settings.afkTimeoutMinutes * 60_000)) {
        return { eligible: false, reason: "afk", multiplier: 0, humans };
    }

    const alone = humans < settings.minMembersForFullRate;

    return { eligible: true, multiplier: alone ? settings.aloneMultiplier : 1, humans };
}
