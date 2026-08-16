import type { Message } from "discord.js";
import { StreakRepository, StreakSettingsRepository } from "@database/repositories";
import { Logger } from "@logger";
import { awardStreakPoint } from "@core/points";
import { publishMetric } from "@core/metrics";
import { isClaimable, isStreakExpired } from "../lib";
import { applyStreakRole } from "../utils/streak-role";
import { isValidStreakMessage } from "./is-valid-streak-message";
import { sendStreakReply } from "./send-streak-reply";
import { sendStreakDM } from "./send-streak-dm";
import { announceStreakRewards } from "./announce-streak-rewards";

const CTX = "main:streak";

/**
 * Advances a member's streak from one qualifying message.
 *
 * Streaks only count in channels the guild listed, and an empty list means nowhere — unlike XP or
 * message stats, a streak channel is a deliberate choice, so no configuration means the feature
 * does nothing rather than counting everywhere.
 */
export async function processStreakMessage(message: Message): Promise<void> {
    if (!message.guild) return;
    if (message.author.bot || message.webhookId) return;

    const guildId = message.guild.id;
    const settings = await StreakSettingsRepository.get(guildId);
    if (!settings || settings.channels.length === 0) return;
    if (!settings.channels.includes(message.channel.id)) return;

    const record = await StreakRepository.findOrCreate(message.author.id, guildId, message.author.username);

    // Frozen while staff can still give the old streak back. Deliberately silent — the member is
    // told nothing here; `?streak` is where they see the pending state. Replying would turn every
    // message during the window into spam, and announcing it invites arguing in the channel.
    if (record.pendingReturnUntil && record.pendingReturnUntil.getTime() > Date.now()) return;

    if (!isValidStreakMessage(message, settings, record)) return;

    const isFreshStart = record.currentStreak === 0;

    if (!isFreshStart && !isClaimable(record.lastIncrement, settings.claimDays)) return;

    const broken = !isFreshStart && isStreakExpired(record.lastIncrement, settings.expireDays);
    const newCurrent = isFreshStart || broken ? 1 : record.currentStreak + 1;
    const newBest = Math.max(record.bestStreak, newCurrent);

    const updated = await StreakRepository.applyIncrement(
        message.author.id,
        guildId,
        newCurrent,
        newBest,
        message.content.trim(),
    );
    if (!updated) return;

    Logger.debug(`${message.author.username} (${message.author.id}) streak → ${newCurrent} (best ${newBest})`, CTX);

    const member = message.member ?? await message.guild.members.fetch(message.author.id).catch(() => null);
    if (member) {
        await applyStreakRole(member, newCurrent).catch(err =>
            Logger.warn(`Failed to apply streak role for ${message.author.id} in ${guildId}: ${err}`, CTX)
        );
    }

    // The streak reached, not the increment — a streak is a level, so its missions use `max`.
    publishMetric({
        guildId,
        discordId: message.author.id,
        username: message.author.username,
        metric: "streak",
        value: updated.currentStreak,
    });

    await sendStreakReply(message, updated, settings);
    await sendStreakDM(message.author, updated);
    await announceStreakRewards(message.guild, message.author, guildId, updated.currentStreak);

    try {
        const earned = await awardStreakPoint(guildId, message.author.id, message.author.username, updated.currentStreak);
        if (earned > 0) {
            publishMetric({
                guildId,
                discordId: message.author.id,
                username: message.author.username,
                metric: "pointsEarned",
                value: earned,
            });
        }
    } catch (err) {
        Logger.warn(`Failed to award streak points for ${message.author.id} in ${guildId}: ${err}`, CTX);
    }
}
