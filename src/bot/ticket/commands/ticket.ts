import type { BotClient } from "@core/BotClient";
import {
  ActionRowBuilder,
  ButtonStyle,
  ChatInputCommandInteraction,
  ContainerBuilder,
  MessageFlags,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuComponent,
  StringSelectMenuOptionBuilder,
  UserSelectMenuBuilder,
  type SelectMenuComponentOptionData,
} from "discord.js";
import { ticketCategories } from "../config/categories";

export default {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Description")
    .addSubcommand((sub) => sub.setName("panel").setDescription("Panel Test")),

  async run(interaction: ChatInputCommandInteraction, client: BotClient) {
    if (!interaction.isChatInputCommand()) return;

    // await interaction.reply({
    //   content: "Only you can see this.",
    //   flags: MessageFlags.Ephemeral,
    // });

    // const menu = new StringSelectMenuBuilder()
    //   .setCustomId("ticket_category")
    //   .setPlaceholder("Choose a ticket category")
    //   .addOptions(
    //     ticketCategories.map((c) =>
    //       new StringSelectMenuOptionBuilder()
    //         .setLabel(c.displayName)
    //         .setValue(c.id)
    //         .setDescription(c.description),
    //     ),
    //   );
    const menu = new ContainerBuilder()
      .setAccentColor(0x0099ff)
      .addTextDisplayComponents((textDisplay) =>
        textDisplay.setContent(
          "This text is inside a Text Display component! You can use **any __markdown__** available inside this component too.",
        ),
      )
      .addActionRowComponents((actionRow) =>
        actionRow.setComponents(
          new StringSelectMenuBuilder()
            .setCustomId("ticket_category")
            .setPlaceholder("Choose a ticket category")
            .addOptions(
              ticketCategories.map((c) =>
                new StringSelectMenuOptionBuilder()
                  .setLabel(c.displayName)
                  .setValue(c.id)
                  .setDescription(c.description),
              ),
            ),
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
              .setStyle(ButtonStyle.Primary),
          ),
      ); 

    await interaction.reply({
      flags: MessageFlags.Ephemeral | MessageFlags.IsComponentsV2,
      components: [menu],
    });
  },
};
