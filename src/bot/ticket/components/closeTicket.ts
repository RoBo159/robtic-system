import type { BotClient } from "@core/BotClient";
import { TicketRepository } from "@database/repositories";
import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
  type ButtonInteraction,
  type TextChannel,
} from "discord.js";
import {
  SUPPORT_REPORT_CHANNEL_ID,
  TICKET_CLOSED_COLOR,
} from "../config/misc";
import { ticketCard } from "./openTicket";

export async function runCloseTicket(
  ticketId: string,
  interaction: ButtonInteraction,
) {
  const ticket = await TicketRepository.close(ticketId, interaction.user.id);
  // First, fetch the ticket without mutating it
  const existingTicket = await TicketRepository.findById(ticketId);

  if (!existingTicket) {
    await interaction.reply({
      content: `This ticket no longer exists.`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  // Validate that the interaction was used in the correct channel
  if (interaction.channelId !== existingTicket.channelId) {
    await interaction.reply({
      content: `You can only close this ticket from its own channel.`,
      flags: [MessageFlags.Ephemeral],
    });
    return;
  }

  // Acknowledge the interaction before mutating any state
  if (interaction.deferUpdate) {
    await interaction.deferUpdate();
  } else {
    await interaction.reply({
      content: `Your Ticket was closed !`,
      flags: [MessageFlags.Ephemeral],
    });
  }

  // Now safely perform the close operation and subsequent side effects
  const ticket = await TicketRepository.close(ticketId, interaction.user.id);
  
  const closedAtStr = ticket.closedAt
    ? `${Math.floor(ticket.closedAt?.getTime() / 1000) ?? ""}`
    : null;
  const ticketCardString = ticketCard(
    ticket.userId,
    ticket.category,
    ticket.subject,
  );
  const ticketClosedString = `${
    ticket.closedAt
      ? `Closed at: <t:${closedAtStr}> (<t:${closedAtStr}:R>)`
      : ``
  }
Closed by: <@${ticket.closedBy}>`;

  const reportChannel = (await interaction.guild!.channels.fetch(
    SUPPORT_REPORT_CHANNEL_ID,
  )) as TextChannel;

  const report = new ContainerBuilder()
    .setAccentColor(TICKET_CLOSED_COLOR)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`### Support request was closed`),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(ticketCardString),
    )
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(ticketClosedString),
    );

  await reportChannel.send({
    components: [report],
    flags: [MessageFlags.IsComponentsV2, MessageFlags.SuppressNotifications],
  });
}

export default {
  customId: /^ticket_close_/,

  async run(interaction: ButtonInteraction, client: BotClient) {
    const [_0, _1, ticketId] = interaction.customId.split("_");
    
    await runCloseTicket(ticketId, interaction);
  },
};
