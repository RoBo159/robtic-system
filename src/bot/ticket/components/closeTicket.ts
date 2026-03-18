import type { BotClient } from "@core/BotClient";
import { Logger } from "@core/libs";
import { TicketRepository } from "@database/repositories";
import type { ButtonInteraction } from "discord.js";

export default {
  customId: /^ticket_close_/,

  async run(interaction: ButtonInteraction, client: BotClient) { 
    const [_0, _1, ticketId] = interaction.customId.split("_");

    // TicketRepository.clearAll();
    // return;

    const ticket = await TicketRepository.close(ticketId, "test");
    Logger.debug(ticket?.channelId);
    Logger.debug(interaction.id)
    if (interaction.channelId !== ticket?.channelId) {
      return;
    }

    await interaction.deferUpdate();
    await interaction.channel?.delete();

  }
}