import { SlashCommandBuilder, ChatInputCommandInteraction, type TextChannel } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { requireOpenTicket, requireTicketStaff } from "../../utils/moderation/ticket-guard";

export default {
    category: "Tickets",
    data: new SlashCommandBuilder()
        .setName("add")
        .setDescription("Add a user to the current ticket")
        .addUserOption(opt => opt.setName("user").setDescription("User to add").setRequired(true)),

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        const resolved = await requireOpenTicket(interaction);
        if (!resolved) return;
        if (!(await requireTicketStaff(interaction, resolved.category))) return;

        const user = interaction.options.getUser("user", true);
        const channel = interaction.channel as TextChannel;

        await channel.permissionOverwrites.edit(user.id, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true,
        });

        await interaction.reply({ content: `✅ Added ${user} to this ticket.` });
    },
};
