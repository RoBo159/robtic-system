import { MessageFlags, type ChatInputCommandInteraction, type GuildMember } from "discord.js";
import { TICKET_GUARD_MESSAGES } from "@constants";
import type { TicketCategory } from "../../../config/moderation/ticket";
import { isTicketStaff } from "./is-ticket-staff";

/** Replies with a permission error and returns false when the member isn't staff for the ticket's category. */
export async function requireTicketStaff(
    interaction: ChatInputCommandInteraction,
    category: TicketCategory
): Promise<boolean> {
    const member = interaction.member as GuildMember;
    if (isTicketStaff(member, category)) return true;

    await interaction.reply({
        content: TICKET_GUARD_MESSAGES.staffOnly,
        flags: MessageFlags.Ephemeral,
    });
    return false;
}
