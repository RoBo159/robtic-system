import { StringSelectMenuInteraction, MessageFlags, type GuildMember } from "discord.js";
import type { ComponentHandler } from "@typings/command";
import type { BotClient } from "@core/bot-client";
import {
    buildStatusEmbed,
    buildStatisticsEmbed,
    buildHistoryEmbed,
    buildLeaderboardEmbed,
    buildServerRecordsEmbed,
    buildSettingsEmbed,
} from "../utils/combo-embeds";
import {
    buildComboNavRow,
    buildComboLeaderboardRows,
    buildComboSettingsRow,
    buildComboPointsButtonRow,
    verifyInvoker,
    isComboAdmin,
    type ComboPage,
} from "../utils/combo-components";

export const comboMenuHandler: ComponentHandler<StringSelectMenuInteraction> = {
    customId: /^combo:nav:\d+$/,

    async run(interaction: StringSelectMenuInteraction, _client: BotClient) {
        const invokerId = interaction.customId.split(":")[2];
        if (!(await verifyInvoker(interaction, invokerId))) return;

        const guild = interaction.guild;
        if (!guild) {
            await interaction.reply({ content: "لا يمكن استخدام هذا الأمر إلا داخل سيرفر.", flags: MessageFlags.Ephemeral }).catch(() => null);
            return;
        }

        await interaction.deferUpdate();

        const page = interaction.values[0] as ComboPage;
        const member = interaction.member as GuildMember | null;
        const isAdmin = await isComboAdmin(interaction.user.id, member);

        if (page === "settings" && !isAdmin) {
            await interaction.followUp({ content: "ليس لديك صلاحية لعرض إعدادات الكومبو.", flags: MessageFlags.Ephemeral }).catch(() => null);
            return;
        }

        const target = {
            id: interaction.user.id,
            username: interaction.user.username,
            avatarUrl: interaction.user.displayAvatarURL({ size: 256 }),
        };

        const nav = buildComboNavRow(invokerId, isAdmin);

        switch (page) {
            case "status": {
                const embed = await buildStatusEmbed(guild, target);
                await interaction.editReply({ embeds: [embed], components: [nav] });
                return;
            }
            case "statistics": {
                const embed = await buildStatisticsEmbed(guild, target);
                await interaction.editReply({ embeds: [embed], components: [nav] });
                return;
            }
            case "history": {
                const embed = await buildHistoryEmbed(guild, target);
                await interaction.editReply({ embeds: [embed], components: [nav] });
                return;
            }
            case "leaderboards": {
                const embed = await buildLeaderboardEmbed(guild, "daily", "combo");
                const lbRows = buildComboLeaderboardRows(invokerId, "daily", "combo");
                await interaction.editReply({ embeds: [embed], components: [nav, ...lbRows] });
                return;
            }
            case "records": {
                const embed = await buildServerRecordsEmbed(guild);
                await interaction.editReply({ embeds: [embed], components: [nav] });
                return;
            }
            case "settings": {
                const embed = await buildSettingsEmbed(guild);
                const settingsRow = buildComboSettingsRow(invokerId);
                const pointsRow = buildComboPointsButtonRow(invokerId);
                await interaction.editReply({ embeds: [embed], components: [nav, settingsRow, pointsRow] });
                return;
            }
        }
    },
};
