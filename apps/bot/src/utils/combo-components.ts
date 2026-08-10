import {
    ActionRowBuilder,
    StringSelectMenuBuilder,
    RoleSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    type GuildMember,
    type StringSelectMenuInteraction,
    type RoleSelectMenuInteraction,
    type ButtonInteraction,
} from "discord.js";
import { COMBO_LEADERBOARD_PERIODS, SUPER_ADMIN_ID, type ComboLeaderboardPeriod, type ComboLeaderboardType } from "@constants";
import { SuperUserRepository } from "@database/repositories";
import { isAnyManager } from "@bot/utils/access";

export type ComboPage = "status" | "statistics" | "history" | "leaderboards" | "records" | "settings";

const PERIOD_LABELS: Record<ComboLeaderboardPeriod, string> = {
    daily: "يومي",
    weekly: "أسبوعي",
    monthly: "شهري",
    alltime: "كل الأوقات",
};

const TYPE_LABELS: Record<ComboLeaderboardType, string> = {
    combo: "أعلى كومبو",
    streak: "تتابع المحادثة",
    partner: "الشريك المفضل",
};

const COMBO_LEADERBOARD_TYPES: ComboLeaderboardType[] = ["combo", "streak", "partner"];

/** Mirrors checkPermissions()'s bypass order in interaction-helper.ts (super admin, then whitelist, then role-based level) so combo Settings isn't gated more strictly than every other admin surface in this bot. */
export async function isComboAdmin(userId: string, member: GuildMember | null): Promise<boolean> {
    if (userId === SUPER_ADMIN_ID) return true;
    if (await SuperUserRepository.isWhitelisted(userId)) return true;
    return member ? isAnyManager(member) : false;
}

/** Only the invoking user may operate their own /combo message's components. */
export async function verifyInvoker(
    interaction: StringSelectMenuInteraction | RoleSelectMenuInteraction | ButtonInteraction,
    invokerId: string,
): Promise<boolean> {
    if (interaction.user.id === invokerId) return true;
    await interaction.reply({ content: "هذه ليست قائمة الكومبو الخاصة بك.", flags: MessageFlags.Ephemeral }).catch(() => null);
    return false;
}

export function buildComboNavRow(invokerId: string, isAdmin: boolean): ActionRowBuilder<StringSelectMenuBuilder> {
    const options: { label: string; description: string; value: ComboPage; emoji: string }[] = [
        { label: "الحالة", description: "حالة الكومبو الحالية الخاصة بك", value: "status", emoji: "🔥" },
        { label: "الإحصائيات", description: "إحصائيات مفصلة عن الكومبو", value: "statistics", emoji: "📊" },
        { label: "السجل", description: "الكومبوهات السابقة الخاصة بك", value: "history", emoji: "📜" },
        { label: "لوحة المتصدرين", description: "لوحات متصدري الكومبو في السيرفر", value: "leaderboards", emoji: "🏆" },
        { label: "الأرقام القياسية", description: "الأرقام القياسية للسيرفر منذ البداية", value: "records", emoji: "🏛️" },
    ];

    if (isAdmin) {
        options.push({ label: "الإعدادات", description: "إعداد رتبة البطل (للمشرفين)", value: "settings", emoji: "⚙️" });
    }

    const menu = new StringSelectMenuBuilder()
        .setCustomId(`combo:nav:${invokerId}`)
        .setPlaceholder("التنقل...")
        .addOptions(options);

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu);
}

export function buildComboLeaderboardRows(
    invokerId: string,
    period: ComboLeaderboardPeriod,
    type: ComboLeaderboardType,
): ActionRowBuilder<StringSelectMenuBuilder>[] {
    const periodMenu = new StringSelectMenuBuilder()
        .setCustomId(`combo:lb-period:${invokerId}:${type}`)
        .setPlaceholder("الفترة")
        .addOptions(COMBO_LEADERBOARD_PERIODS.map(p => ({ label: PERIOD_LABELS[p], value: p, default: p === period })));

    const typeMenu = new StringSelectMenuBuilder()
        .setCustomId(`combo:lb-type:${invokerId}:${period}`)
        .setPlaceholder("نوع لوحة المتصدرين")
        .addOptions(COMBO_LEADERBOARD_TYPES.map(t => ({ label: TYPE_LABELS[t], value: t, default: t === type })));

    return [
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(periodMenu),
        new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(typeMenu),
    ];
}

export function buildComboSettingsRow(invokerId: string): ActionRowBuilder<RoleSelectMenuBuilder> {
    const roleSelect = new RoleSelectMenuBuilder()
        .setCustomId(`combo:settings-role:${invokerId}`)
        .setPlaceholder("اختر رتبة البطل...")
        .setMinValues(0)
        .setMaxValues(1);

    return new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(roleSelect);
}

export function buildComboPointsButtonRow(invokerId: string): ActionRowBuilder<ButtonBuilder> {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(`combo:settings-points-open:${invokerId}`)
            .setLabel("تعديل نقاط الكومبو")
            .setEmoji("🎯")
            .setStyle(ButtonStyle.Secondary),
    );
}
