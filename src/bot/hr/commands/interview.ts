import {
  resultChannelId,
  STAFF_TRAINEE_ROLE_ID,
} from "./../config/departments";
import { STAFF_TEAM_ROLE_ID } from "@core/config/constants";
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
  MessageFlags
} from "discord.js";
import type { BotClient } from "@core/BotClient";
import { StaffRepository } from "@database/repositories";
import { departments } from "../config/departments";
import { interviewCollectors } from "../utils/interviewCollectors";

export default {
  data: new SlashCommandBuilder()
    .setName("interview")
    .setDescription("interview command")
    .addSubcommand((sub) =>
      sub.setName("accept").setDescription("Accept the interview"),
    )
    .addSubcommand((sub) =>
      sub.setName("reject").setDescription("Reject the interview"),
    ),

  async run(interaction: ChatInputCommandInteraction, client: BotClient) {
    const sub = interaction.options.getSubcommand();

    const data = await StaffRepository.getSubmissionByThreadId(
      interaction.channelId,
    );

    if (!data) {
      return await interaction.reply({
        content: "❌ | Interview not found",
        flags: MessageFlags.Ephemeral,
      });
    }

    const user = await client.users.fetch(data.userId);
    const member = await interaction.guild?.members.fetch(data.userId);

    const collectors = interviewCollectors.get(data.userId);
    if (collectors) {
      collectors.DMCollector.stop();
      collectors.thrCollector.stop();
      interviewCollectors.delete(data.userId);
    }

    if (sub === "accept") {
      data.isApproved = true;
      data.save();

      const dep = departments.find((d) => d.name === data.department);

      await member?.roles.add([
        dep?.roleId!,
        STAFF_TEAM_ROLE_ID,
        STAFF_TRAINEE_ROLE_ID,
      ]);

      await interaction.reply({
        content: "✅ | Submission accepted",
        flags: MessageFlags.Ephemeral,
      });

      user.send("Your submission has been accepted");
    }

    if (sub === "reject") {
      if (data.isApproved) {
        return interaction.reply({
          content: "❌ | This submission was accepted. You can’t reject it now",
          flags: MessageFlags.Ephemeral,
        });
      }

      await StaffRepository.deleteSubmission(user.id);

      await interaction.reply({
        content: "✅ | Submission rejected",
        flags: MessageFlags.Ephemeral,
      });

      user.send("Your submission has been rejected");
    }

    const embed = new EmbedBuilder()
      .setTitle(
        sub === "accept" ? "✅ Interview Accepted" : "❌ Interview Rejected",
      )
      .addFields(
        { name: "Department", value: data.department },
        { name: "Submitter", value: `<@${data.userId}>` },
        { name: "Manager", value: `<@${interaction.user.id}>` },
      )
      .setColor(sub === "accept" ? "Green" : "Red")
      .setTimestamp();

    const resultChannel = interaction.guild?.channels.cache.get(resultChannelId);
    if (!resultChannel?.isTextBased()) return;
    resultChannel?.send({
      embeds: [embed],
    });
  },
};
