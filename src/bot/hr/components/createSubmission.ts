import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalSubmitInteraction,
  TextChannel,
  MessageFlags
} from "discord.js";
import type { BotClient } from "@core/BotClient";

import { questions } from "../config/questions";
import { approvalChannelId } from "../config/departments";
import { StaffRepository } from "@database/repositories";

export default {
  customId: /^staff-submit_/,

  async run(interaction: ModalSubmitInteraction, client: BotClient) {
    const parts = interaction.customId.split("_");
    const dep = parts[1] as Department;
    const msgId = parts[2];

    const answers = questions.map((q) => ({
      id: q.id,
      question: q.question,
      answer: interaction.fields.getTextInputValue(q.id),
    }));

    const embed = new EmbedBuilder()
      .setTitle(`New ${dep} Department Submission`)
      .setDescription(`From <@${interaction.user.id}>`)
      .addFields(answers.map((a) => ({ name: a.question, value: a.answer })))
      .setColor("Blue")
      .setTimestamp();

    const accept = new ButtonBuilder()
      .setCustomId(`staff-accept_${dep}_${interaction.user.id}`)
      .setLabel("accept")
      .setStyle(ButtonStyle.Success);

    const reject = new ButtonBuilder()
      .setCustomId(`staff-reject_${dep}_${interaction.user.id}`)
      .setLabel("reject")
      .setStyle(ButtonStyle.Danger);

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      accept,
      reject,
    );

    const approvalChannel = interaction.guild?.channels.cache.get(
      approvalChannelId,
    ) as TextChannel;

    if (!approvalChannel) {
      return await interaction.reply({
        content: "Approval channel not found",
        flags: MessageFlags.Ephemeral,
      });
    }

    await approvalChannel.send({ embeds: [embed], components: [row] });

    StaffRepository.createSubmission({
      userId: interaction.user.id,
      department: dep,
      questions: answers,
    });

    await interaction.reply({
      content: " Submission sent for approval",
      flags: MessageFlags.Ephemeral,
    });
  },
};
