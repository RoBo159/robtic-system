import {
  ButtonInteraction,
  TextChannel,
  DMChannel,
  ActionRowBuilder,
  ButtonBuilder,
  ActionRow,
  type MessageActionRowComponent,
  ButtonComponent,
} from "discord.js";
import type { BotClient } from "@core/BotClient";
import { startInterview } from "../utils/startInterview";
import { Submission } from "@database/models/Submission";

export default {
  customId: /^staff-accept_/,
  async run(interaction: ButtonInteraction, client: BotClient) {
    const parts = interaction.customId.split("_");
    const dep = parts[1] as Department;
    const userId = parts[2];
    const user = await client.users.fetch(userId);

    const firstRow = interaction.message.components[0] as ActionRow<MessageActionRowComponent>;
    const components = firstRow.components;

    const acceptBtn = components[0];
    const rejectBtn = components[1];

    if (acceptBtn?.type !== 2 || rejectBtn?.type !== 2) return;

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      ButtonBuilder.from(acceptBtn as ButtonComponent).setDisabled(true),
      ButtonBuilder.from(rejectBtn as ButtonComponent).setDisabled(true)
    );
    await interaction.update({ components: [row] });

    const channel = interaction.channel as TextChannel;
    if (!channel) return;

    const thr = await channel.threads.create({
      name: `Interview | ${dep} | ${user.displayName}`,
      startMessage: interaction.message,
    });
    thr.send(`Interview manager: <@${interaction.user.id}>`);

    await Submission.findOneAndUpdate(
      { userId },
      {
        threadId: thr.id,
      },
    );

    const m = await user.send(
      "Your submission was accepted\nSend a message to start the 5-minute interview",
    );

    const DM = m.channel as DMChannel;

    const collector = DM.createMessageCollector({
      filter: (msg) => !msg.author.bot,
      max: 1,
      time: 300000,
    });

    collector.on("collect", async (m) => {
      await thr.send(`<@${interaction.user.id}>, Interview started`);
      await thr.send(m.content);
      startInterview(client, thr, DM, userId, interaction.user.id, dep);
    });
  },
};
