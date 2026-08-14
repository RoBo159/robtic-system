import { EmbedBuilder, type Guild } from "discord.js";
import { COLORS, COMBO_CONFIG, type ComboLeaderboardPeriod, type ComboLeaderboardType } from "@constants";
import { formatDuration } from "@utils";
import { ComboSettingsRepository, ComboRepository, ComboUserStatsRepository } from "@database/repositories";
import { getUserHighestCombo } from "@core/combo";
import { getUserComboRank } from "../functions/combo";
import { heatStatusLabel } from "../functions/heat";
import { getFavoritePartner } from "../functions/favorite-partner";
import { getHistoryForUser } from "../functions/history";
import { getLeaderboard } from "../functions/leaderboard";
import { getServerRecords } from "../functions/records";
import { t, type Lang } from "@bot/utils/lang";

export interface ComboTarget {
    id: string;
    username: string;
    avatarUrl: string;
}

const LEADERBOARD_PERIOD_LABELS: Record<ComboLeaderboardPeriod, string> = {
    daily: "يومي",
    weekly: "أسبوعي",
    monthly: "شهري",
    alltime: "كل الأوقات",
};

const LEADERBOARD_TYPE_LABELS: Record<ComboLeaderboardType, string> = {
    combo: "أعلى كومبو",
    streak: "تتابع المحادثة",
    partner: "الشريك المفضل",
};

/** Display-only mapping — the stored/matched level value (COMBO_LEVELS names) stays in English internally. */
const LEVEL_NAME_AR: Record<string, string> = {
    Bronze: "البرونزي",
    Silver: "الفضي",
    Gold: "الذهبي",
    Diamond: "الماسي",
    Legendary: "الأسطوري",
};

function translateLevel(level: string): string {
    return LEVEL_NAME_AR[level] ?? level;
}

function baseEmbed(title: string): EmbedBuilder {
    return new EmbedBuilder().setTitle(title).setColor(COLORS.activity).setTimestamp();
}

async function favoritePartnerLine(guildId: string, userId: string): Promise<string> {
    const stats = await ComboUserStatsRepository.get(guildId, userId);
    const favorite = getFavoritePartner(stats);
    if (!favorite) return "لا يوجد بعد";
    return `<@${favorite.partnerId}> — ${favorite.conversations} محادثة`;
}

export async function buildStatusEmbed(guild: Guild, target: ComboTarget, lang: Lang = "ar"): Promise<EmbedBuilder> {
    const highest = await getUserHighestCombo(guild.id, target.id);
    const rank = await getUserComboRank(guild.id, target.id);
    const activeCombos = await ComboRepository.findActiveForUser(guild.id, target.id);
    const favoriteLine = await favoritePartnerLine(guild.id, target.id);

    const embed = baseEmbed(t("combo.status_title", lang, { username: target.username })).setThumbnail(target.avatarUrl);

    if (highest) {
        embed.addFields(
            { name: t("combo.current_combo", lang), value: `**${highest.pair.currentScore}** مع <@${highest.partnerId}>`, inline: true },
            { name: t("combo.level", lang), value: translateLevel(highest.pair.level), inline: true },
            { name: t("combo.heat", lang), value: `🔥 ${Math.round(highest.pair.heat)}% — ${heatStatusLabel(highest.pair.heat)}`, inline: true },
            { name: t("combo.conversation_streak", lang), value: `${highest.pair.streakCurrent} ${t("combo.days", lang, { best: `${highest.pair.streakBest}` })}`, inline: true },
        );
    } else {
        embed.addFields({ name: t("combo.current_combo", lang), value: t("combo.no_active_combo", lang) });
    }

    embed.addFields(
        { name: "الشريك المفضل", value: favoriteLine, inline: true },
        { name: "الترتيب", value: rank > 0 ? `#${rank}` : "غير مصنف", inline: true },
        { name: "الكومبوهات النشطة", value: `${activeCombos.length}`, inline: true },
    );

    return embed;
}

export async function buildStatisticsEmbed(guild: Guild, target: ComboTarget): Promise<EmbedBuilder> {
    const highest = await getUserHighestCombo(guild.id, target.id);
    const stats = await ComboUserStatsRepository.get(guild.id, target.id);
    const favoriteLine = await favoritePartnerLine(guild.id, target.id);

    const avgCombo = stats && stats.totalConversations > 0 ? Math.round(stats.totalScoreSum / stats.totalConversations) : 0;
    const avgDuration = stats && stats.totalConversations > 0 ? Math.round(stats.totalDurationMs / stats.totalConversations) : 0;

    return baseEmbed(`📊 إحصائيات الكومبو — ${target.username}`)
        .setThumbnail(target.avatarUrl)
        .addFields(
            { name: "الكومبو الحالي", value: highest ? `${highest.pair.currentScore} (${translateLevel(highest.pair.level)})` : "لا يوجد", inline: true },
            { name: "أفضل كومبو", value: stats ? `${stats.bestComboScore}${stats.bestComboPartnerId ? ` مع <@${stats.bestComboPartnerId}>` : ""}` : "لا يوجد", inline: true },
            { name: "الشريك المفضل", value: favoriteLine, inline: true },
            { name: "تتابع المحادثة الحالي", value: highest ? `${highest.pair.streakCurrent} يوم` : "0 يوم", inline: true },
            { name: "أفضل تتابع محادثة", value: `${stats?.bestStreakEver ?? 0} يوم`, inline: true },
            { name: "إجمالي المحادثات", value: `${stats?.totalConversations ?? 0}`, inline: true },
            { name: "عدد الشركاء المختلفين", value: `${stats?.distinctPartners ?? 0}`, inline: true },
            { name: "الرسائل", value: `${stats?.totalMessages ?? 0}`, inline: true },
            { name: "متوسط الكومبو", value: `${avgCombo}`, inline: true },
            { name: "متوسط المدة", value: formatDuration(avgDuration), inline: true },
            { name: "أطول محادثة", value: formatDuration(stats?.longestConversationMs ?? 0), inline: true },
        );
}

export async function buildHistoryEmbed(guild: Guild, target: ComboTarget): Promise<EmbedBuilder> {
    const history = await getHistoryForUser(guild.id, target.id);

    const description = history.length
        ? history.map(h => {
            const partnerId = h.userAId === target.id ? h.userBId : h.userAId;
            return `<@${partnerId}> — **${h.score}** (${translateLevel(h.level)}) — ${formatDuration(h.durationMs)} — <t:${Math.floor(h.endedAt.getTime() / 1000)}:R>`;
        }).join("\n")
        : "لا توجد كومبوهات سابقة بعد.";

    return baseEmbed(`📜 سجل الكومبو — ${target.username}`).setDescription(description);
}

export async function buildLeaderboardEmbed(
    guild: Guild,
    period: ComboLeaderboardPeriod,
    type: ComboLeaderboardType,
): Promise<EmbedBuilder> {
    const entries = await getLeaderboard(guild.id, period, type);

    const description = entries.length
        ? entries.map((e, i) => `**${i + 1}.** <@${e.discordId}> — ${Math.round(e.value)}`).join("\n")
        : "لا توجد بيانات لهذه الفترة بعد.";

    return baseEmbed(`🏆 ${LEADERBOARD_TYPE_LABELS[type]} — ${LEADERBOARD_PERIOD_LABELS[period]}`)
        .setDescription(description)
        .setFooter({ text: guild.name });
}

export async function buildServerRecordsEmbed(guild: Guild): Promise<EmbedBuilder> {
    const records = await getServerRecords(guild.id);

    const line = (entry: { value: number; userAId: string; userBId: string } | null, formatter: (v: number) => string) =>
        entry ? `${formatter(entry.value)} — <@${entry.userAId}> & <@${entry.userBId}>` : "لم يُسجَّل بعد";

    return baseEmbed(`🏛️ الأرقام القياسية للسيرفر — ${guild.name}`).addFields(
        { name: "أعلى كومبو على الإطلاق", value: line(records.highestComboEver, v => `${v}`) },
        { name: "أطول محادثة", value: line(records.longestConversation, formatDuration) },
        { name: "أكثر عدد رسائل", value: line(records.mostMessages, v => `${v}`) },
        { name: "أعلى حرارة", value: line(records.highestHeat, v => `${Math.round(v)}%`) },
        { name: "أطول تتابع محادثة", value: line(records.longestConversationStreak, v => `${v} يوم`) },
    );
}

export async function buildSettingsEmbed(guild: Guild): Promise<EmbedBuilder> {
    const settings = await ComboSettingsRepository.get(guild.id);
    const roleId = settings?.championRoleId;
    const role = roleId ? guild.roles.cache.get(roleId) : null;

    const min = settings?.minScorePerMessage ?? COMBO_CONFIG.minScorePerMessage;
    const max = settings?.maxScorePerMessage ?? COMBO_CONFIG.maxScorePerMessage;
    const isCustom = settings?.minScorePerMessage != null || settings?.maxScorePerMessage != null;

    return baseEmbed("⚙️ إعدادات الكومبو").addFields(
        { name: "رتبة البطل", value: role ? `${role}` : "غير مُعدة" },
        { name: "نقاط الكومبو لكل رسالة", value: `${min} — ${max}${isCustom ? "" : " (افتراضي)"}` },
    );
}
