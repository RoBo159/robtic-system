import {
  ActionRowBuilder,
  ButtonInteraction,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type { BotClient } from "@core/BotClient";

import { questions } from "../config/questions";
import { StaffRepository } from "@database/repositories";

export default {
  customId: /^staff-start_/,

  async run(interaction: ButtonInteraction, client: BotClient) {
    const parts = interaction.customId.split("_");
    const dep = parts[1] as Department;

    const data = await StaffRepository.getSubmission(interaction.user.id);
    if (data) {
      return await interaction.reply({
        content: ":x: | You already have an active submission ",
        flags: MessageFlags.Ephemeral,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId(`staff-submit_${dep}`)
      .setTitle(`${dep} Department Submission`)
      .addComponents(
        questions.map((q) => {
          return new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId(q.id)
              .setLabel(q.question)
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(true),
          );
        }),
      );

    await interaction.showModal(modal);
  },
};
