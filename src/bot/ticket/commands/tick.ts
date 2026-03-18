import type { BotClient } from "@core/BotClient";
import { TicketRepository } from "@database/repositories";
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";

export default {
  data: new SlashCommandBuilder()
    .setName("tick")
    .setDescription("Description")
    .addSubcommand((sub) => sub.setName("test").setDescription("Panel Test")),

  async run(interaction: ChatInputCommandInteraction, client: BotClient) {
    if (!interaction.isChatInputCommand()) return;

    interaction.reply(
      `\`\`\`json\n${JSON.stringify(await TicketRepository.findByGuild(interaction.guild!.id))}\`\`\``,
    );
  },
};
