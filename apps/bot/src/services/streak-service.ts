import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    type Guild,
    type Message,
    type TextChannel,
    type User,
} from "discord.js";
import { StreakRepository, StreakSettingsRepository, StreakRewardRepository, StreakRewardClaimRepository } from "@database/repositories";
import type { IStreak, IStreakSettings } from "@database/models";
import { COLORS, STREAK_CONFIG } from "@constants";
import { Logger } from "@logger";
import { isAcceptableMessage } from "@utils";
import { isClaimable } from "@core/streak/is-claimable";
import { isStreakExpired } from "@core/streak/is-streak-expired";
import { nextClaimAt } from "@core/streak/next-claim-at";
import { streakExpiresAt } from "@core/streak/streak-expires-at";
import { getLogChannel } from "@bot/utils/server-log";
import { awardStreakCoin } from "@core/coins";
import { applyStreakRole } from "../utils/streak-role";
import { t, type Lang } from "@bot/utils/lang";

const CTX = "main:streak";

function isValidStreakMessage(message: Message, settings: IStreakSettings, record: IStreak): boolean {
    if (message.author.bot || message.webhookId) return false;

    const trimmed = message.content.trim();
    if (!isAcceptableMessage(trimmed, settings.minMessageLength)) return false;

    const isDuplicate = trimmed.toLowerCase() === record.lastMessageContent.trim().toLowerCase();
    const withinDuplicateWindow = Date.now() - record.lastMessageAt.getTime() < STREAK_CONFIG.duplicateWindowMs;
    if (isDuplicate && withinDuplicateWindow) return false;

    return true;
}

export interface StreakSummary {
    record: IStreak;
    rank: number;
    bestRank: number;
    /** Milliseconds remaining before the next streak claim is available. 0 if claimable now. */
    nextClaimMs: number;
    /** Milliseconds remaining until the streak expires, or null if there's no active streak. */
    expiresInMs: number | null;
}

export async function getStreakSummary(discordId: string, guildId: string, username: string): Promise<StreakSummary> {
    const record = await StreakRepository.findOrCreate(discordId, guildId, username);
    const rank = await StreakRepository.getRank(discordId, guildId);
    const bestRank = await StreakRepository.getBestRank(discordId, guildId);

    const nextClaimMs = record.active ? Math.max(0, nextClaimAt(record.lastIncrement).getTime() - Date.now()) : 0;
    const expiresInMs = record.active ? Math.max(0, streakExpiresAt(record.lastIncrement).getTime() - Date.now()) : null;

    return { record, rank, bestRank, nextClaimMs, expiresInMs };
}

export async function processStreakMessage(message: Message): Promise<void> {
    if (!message.guild) return;
    if (message.author.bot || message.webhookId) return;

    const guildId = message.guild.id;
    const settings = await StreakSettingsRepository.get(guildId);
    if (!settings || settings.channels.length === 0) return;
    if (!settings.channels.includes(message.channel.id)) return;

    const record = await StreakRepository.findOrCreate(message.author.id, guildId, message.author.username);

    if (!isValidStreakMessage(message, settings, record)) return;

    const isFreshStart = record.currentStreak === 0;

    if (!isFreshStart && !isClaimable(record.lastIncrement)) return;

    const broken = !isFreshStart && isStreakExpired(record.lastIncrement);
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

    await sendPublicReply(message, updated);
    await sendStreakDM(message.author, updated);
    await checkStreakRewards(message.guild, message.author, guildId, updated.currentStreak);
    await awardStreakCoin(guildId, message.author.id, message.author.username, updated.currentStreak).catch(err =>
        Logger.warn(`Failed to award streak coins for ${message.author.id} in ${guildId}: ${err}`, CTX)
    );
}

/** `<=` (not `===`) so a streak jump from /streak-config sync|return still catches up on skipped thresholds; the unique index stops repeat announcements. */
async function checkStreakRewards(guild: Guild, user: User, guildId: string, currentStreak: number): Promise<void> {
    const rewards = await StreakRewardRepository.list(guildId);
    const eligible = rewards.filter(r => r.threshold <= currentStreak);
    if (!eligible.length) return;

    for (const reward of eligible) {
        const created = await StreakRewardClaimRepository.tryCreateNotification(guildId, user.id, reward.threshold);
        if (!created) continue;

        const logChannel = await getLogChannel(guild.client, "rewards_log") as TextChannel | null;
        if (!logChannel) continue;

        const embed = new EmbedBuilder()
            .setTitle("🎁 مكافأة تتابع جديدة!")
            .setColor(COLORS.activity)
            .setDescription(`<@${user.id}> وصل إلى **${reward.threshold}** يوم تتابع متواصل! 🔥\nالمكافأة: ${reward.offer}`)
            .setTimestamp();

        const button = new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder()
                .setCustomId(`streak_reward_claim_${user.id}_${reward.threshold}`)
                .setLabel("مطالبة بالمكافأة")
                .setStyle(ButtonStyle.Success)
                .setEmoji("🎁"),
        );

        await logChannel.send({ embeds: [embed], components: [button] }).catch(err =>
            Logger.error(`Failed to post streak reward announcement for ${user.id} (threshold ${reward.threshold}): ${err}`, CTX)
        );
    }
}

async function sendPublicReply(message: Message, streak: IStreak): Promise<void> {
    if (!message.channel.isSendable()) return;

    const reply = await message
        .reply(`🔥 التتابع ${streak.currentStreak}!\n\nعُد غداً لمواصلة تتابعك.`)
        .catch(() => null);
    if (!reply) return;

    setTimeout(() => {
        reply.delete().catch(() => null);
    }, STREAK_CONFIG.autoDeleteMs);
}

export type LeaderboardMode = "current" | "best";

export async function getLeaderboard(guildId: string, mode: LeaderboardMode, limit = 5): Promise<IStreak[]> {
    return mode === "current"
        ? StreakRepository.getCurrentLeaderboard(guildId, limit)
        : StreakRepository.getBestLeaderboard(guildId, limit);
}

export function buildLeaderboardEmbed(guildName: string, mode: LeaderboardMode, records: IStreak[], lang: Lang): EmbedBuilder {
    const lines = records.length
        ? records.map((r, i) => `**${i + 1}.** <@${r.discordId}> — ${mode === "current" ? r.currentStreak : r.bestStreak} 🔥`).join("\n")
        : t("streakTop.no_entries", lang);

    return new EmbedBuilder()
        .setTitle(t(mode === "current" ? "streakTop.title_current" : "streakTop.title_best", lang, { guild: guildName }))
        .setDescription(lines)
        .setColor(COLORS.activity)
        .setFooter({ text: guildName })
        .setTimestamp();
}

async function sendStreakDM(user: User, streak: IStreak): Promise<void> {
    const embed = new EmbedBuilder()
        .setTitle("🔥 تم تحديث التتابع اليومي!")
        .addFields(
            { name: "التتابع الحالي", value: `${streak.currentStreak}`, inline: true },
            { name: "أفضل تتابع", value: `${streak.bestStreak}`, inline: true },
        )
        .setDescription("التتابع القادم متاح غداً.")
        .setColor(COLORS.activity)
        .setTimestamp();

    await user.send({ embeds: [embed] }).catch(() => null);
}
