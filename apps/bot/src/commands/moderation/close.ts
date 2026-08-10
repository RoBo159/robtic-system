import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    ContainerBuilder,
    MessageFlags,
    SeparatorBuilder,
    TextDisplayBuilder,
    type TextChannel,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { TicketRepository, ActivityRepository, ActivityLogRepository } from "@database/repositories";
import { Logger } from "@logger";
import { requireOpenTicket, requireTicketStaff } from "../../utils/moderation/ticket-guard";
import { ticketCard } from "../../utils/moderation/ticket-card";
import { TICKET_CLOSED_COLOR, TICKET_REPORT_CHANNEL_ID } from "../../config/moderation/ticket";

export default {
    category: "Tickets",
    data: new SlashCommandBuilder()
        .setName("close")
        .setDescription("Close the current ticket")
        .addStringOption(opt => opt.setName("reason").setDescription("Reason for closing").setRequired(false)),

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        const resolved = await requireOpenTicket(interaction);
        if (!resolved) return;
        const { ticket, category } = resolved;
        if (!(await requireTicketStaff(interaction, category))) return;

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const reason = interaction.options.getString("reason") ?? "No reason provided";
        const closed = await TicketRepository.close(ticket.ticketId, interaction.user.id);
        if (!closed) {
            // Someone else's /close beat this one to it — avoids double-closing/double-awarding points.
            await interaction.editReply({ content: "This ticket was already closed." });
            return;
        }

        const guildId = interaction.guildId!;
        if (category.staffPoints !== 0) {
            await ActivityRepository.findOrCreate(interaction.user.id, guildId, interaction.user.username);
            await ActivityRepository.addSupportPoints(interaction.user.id, guildId, category.staffPoints);
            await ActivityLogRepository.log({
                guildId,
                userId: interaction.user.id,
                type: "support_points",
                amount: category.staffPoints,
                details: `Closed ticket ${ticket.ticketId} (${category.label})`,
            });
        }

        const channel = interaction.channel as TextChannel;
        await channel.permissionOverwrites.edit(ticket.userId, { SendMessages: false }).catch((error) => {
            Logger.error(`Failed to lock ticket channel ${channel.id} on close: ${error}`, "moderation:ticket");
        });

        const closedAtStr = closed.closedAt ? `${Math.floor(closed.closedAt.getTime() / 1000)}` : null;
        const cardString = ticketCard(closed.userId, closed.category, closed.subject);
        const closedInfo = `${closedAtStr ? `Closed at: <t:${closedAtStr}> (<t:${closedAtStr}:R>)\n` : ""}Closed by: <@${closed.closedBy}>\nReason: ${reason}`;

        try {
            const reportChannel = await interaction.guild!.channels.fetch(TICKET_REPORT_CHANNEL_ID);
            if (reportChannel?.isTextBased()) {
                await reportChannel.send({
                    components: [
                        new ContainerBuilder()
                            .setAccentColor(TICKET_CLOSED_COLOR)
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent("### Ticket was closed"))
                            .addSeparatorComponents(new SeparatorBuilder())
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent(cardString))
                            .addSeparatorComponents(new SeparatorBuilder())
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent(closedInfo)),
                    ],
                    flags: [MessageFlags.IsComponentsV2, MessageFlags.SuppressNotifications],
                });
            }
        } catch (error) {
            Logger.error(`Failed to send ticket close report: ${error}`, "moderation:ticket");
        }

        await interaction.editReply({ content: "✅ Ticket closed. This channel is now locked for the ticket opener." });
    },
};
