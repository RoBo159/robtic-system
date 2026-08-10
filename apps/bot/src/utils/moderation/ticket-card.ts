import { findCategory } from "./ticket-guard";

export function ticketCard(userId: string, categoryId: string, subject: string): string {
    return `
## Ticket card
Invoker :   <@${userId}>
Subject :   ${subject}
Category :  **${findCategory(categoryId)?.label ?? "??"}**`.trim();
}
