import { RoleSelectMenuInteraction, MessageFlags, type GuildMember } from "discord.js";
import type { ComponentHandler } from "@typings/command";
import type { BotClient } from "@core/bot-client";
import { ComboSettingsRepository } from "@database/repositories";
import { buildSettingsEmbed } from "../utils/combo-embeds";
import { buildComboNavRow, buildComboSettingsRow, buildComboPointsButtonRow, verifyInvoker, isComboAdmin } from "../utils/combo-components";

export const comboSettingsRoleHandler: ComponentHandler<RoleSelectMenuInteraction> = {
    customId: /^combo:settings-role:\d+$/,

    async run(interaction: RoleSelectMenuInteraction, _client: BotClient) {
        const invokerId = interaction.customId.split(":")[2];
        if (!(await verifyInvoker(interaction, invokerId))) return;

        const guild = interaction.guild;
        if (!guild) {
            await interaction.reply({ content: "لا يمكن استخدام هذا الأمر إلا داخل سيرفر.", flags: MessageFlags.Ephemeral }).catch(() => null);
            return;
        }

        const member = interaction.member as GuildMember | null;
        if (!(await isComboAdmin(interaction.user.id, member))) {
            await interaction.reply({ content: "ليس لديك صلاحية لتغيير إعدادات الكومبو.", flags: MessageFlags.Ephemeral }).catch(() => null);
            return;
        }

        await interaction.deferUpdate();

        const roleId = interaction.values[0] ?? null;
        await ComboSettingsRepository.setChampionRole(guild.id, roleId);

        const embed = await buildSettingsEmbed(guild);
        const nav = buildComboNavRow(invokerId, true);
        const settingsRow = buildComboSettingsRow(invokerId);
        const pointsRow = buildComboPointsButtonRow(invokerId);

        await interaction.editReply({ embeds: [embed], components: [nav, settingsRow, pointsRow] });
    },
};
