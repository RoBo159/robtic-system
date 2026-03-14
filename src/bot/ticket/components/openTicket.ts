import {
  ChannelType,
  MessageFlags,
  PermissionFlagsBits,
  type StringSelectMenuInteraction,
} from "discord.js";
import type { BotClient } from "@core/BotClient";
import { TicketRepository } from "@database/repositories";

// const TICKET_CATEGORY_ID = "PUT_DISCORD_CATEGORY_ID_HERE";
// const SUPPORT_ROLE_ID = "PUT_SUPPORT_ROLE_ID_HERE";

export default {
  customId: /^ticket_open/,

  async run(interaction: StringSelectMenuInteraction, client: BotClient) {
    const parts = interaction.customId.split("_");
    const category = parts[1];

    const existing = await TicketRepository.findOpenByUser(
      interaction.user.id,
      interaction.guild!.id
    );
    if (existing.length > 0) {
      await interaction.reply({
        content: "You already have an open ticket.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    // await interaction.reply({content:"nigga", flags: MessageFlags.Ephemeral})
    // console.log(...); // i want to know where i find the selected string

    // const channel = await interaction.guild!.channels.create({
    //   name: `ticket-${interaction.user.username}`.toLowerCase(),
    //   type: ChannelType.GuildText,
    //   parent: category,
    //   permissionOverwrites: [
    //     {
    //       id: interaction.guild!.roles.everyone.id,
    //       deny: [PermissionFlagsBits.ViewChannel],
    //     },
    //     {
    //       id: interaction.user.id,
    //       allow: [
    //         PermissionFlagsBits.ViewChannel,
    //         PermissionFlagsBits.SendMessages,
    //         PermissionFlagsBits.ReadMessageHistory,
    //       ],
    //     },
    //     {
    //       id: SUPPORT_ROLE_ID,
    //       allow: [
    //         PermissionFlagsBits.ViewChannel,
    //         PermissionFlagsBits.SendMessages,
    //         PermissionFlagsBits.ReadMessageHistory,
    //       ],
    //     },
    //   ],
    // });

    // await TicketRepository.create({
    //   ticketId: channel.id,
    //   guildId: interaction.guild!.id,
    //   channelId: channel.id,
    //   userId: interaction.user.id,
    //   category: categoryId,
    //   subject: `Ticket: ${categoryId}`,
    //   status: "open",
    //   priority: "medium",
    //   messages: [],
    //   assignedTo: null,
    //   closedBy: null,
    //   closedAt: null,
    //   transcript: null,
    // });

    await interaction.reply({
      content: `Ticket created: <${category}>`,
      flags: MessageFlags.Ephemeral,
    });
  },
};
