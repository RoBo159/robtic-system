import { SlashCommandBuilder, ChatInputCommandInteraction, type TextChannel } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { TicketRepository } from "@database/repositories";
import { requireOpenTicket, requireTicketStaff } from "../../utils/moderation/ticket-guard";

export default {
    category: "Tickets",
    data: new SlashCommandBuilder()
        .setName("escalate")
        .setDescription("Escalate the current ticket to the category's admin role"),

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        const resolved = await requireOpenTicket(interaction);
        if (!resolved) return;
        const { ticket, category } = resolved;
        if (!(await requireTicketStaff(interaction, category))) return;

        const channel = interaction.channel as TextChannel;
        await channel.permissionOverwrites.edit(category.adminRoleId, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
        });

        await TicketRepository.escalate(ticket.ticketId);

        await interaction.reply({ content: `⚠️ Escalated — <@&${category.adminRoleId}> now has access to this ticket.` });
    },
};
