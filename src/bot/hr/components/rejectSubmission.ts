import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import type { BotClient } from "@core/BotClient";

import { questions } from "../config/questions";
import { StaffRepository } from "@database/repositories";

export default {
  customId: /^staff-reject_/,

  async run(interaction: ButtonInteraction, client: BotClient) {
    const parts = interaction.customId.split("_");
    const dep = parts[1] as Department;
    const userId = parts[2];

    await StaffRepository.deleteSubmission(userId);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      ButtonBuilder.from(
        interaction.message.components[0].components[0] as any,
      ).setDisabled(true),
      ButtonBuilder.from(
        interaction.message.components[0].components[1] as any,
      ).setDisabled(true),
    );
    await interaction.update({ components: [row] });

    const user = await client.users.fetch(userId);
    await user.send(
      `Hello, your submission for the **${dep}** Department was rejected`,
    );

    await interaction.reply({
      content: "✅ | Submission rejected",
      ephemeral: true,
    });
  },
};
