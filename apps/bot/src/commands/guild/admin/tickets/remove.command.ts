import { SlashCommandBuilder, ChatInputCommandInteraction, MessageFlags, type TextChannel } from "discord.js";
import type { BotClient } from "@core/bot-client";
import { requireOpenTicket, requireTicketStaff } from "@bot/utils/moderation/ticket-guard";

export default {
    scope: "guild",
    category: "Tickets",
    data: new SlashCommandBuilder()
        .setName("remove")
        .setDescription("Remove a user from the current ticket")
        .addUserOption(opt => opt.setName("user").setDescription("User to remove").setRequired(true)),

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        const resolved = await requireOpenTicket(interaction);
        if (!resolved) return;
        const { ticket, category } = resolved;
        if (!(await requireTicketStaff(interaction, category))) return;

        const user = interaction.options.getUser("user", true);
        if (user.id === ticket.userId) {
            await interaction.reply({ content: "You can't remove the ticket opener — use `/close` instead.", flags: MessageFlags.Ephemeral });
            return;
        }

        const channel = interaction.channel as TextChannel;
        await channel.permissionOverwrites.delete(user.id);

        await interaction.reply({ content: `✅ Removed ${user} from this ticket.` });
    },
};
