import { EmbedBuilder, type Guild, type User } from "discord.js";
import { COLORS } from "@constants";
import { VoiceRepository, PeriodicStatRepository } from "@database/repositories";
import { formatVoiceDuration } from "./format-duration";
import { getSession } from "../functions/session-store";

/**
 * One member's voice standing.
 *
 * Period figures come from PeriodicStat — the same store every other period leaderboard reads —
 * and the open session is folded in from memory so the numbers include the call they are in right
 * now rather than lagging until they disconnect.
 */
export async function buildVoiceEmbed(guild: Guild, user: User): Promise<EmbedBuilder> {
    const [stat, daily, weekly, monthly, rank] = await Promise.all([
        VoiceRepository.getStat(guild.id, user.id),
        PeriodicStatRepository.getValue(guild.id, "daily", "voiceTime", user.id),
        PeriodicStatRepository.getValue(guild.id, "weekly", "voiceTime", user.id),
        PeriodicStatRepository.getValue(guild.id, "monthly", "voiceTime", user.id),
        VoiceRepository.getRankByActiveTime(guild.id, user.id),
    ]);

    const live = getSession(guild.id, user.id);
    const totalConnected = (stat?.totalConnectedSeconds ?? 0) + (live?.connectedSeconds ?? 0);
    const totalActive = (stat?.totalActiveSeconds ?? 0) + (live?.activeSeconds ?? 0);
    const totalXp = (stat?.totalXpEarned ?? 0) + (live?.xpEarned ?? 0);

    return new EmbedBuilder()
        .setTitle(`🎙️ Voice activity — ${user.username}`)
        .setColor(COLORS.activity)
        .setThumbnail(user.displayAvatarURL({ size: 256 }))
        .addFields(
            { name: "Today", value: formatVoiceDuration(daily), inline: true },
            { name: "This week", value: formatVoiceDuration(weekly), inline: true },
            { name: "This month", value: formatVoiceDuration(monthly), inline: true },
            { name: "Total connected", value: formatVoiceDuration(totalConnected), inline: true },
            { name: "Total active", value: formatVoiceDuration(totalActive), inline: true },
            { name: "Voice XP", value: `${totalXp}`, inline: true },
            { name: "Sessions", value: `${stat?.sessionCount ?? 0}`, inline: true },
            { name: "Average session", value: formatVoiceDuration(VoiceRepository.averageSessionSeconds(stat)), inline: true },
            { name: "Longest session", value: formatVoiceDuration(stat?.longestSessionSeconds ?? 0), inline: true },
            { name: "Rank by active time", value: rank > 0 ? `#${rank}` : "Unranked", inline: true },
            ...(live ? [{ name: "In voice now", value: formatVoiceDuration(live.connectedSeconds), inline: true }] : []),
        )
        .setFooter({ text: "Active time is time spent participating — AFK and the AFK channel don't count." })
        .setTimestamp();
}
