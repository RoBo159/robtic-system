import type { BotClient } from "@core/BotClient";
import { Logger } from "@core/libs";
import { TicketRepository } from "@database/repositories";
import {
  ActionRowBuilder,
  BaseInteraction,
  ButtonBuilder,
  ChannelSelectMenuInteraction,
  ChatInputCommandInteraction,
  ContainerBuilder,
  MessageComponentInteraction,
  MessageFlags,
  Options,
  SeparatorBuilder,
  TextDisplayBuilder,
  type ButtonInteraction,
  type CacheFactory,
  type CacheType,
  type Interaction,
  type InteractionReplyOptions,
  type MessageReplyOptions,
  type TextChannel,
} from "discord.js";
import { ticketCategories } from "../config/categories";
import {
  SUPPORT_REPORT_CHANNEL_ID,
  SUPPORT_ROLE,
  TICKET_CLOSED_COLOR,
  TICKET_CREATED_COLOR,
} from "../config/misc";
import { ticketCard } from "./openTicket";

export async function runCloseTicket(
  ticketId: string,
  interaction: ButtonInteraction,
) {
  const ticket = await TicketRepository.close(ticketId, interaction.user.id);

  if (interaction.channelId !== ticket?.channelId) {
    return;
  }

  await interaction.reply({
    content: `Your Ticket was closed !`,
    flags: [MessageFlags.Ephemeral]
  });
  try {
    await interaction.channel?.delete();
  } catch {
    Logger.error("Ticket channel hasn't been deleted")
  }
  
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
