import {
  ActionRow,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonComponent,
  ButtonInteraction,
  MessageFlags,
  type MessageActionRowComponent,
  type GuildMember,
} from "discord.js";
import type { BotClient } from "@core/bot-client";

import { StaffRepository, SubmissionTypeRepository } from "@database/repositories";
import { hasFullPower } from "@bot/utils/access";

export default {
  customId: /^staff-reject_/,

  async run(interaction: ButtonInteraction, client: BotClient) {
    await interaction.deferUpdate();

    const parts = interaction.customId.split("_");
    const key = parts[1];
    const userId = parts[2];

    const type = await SubmissionTypeRepository.get(interaction.guildId!, key);
    if (!type) {
      await interaction.followUp({ content: "❌ This submission type no longer exists.", flags: MessageFlags.Ephemeral });
      return;
    }

    const member = interaction.member as GuildMember;
    const isManager = type.managerRoleIds.some(id => member.roles.cache.has(id));
    if (!isManager && !hasFullPower(member)) {
      await interaction.followUp({ content: "❌ You don't have permission to reject this submission.", flags: MessageFlags.Ephemeral });
      return;
    }

    await StaffRepository.deleteSubmission(userId);

    const firstRow = interaction.message
      .components[0] as ActionRow<MessageActionRowComponent>;
    const components = firstRow.components;

    const interviewBtn = components[0];
    const rejectBtn = components[1];

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      ButtonBuilder.from(interviewBtn as ButtonComponent).setDisabled(true),
      ButtonBuilder.from(rejectBtn as ButtonComponent).setDisabled(true),
    );
    await interaction.editReply({ components: [row] });

    const user = await client.users.fetch(userId);
    await user.send(
      `Hello, your submission for **${type.name}** was rejected`,
    );

    await interaction.followUp({
      content: "✅ | Submission rejected",
      flags: MessageFlags.Ephemeral,
    });
  },
};
