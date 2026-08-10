import { MessageFlags, type ChatInputCommandInteraction } from "discord.js";
import { TicketRepository } from "@database/repositories";
import type { ITicket } from "@database/models/Ticket";
import { TICKET_GUARD_MESSAGES } from "@constants";
import type { TicketCategory } from "../../../config/moderation/ticket";
import { findCategory } from "./find-category";

/** Resolves the interaction's channel to its open ticket + category, replying with an error and returning null if it isn't one. */
export async function requireOpenTicket(
    interaction: ChatInputCommandInteraction
): Promise<{ ticket: ITicket; category: TicketCategory } | null> {
    const ticket = await TicketRepository.findByChannel(interaction.channelId);
    if (!ticket || ticket.status === "closed") {
        await interaction.reply({
            content: TICKET_GUARD_MESSAGES.notATicket,
            flags: MessageFlags.Ephemeral,
        });
        return null;
    }

    const category = findCategory(ticket.category);
    if (!category) {
        await interaction.reply({
            content: TICKET_GUARD_MESSAGES.categoryMissing,
            flags: MessageFlags.Ephemeral,
        });
        return null;
    }

    return { ticket, category };
}
