import { BRANCH_CONFIG } from "@config";
import { STAFF_TEAM_ROLE_ID } from "@constants";
import {
  SlashCommandBuilder,
  EmbedBuilder,
  ChatInputCommandInteraction,
  MessageFlags,
  type GuildMember,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { StaffRepository, SubmissionTypeRepository } from "@database/repositories";
import { interviewCollectors } from "../../utils/hr/interview-collectors";
import { hasFullPower } from "@bot/utils/access";

export default {
    category: "Staff",
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
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const sub = interaction.options.getSubcommand();

    const data = await StaffRepository.getSubmissionByThreadId(
      interaction.channelId,
    );

    if (!data) {
      return await interaction.editReply({
        content: "❌ | Interview not found",
      });
    }

    const type = await SubmissionTypeRepository.get(interaction.guildId!, data.department);
    const manager = interaction.member as GuildMember;
    const isManager = type?.managerRoleIds.some((id) => manager.roles.cache.has(id)) ?? false;

    if (!isManager && !hasFullPower(manager)) {
      return await interaction.editReply({
        content: "❌ | You don't have permission to decide on this interview.",
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
      try {
        await member?.roles.add([
          ...(type?.grantRoleIds ?? []),
          STAFF_TEAM_ROLE_ID,
          BRANCH_CONFIG.roles.hrStaffTrainee,
        ]);
      } catch (err) {
        await interaction.editReply({
          content: "❌ | I couldn't grant one of the roles — my role is likely positioned too low in Server Settings → Roles (my role must sit above every role I grant), or I'm missing the Manage Roles permission. The submission was left untouched, so you can retry after fixing this.",
        });
        return;
      }

      await StaffRepository.deleteSubmission(data.userId);

      const existingStaff = await StaffRepository.findByDiscordId(data.userId);
      if (!existingStaff) {
        await StaffRepository.create({
          discordId: data.userId,
          username: user.username,
          department: data.department,
          position: "Staff",
          hiredAt: new Date(),
          status: "active",
        });
      }

      await interaction.editReply({
        content: "✅ | Submission accepted",
      });

      user.send("Your submission has been accepted");
    }

    if (sub === "reject") {
      if (data.isApproved) {
        return interaction.editReply({
          content: "❌ | This submission was accepted. You can’t reject it now",
        });
      }

      await StaffRepository.deleteSubmission(user.id);

      await interaction.editReply({
        content: "✅ | Submission rejected",
      });

      user.send("Your submission has been rejected");
    }

    const embed = new EmbedBuilder()
      .setTitle(
        sub === "accept" ? "✅ Interview Accepted" : "❌ Interview Rejected",
      )
      .addFields(
        { name: "Submission Type", value: type?.name ?? data.department },
        { name: "Submitter", value: `<@${data.userId}>` },
        { name: "Manager", value: `<@${interaction.user.id}>` },
      )
      .setColor(sub === "accept" ? "Green" : "Red")
      .setTimestamp();

    const resultChannel = interaction.guild?.channels.cache.get(BRANCH_CONFIG.channels.hrResult);
    if (!resultChannel?.isTextBased()) return;
    resultChannel?.send({
      embeds: [embed],
    });
  },
};
