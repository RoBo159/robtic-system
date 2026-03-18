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
  ModalSubmitInteraction,
  TextDisplayBuilder,
  ActionRowBuilder,
} from "discord.js";
import type { BotClient } from "@core/BotClient";
import { TicketRepository } from "@database/repositories";
import { Logger } from "@core/libs";
import {
  ACCENT_COLOR,
  SUPPORT_ROLE_ID,
  TICKET_TEXTCHAT_CATEGORY_ID,
} from "../config/misc";

// const TICKET_CATEGORY_ID = "PUT_DISCORD_CATEGORY_ID_HERE";
// const SUPPORT_ROLE_ID = "PUT_SUPPORT_ROLE_ID_HERE";

function makeIdFromInputs(a: string, b: string): string {
  const input = `${a}|${b}`;
  let hash = 2166136261; // FNV-1a seed
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  // Convert to base36, pad/truncate to 16 chars
  return (hash >>> 0).toString(36).padStart(16, "0").slice(0, 16);
}

export default {
  customId: /^ticket_open/,

  async run(interaction: ModalSubmitInteraction, client: BotClient) {
    if (!interaction.isModalSubmit()) return;

    const categoryId =
      interaction.fields.getStringSelectValues("ticket_category")[0];

    const existing = await TicketRepository.findOpenByUser(
      interaction.user.id,
      interaction.guild!.id,
    );
    if (existing.length > 0) {
      await interaction.reply({
        components: [
          new ContainerBuilder()
            .setAccentColor(ACCENT_COLOR)
            .addTextDisplayComponents(
              new TextDisplayBuilder().setContent(
                "You already have an open ticket.",
              ),
            ),
        ],
        flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
      });
      TicketRepository.close(existing[0].ticketId, "test2");
      return;
    }

    const channel = await interaction.guild!.channels.create({
      name: `ticket-${interaction.user.username}`.toLowerCase(),
      type: ChannelType.GuildText,
      parent: TICKET_TEXTCHAT_CATEGORY_ID,
      permissionOverwrites: [
        {
          id: interaction.guild!.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: SUPPORT_ROLE_ID,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ],
    });

    const ticketId = makeIdFromInputs(
      interaction.guild!.id,
      channel.id,
    );

    channel.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(ACCENT_COLOR)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `<@${interaction.user.id}> Staff members will be available soon!`,
            ),
          )
          .addActionRowComponents(
            new ActionRowBuilder<ButtonBuilder>().addComponents(
              new ButtonBuilder()
                .setCustomId(`ticket_close_${ticketId}`)
                .setLabel("Close")
                .setStyle(ButtonStyle.Primary),
            ),
          ),
      ],
      flags: MessageFlags.IsComponentsV2,
    });

    // TicketRepository.close()

    await TicketRepository.create({
      ticketId: ticketId,
      guildId: interaction.guild!.id,
      channelId: interaction.channelId ?? "",
      userId: interaction.user.id,
      category: categoryId,
      subject: `Ticket: ${categoryId}`,
      status: "open",
      priority: "medium",
      messages: [],
      assignedTo: null,
      closedBy: null,
      closedAt: null,
      transcript: null,
    });

    interaction.reply({
      components: [
        new ContainerBuilder()
          .setAccentColor(ACCENT_COLOR)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `## Ticket channel was created ! → <#${channel.id}>`,
            ),
          ),
      ],
      flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
    });
  },
};
