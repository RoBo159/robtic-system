import {
    ModalSubmitInteraction,
    EmbedBuilder,
    MessageFlags,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { ComponentHandler } from "@typings/command";
import { COLORS } from "@constants";
import { ReasonRepository } from "@database/repositories";
import { errorEmbed } from "@utils";

export const reasonCreateHandler: ComponentHandler<ModalSubmitInteraction> = {
    customId: /^reason_create_(warn|mute|ban)$/,

    async run(interaction: ModalSubmitInteraction, client: BotClient) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const type = interaction.customId.split("_")[2] as "warn" | "mute" | "ban";
        const key = interaction.fields.getTextInputValue("reason_key").toLowerCase().trim();
        const label = interaction.fields.getTextInputValue("reason_label").trim();
        const labelAr = interaction.fields.getTextInputValue("reason_label_ar").trim();

        const existing = await ReasonRepository.findByKey(key);
        if (existing) {
            await interaction.editReply({ embeds: [errorEmbed(`Reason \`${key}\` already exists.`)] });
            return;
        }

        await ReasonRepository.create({
            key,
            label,
            labelAr,
            type,
            createdBy: interaction.user.id,
        });

        const typeLabels = { warn: "⚠️ Warning", mute: "🔇 Mute", ban: "🔨 Ban" };

        const embed = new EmbedBuilder()
            .setTitle("✅ Reason Created")
            .setColor(COLORS.success)
            .addFields(
                { name: "Key", value: `\`${key}\``, inline: true },
                { name: "Type", value: typeLabels[type], inline: true },
                { name: "Label (EN)", value: label },
                { name: "Label (AR)", value: labelAr },
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};
