import {
  ButtonInteraction,
  TextChannel,
  DMChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ActionRow,
  MessageFlags,
  type MessageActionRowComponent,
  ButtonComponent,
  type GuildMember,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { startInterview } from "../../utils/hr/start-interview";
import { Submission } from "@database/models/Submission";
import { SubmissionTypeRepository } from "@database/repositories";
import { hasFullPower } from "@bot/utils/access";

export default {
  customId: /^staff-interview_/,
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
      await interaction.followUp({ content: "❌ You don't have permission to interview this submission.", flags: MessageFlags.Ephemeral });
      return;
    }

    const user = await client.users.fetch(userId);

    const firstRow = interaction.message.components[0] as ActionRow<MessageActionRowComponent>;
    const components = firstRow.components;

    const interviewBtn = components[0];
    const rejectBtn = components[1];

    if (interviewBtn?.type !== 2 || rejectBtn?.type !== 2) return;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      ButtonBuilder.from(interviewBtn as ButtonComponent).setDisabled(true),
      ButtonBuilder.from(rejectBtn as ButtonComponent).setDisabled(true)
    );
    await interaction.editReply({ components: [row] });

    const channel = interaction.channel as TextChannel;
    if (!channel) return;

    const thr = await channel.threads.create({
      name: `Interview | ${type.name} | ${user.displayName}`,
      startMessage: interaction.message,
    });
    await thr.send(`Interview manager: <@${interaction.user.id}>`);

    await Submission.findOneAndUpdate(
      { userId },
      {
        threadId: thr.id,
      },
    );

    const m = await user.send(
      "Your submission was accepted — the interview has started!\nYou have 5 minutes to answer here.",
    );

    const DM = m.channel as DMChannel;

    // The interview starts immediately on click — no longer waits for the applicant's first DM reply.
    await thr.send(`<@${interaction.user.id}>, Interview started`);
    startInterview(client, thr, DM, userId, interaction.user.id, type.key);
  },
};
