import { SlashCommandBuilder, ChatInputCommandInteraction } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { TicketRepository } from "@database/repositories";
import { requireOpenTicket, requireTicketStaff } from "../../utils/moderation/ticket-guard";

export default {
    category: "Tickets",
    data: new SlashCommandBuilder()
        .setName("claim")
        .setDescription("Claim the current ticket as yours to handle"),

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        const resolved = await requireOpenTicket(interaction);
        if (!resolved) return;
        const { ticket, category } = resolved;
        if (!(await requireTicketStaff(interaction, category))) return;

        await TicketRepository.assign(ticket.ticketId, interaction.user.id);

        await interaction.reply({ content: `🙋 ${interaction.user} has claimed this ticket.` });
    },
};
