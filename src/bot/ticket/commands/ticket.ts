import type { BotClient } from "@core/BotClient";
import {
  ChatInputCommandInteraction,
  LabelBuilder,
  ModalBuilder,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  TextDisplayBuilder,
  TextInputBuilder,
  TextInputStyle,
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
    .addSubcommand((sub) => sub.setName("create").setDescription("Create a new support ticket.")),
    // .addSubcommand((sub) => sub.setName("close").setDescription("Close your current ticket.")),

  async run(interaction: ChatInputCommandInteraction, client: BotClient) {
    if (!interaction.isChatInputCommand()) return;

    const sub = interaction.options.getSubcommand();
    if (sub === "create"){
      await interaction.showModal(ticketModal);
    }
  },
};
