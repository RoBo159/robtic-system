import {
    ButtonInteraction,
    ModalBuilder,
    ModalSubmitInteraction,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    MessageFlags,
    type GuildMember,
} from "discord.js";
import type { ComponentHandler } from "@typings/command";
import type { BotClient } from "@core/bot-client";
import { COMBO_CONFIG } from "@constants";
import { ComboSettingsRepository } from "@database/repositories";
import { buildSettingsEmbed } from "../utils/combo-embeds";
import { buildComboNavRow, buildComboSettingsRow, buildComboPointsButtonRow, verifyInvoker, isComboAdmin } from "../utils/combo-components";
import { invalidateScoreRangeCache } from "../services/combo";

export const comboSettingsPointsOpenHandler: ComponentHandler<ButtonInteraction> = {
    customId: /^combo:settings-points-open:\d+$/,

    async run(interaction: ButtonInteraction) {
        const invokerId = interaction.customId.split(":")[2];
        if (!(await verifyInvoker(interaction, invokerId))) return;

        const member = interaction.member as GuildMember | null;
        if (!(await isComboAdmin(interaction.user.id, member))) {
            await interaction.reply({ content: "ليس لديك صلاحية لتغيير إعدادات الكومبو.", flags: MessageFlags.Ephemeral }).catch(() => null);
            return;
        }

        const settings = await ComboSettingsRepository.get(interaction.guildId!);
        const min = settings?.minScorePerMessage ?? COMBO_CONFIG.minScorePerMessage;
        const max = settings?.maxScorePerMessage ?? COMBO_CONFIG.maxScorePerMessage;

        const modal = new ModalBuilder()
            .setCustomId(`combo:settings-points-modal:${invokerId}`)
            .setTitle("نقاط الكومبو لكل رسالة");

        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("min_score")
                    .setLabel("الحد الأدنى للنقاط")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setValue(`${min}`),
            ),
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("max_score")
                    .setLabel("الحد الأقصى للنقاط")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setValue(`${max}`),
            ),
        );

        await interaction.showModal(modal);
    },
};

export const comboSettingsPointsModalHandler: ComponentHandler<ModalSubmitInteraction> = {
    customId: /^combo:settings-points-modal:\d+$/,

    async run(interaction: ModalSubmitInteraction, _client: BotClient) {
        const invokerId = interaction.customId.split(":")[2];
        if (interaction.user.id !== invokerId) {
            await interaction.reply({ content: "هذه ليست قائمة الكومبو الخاصة بك.", flags: MessageFlags.Ephemeral }).catch(() => null);
            return;
        }

        const member = interaction.member as GuildMember | null;
        if (!(await isComboAdmin(interaction.user.id, member))) {
            await interaction.reply({ content: "ليس لديك صلاحية لتغيير إعدادات الكومبو.", flags: MessageFlags.Ephemeral }).catch(() => null);
            return;
        }

        const guild = interaction.guild;
        if (!guild) {
            await interaction.reply({ content: "لا يمكن استخدام هذا الأمر إلا داخل سيرفر.", flags: MessageFlags.Ephemeral }).catch(() => null);
            return;
        }

        const minRaw = interaction.fields.getTextInputValue("min_score").trim();
        const maxRaw = interaction.fields.getTextInputValue("max_score").trim();
        const min = Number(minRaw);
        const max = Number(maxRaw);

        if (!Number.isFinite(min) || !Number.isFinite(max) || min < 0 || max < min) {
            await interaction.reply({
                content: "قيم غير صالحة — تأكد أن الحد الأدنى رقم موجب وأن الحد الأقصى أكبر منه أو يساويه.",
                flags: MessageFlags.Ephemeral,
            }).catch(() => null);
            return;
        }

        await interaction.deferUpdate();

        await ComboSettingsRepository.setScoreRange(guild.id, Math.round(min), Math.round(max));
        invalidateScoreRangeCache(guild.id);

        const embed = await buildSettingsEmbed(guild);
        const nav = buildComboNavRow(invokerId, true);
        const settingsRow = buildComboSettingsRow(invokerId);
        const pointsRow = buildComboPointsButtonRow(invokerId);

        await interaction.editReply({ embeds: [embed], components: [nav, settingsRow, pointsRow] });
    },
};
