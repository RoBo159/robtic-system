import type { BotClient } from "@core/BotClient";
import { Logger } from "@core/libs";
import { TicketRepository } from "@database/repositories";
import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
  type ButtonInteraction,
  type TextChannel,
} from "discord.js";
import { ticketCategories } from "../config/categories";
import {
  SUPPORT_REPORT_CHANNEL_ID,
  SUPPORT_ROLE,
  TICKET_CREATED_COLOR,
} from "../config/misc";
import { ticketCard } from "./openTicket";

export default {
  customId: /^ticket_close_/,

  async run(interaction: ButtonInteraction, client: BotClient) {
    const [_0, _1, ticketId] = interaction.customId.split("_");

    const ticket = await TicketRepository.close(ticketId, interaction.user.id);

    if (interaction.channelId !== ticket?.channelId) {
      return;
    }

    await interaction.deferUpdate();
    await interaction.channel?.delete();

    const closedAtStr = ticket.closedAt? `${Math.floor(ticket.closedAt?.getTime() / 1000) ?? ""}`: null;
    const ticketCardString = ticketCard(ticket.userId, ticket.category, ticket.subject);
    const ticketClosedString = `${
      ticket.closedAt
        ? `Closed at: <t:${closedAtStr}> (<t:${closedAtStr}:R>)`
        : ``
    }
Closed by: <@:${ticket.closedBy}>`;

    const reportChannel = (await interaction.guild!.channels.fetch(
      SUPPORT_REPORT_CHANNEL_ID,
    )) as TextChannel;

    const report = new ContainerBuilder()
      .setAccentColor(TICKET_CREATED_COLOR)
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

    await reportChannel.send(
      {
        components: [report],
        flags: [MessageFlags.IsComponentsV2, MessageFlags.SuppressNotifications]
      }
    )
  },
};
