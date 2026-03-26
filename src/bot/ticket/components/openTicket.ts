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
  TextChannel,
  SeparatorBuilder,
} from "discord.js";
import type { BotClient } from "@core/BotClient";
import { TicketRepository } from "@database/repositories";
import { Logger } from "@core/libs";
import {
  ACCENT_COLOR,
  ROBO_MANAGER_EMOJI,
  SUPPORT_REPORT_CHANNEL_ID,
  SUPPORT_ROLE,
  SUPPORT_ROLE_ID,
  TICKET_CREATED_COLOR,
  TICKET_TEXTCHAT_CATEGORY_ID,
} from "../config/misc";
import { ticketCategories } from "../config/categories";

// const TICKET_CATEGORY_ID = "PUT_DISCORD_CATEGORY_ID_HERE";
// const SUPPORT_ROLE_ID = "PUT_SUPPORT_ROLE_ID_HERE";

export function ticketCard(user?:string, categoryId?:string, subject?:string/*, openedAt?:Date*/) {
// const timeOpened = openedAt? Math.floor(openedAt?.getTime() / 1000): null;
  return `
## Ticket card
Invoker :   <@${user}>
Subject :   ${subject}
Category :  **${ticketCategories.find((ctg) => ctg.id === categoryId)?.displayName ?? "??"}**`.trim();
}

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
    const subject = interaction.fields.getTextInputValue("ticket_description");

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
      return;
    }

    async function createChannel(name:string) {
      return await interaction.guild!.channels.create({
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
    }
    // this try-catch nesting should hopefully help in making
    // sure channel is named with acceptable characters
    let channel : TextChannel;
    try {
      channel = await createChannel(interaction.user.username);
    } catch {
      
      try { 
        channel = await createChannel("unnamed");
      } catch {
        Logger.error("There was an issue when creating a ticket channel!");
        return;
      }
    }

    const ticketId = makeIdFromInputs(interaction.guild!.id, channel.id);

    const ticket = await TicketRepository.create({
      ticketId: ticketId,
      guildId: interaction.guild!.id,
      channelId: channel.id ?? "",
      userId: interaction.user.id,
      category: categoryId,
      subject: subject,
      status: "open",
      priority: "medium",
      messages: [],
      assignedTo: null,
      closedBy: null,
      closedAt: null,
      transcript: null,
    });

    const ticketCardString = ticketCard(interaction.user.id,categoryId, subject)

    await channel.send({
      components: [
        new ContainerBuilder()
          .setAccentColor(ACCENT_COLOR)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(ticketCardString),
          )
          .addSeparatorComponents(new SeparatorBuilder())
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `###  Once you are settled you can close this Ticket`,
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

    interaction.reply({
      components: [
        new ContainerBuilder()
          .setAccentColor(ACCENT_COLOR)
          .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
              `
## Ticket channel was created ! → <#${channel.id}>
### ${ROBO_MANAGER_EMOJI} Staff will be available ASAP!
`,
            ),
          ),
      ],
      flags: [MessageFlags.Ephemeral, MessageFlags.IsComponentsV2],
    });

    const report = new ContainerBuilder()
      .setAccentColor(TICKET_CREATED_COLOR)
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(
          `### ${SUPPORT_ROLE} - New support request`,
        ),
      )
      .addSeparatorComponents(new SeparatorBuilder())
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(ticketCardString),
      )
      .addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`Channel : <#${channel.id}>`),
      );
    let reportChannel;
    try {
      reportChannel = await interaction.guild!.channels.fetch(
        SUPPORT_REPORT_CHANNEL_ID,
      );
    } catch (error) {
      Logger.error("Failed to fetch support report channel", { error });
      return;
    }

    if (!reportChannel) {
      Logger.error(
        `Support report channel not found (ID: ${SUPPORT_REPORT_CHANNEL_ID})`,
      );
      return;
    }

    if (typeof reportChannel.isTextBased !== "function" || !reportChannel.isTextBased()) {
      Logger.error(
        `Support report channel is not text-based (ID: ${SUPPORT_REPORT_CHANNEL_ID}, type: ${reportChannel.type})`,
      );
      return;
    }

    try {
      await reportChannel.send({
        components: [report],
        flags: [MessageFlags.IsComponentsV2],
      });
    } catch (error) {
      Logger.error("Failed to send support report message", { error });
    }
  },
};
