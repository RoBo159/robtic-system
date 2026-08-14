import type { GuildMember } from "discord.js";
import { isGuildOperator } from "@bot/utils/access";
import type { TicketCategory } from "../../../config/moderation/ticket";

export function isTicketStaff(member: GuildMember, category: TicketCategory): boolean {
    return (
        isGuildOperator(member) ||
        member.roles.cache.has(category.supportRoleId) ||
        member.roles.cache.has(category.adminRoleId)
    );
}
