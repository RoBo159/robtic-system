import { StringSelectMenuInteraction, MessageFlags, type GuildMember } from "discord.js";
import type { ComponentHandler } from "@typings/command";
import type { BotClient } from "@core/bot-client";
import type { ComboLeaderboardPeriod, ComboLeaderboardType } from "@constants";
import { buildLeaderboardEmbed } from "../utils/combo-embeds";
import { buildComboNavRow, buildComboLeaderboardRows, verifyInvoker, isComboAdmin } from "../utils/combo-components";

async function render(interaction: StringSelectMenuInteraction, invokerId: string, period: ComboLeaderboardPeriod, type: ComboLeaderboardType): Promise<void> {
    const guild = interaction.guild;
    if (!guild) {
        await interaction.reply({ content: "لا يمكن استخدام هذا الأمر إلا داخل سيرفر.", flags: MessageFlags.Ephemeral }).catch(() => null);
        return;
    }

    await interaction.deferUpdate();

    const member = interaction.member as GuildMember | null;
    const isAdmin = await isComboAdmin(interaction.user.id, member);

    const embed = await buildLeaderboardEmbed(guild, period, type);
    const nav = buildComboNavRow(invokerId, isAdmin);
    const lbRows = buildComboLeaderboardRows(invokerId, period, type);

    await interaction.editReply({ embeds: [embed], components: [nav, ...lbRows] });
}

export const comboLeaderboardPeriodHandler: ComponentHandler<StringSelectMenuInteraction> = {
    customId: /^combo:lb-period:\d+:(combo|streak|partner)$/,

    async run(interaction: StringSelectMenuInteraction, _client: BotClient) {
        const parts = interaction.customId.split(":");
        const invokerId = parts[2];
        const type = parts[3] as ComboLeaderboardType;
        if (!(await verifyInvoker(interaction, invokerId))) return;

        const period = interaction.values[0] as ComboLeaderboardPeriod;
        await render(interaction, invokerId, period, type);
    },
};

export const comboLeaderboardTypeHandler: ComponentHandler<StringSelectMenuInteraction> = {
    customId: /^combo:lb-type:\d+:(daily|weekly|monthly|alltime)$/,

    async run(interaction: StringSelectMenuInteraction, _client: BotClient) {
        const parts = interaction.customId.split(":");
        const invokerId = parts[2];
        const period = parts[3] as ComboLeaderboardPeriod;
        if (!(await verifyInvoker(interaction, invokerId))) return;

        const type = interaction.values[0] as ComboLeaderboardType;
        await render(interaction, invokerId, period, type);
    },
};
