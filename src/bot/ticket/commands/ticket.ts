import type { BotClient } from "@core/BotClient";
import {
  ActionRowBuilder,
  ButtonStyle,
  CategoryChannel,
  ChatInputCommandInteraction,
  ContainerBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuComponent,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
  type SelectMenuComponentOptionData,
} from "discord.js";
import { ticketCategories } from "../config/categories";


export const ticketModal = (() => {
  const modalBuilder = new ModalBuilder()
    .setCustomId("ticket_open")
    .setTitle("Support Ticket");

  const categorySelectorBuilder = new StringSelectMenuBuilder()
    .setCustomId("ticket_category")
    .setPlaceholder("Choose a ticket category")
    .setOptions(
      ticketCategories.map((c) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(c.displayName)
          .setValue(c.id)
          .setDescription(c.description),
      ),
    )
    .setRequired(true);

  const categorySelectorLabel = new LabelBuilder()
    .setLabel("Choose type of support:")
    .setStringSelectMenuComponent(categorySelectorBuilder);

  const descriptionBuilder = new TextInputBuilder()
    .setCustomId("ticket_description")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("Short description..")
    .setMinLength(15)
    .setMaxLength(80)
    .setRequired(true);

  const descriptionLabel = new LabelBuilder()
    .setLabel("Enter the subject:")
    .setTextInputComponent(descriptionBuilder);

  const footerText = new TextDisplayBuilder().setContent(
    `Once you press 'Submit' a channel will be created -if you were applicable for a ticket- and staff members will be with you as soon as possible. `,
  );

  return modalBuilder
    .addLabelComponents([categorySelectorLabel,descriptionLabel])
    .addTextDisplayComponents(footerText);
})();

export default {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Description")
    .addSubcommand((sub) => sub.setName("panel").setDescription("Panel Test")),

  async run(interaction: ChatInputCommandInteraction, client: BotClient) {
    if (!interaction.isChatInputCommand()) return;

    await interaction.showModal(ticketModal);

  },
};
