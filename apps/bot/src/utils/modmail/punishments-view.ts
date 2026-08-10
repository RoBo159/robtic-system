import { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import { COLORS } from "@constants";
import { PunishmentRepository } from "@database/repositories";
import { t, type Lang } from "@bot/utils/lang";

const TYPE_EMOJIS: Record<string, string> = { warn: "⚠️", mute: "🔇", ban: "🔨", tempban: "🔨" };

export async function buildPunishmentsView(userId: string, lang: Lang) {
    const guildId = process.env.MainGuild!;
    const punishments = await PunishmentRepository.findActiveByUser(userId, guildId);

    if (!punishments.length) {
        return { punishments, embed: null, row: null };
    }

    const lines = punishments.map((p, i) =>
        `**${i + 1}.** ${TYPE_EMOJIS[p.type] ?? "📌"} \`${p.caseId}\` — ${p.reason}`
    );

    const embed = new EmbedBuilder()
        .setTitle(t("modmail.active_punishments_title", lang))
        .setDescription(lines.join("\n"))
        .setColor(COLORS.warning)
        .setTimestamp();

    const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`modmail_appeal_case_${userId}_${lang}`)
            .setPlaceholder(t("modmail.appeal_case_label", lang))
            .addOptions(
                punishments.slice(0, 25).map(p => ({
                    label: `${p.caseId} (${p.type})`.slice(0, 100),
                    description: p.reason.slice(0, 100),
                    value: p.caseId,
                }))
            )
    );

    return { punishments, embed, row };
}
