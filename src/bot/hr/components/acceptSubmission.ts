import {
  ButtonInteraction,
  TextChannel,
  DMChannel,
  ActionRowBuilder,
  ButtonBuilder,
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

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      ButtonBuilder.from(
        interaction.message.components[0].components[0] as any,
      ).setDisabled(true),
      ButtonBuilder.from(
        interaction.message.components[0].components[1] as any,
      ).setDisabled(true),
    );
    await interaction.update({ components: [row] });

    const thr = await (interaction.channel as TextChannel).threads.create({
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
