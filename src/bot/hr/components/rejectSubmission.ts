import {
  ActionRow,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonComponent,
  ButtonInteraction,
  MessageFlags,
  type MessageActionRowComponent,
} from "discord.js";
import type { BotClient } from "@core/BotClient";

import { StaffRepository } from "@database/repositories";

export default {
  customId: /^staff-reject_/,

  async run(interaction: ButtonInteraction, client: BotClient) {
    const parts = interaction.customId.split("_");
    const dep = parts[1] as Department;
    const userId = parts[2];

    await StaffRepository.deleteSubmission(userId);

    const firstRow = interaction.message
      .components[0] as ActionRow<MessageActionRowComponent>;
    const components = firstRow.components;
    
    const acceptBtn = components[0];
    const rejectBtn = components[1];

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      ButtonBuilder.from(acceptBtn as ButtonComponent).setDisabled(true),
      ButtonBuilder.from(rejectBtn as ButtonComponent).setDisabled(true),
    );
    await interaction.update({ components: [row] });

    const user = await client.users.fetch(userId);
    await user.send(
      `Hello, your submission for the **${dep}** Department was rejected`,
    );

    await interaction.followUp({
      content: "✅ | Submission rejected",
      flags: MessageFlags.Ephemeral,
    });
  },
};
