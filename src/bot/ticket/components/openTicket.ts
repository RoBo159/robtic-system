import {
  ButtonInteraction,
  ChannelType,
  MessageFlags,
  type MessageEditOptions,
  PermissionFlagsBits,
  type StringSelectMenuInteraction,
  ContainerBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} from "discord.js";
import type { BotClient } from "@core/BotClient";
import { TicketRepository } from "@database/repositories";

// const TICKET_CATEGORY_ID = "PUT_DISCORD_CATEGORY_ID_HERE";
// const SUPPORT_ROLE_ID = "PUT_SUPPORT_ROLE_ID_HERE";

export default {
  customId: /^ticket_open/,

  async run(interaction: ButtonInteraction, client: BotClient) {
    const parts = interaction.customId.split("_");
    const category = parts[2] ?? '';

    const existing = await TicketRepository.findOpenByUser(
      interaction.user.id,
      interaction.guild!.id,
    );
    if (existing.length > 0) {
      await interaction.update({
        content: "You already have an open ticket.",
        flags: ["IsComponentsV2"],
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

    const menu = new ContainerBuilder()
          .setAccentColor(0x0099ff)
          .addTextDisplayComponents((textDisplay) =>
            textDisplay.setContent(
              "## Nigga",
            ),
          )
          .addSeparatorComponents((separator) => separator)
          .addSectionComponents((section) =>
            section
              .addTextDisplayComponents(
                (textDisplay) =>
                  textDisplay.setContent(
                    "This text is inside a Text Display component! You can use **any __markdown__** available inside this component too.",
                  ),
              )
              .setButtonAccessory((button) =>
                button
                  .setCustomId("ticket_open")
                  .setLabel("Button inside a Section")
                  .setStyle(ButtonStyle.Success),
              ),
          );
    await interaction.update({
      // content: `Ticket created: <${category}>`,
      components: [
        menu
      ],
      flags: ["IsComponentsV2"]
    });
  },
};
