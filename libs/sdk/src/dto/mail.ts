import type { ServerIdentity } from "./common";

/**
 * What produced a mail.
 *
 * The plugin picks an icon from this and nothing else — the body is always plain text, so a category
 * added by a newer API than the plugin still renders, just with the default icon.
 */
export type MailCategory = "report_accepted" | "report_refused" | "jailed" | "warned" | "system";

/** One message in a player's mailbox. */
export interface MailDto {
    id: string;
    category: MailCategory;
    subject: string;
    /** One entry per line, already split — the book renderer does not have to guess where to break. */
    body: string[];
    senderName: string;
    /** Shown on join ahead of every other message, and never quietly missed. */
    important: boolean;
    read: boolean;
    /** The report, jail or warning this is about, when there is one. */
    referenceId: string | null;
    createdAt: string;
}

/** `GET /api/mail` — one player's mailbox. */
export interface MailboxResponse {
    uuid: string;
    items: MailDto[];
    unread: number;
}

/**
 * `GET /api/mail/pending` — the important mail this player has not been shown on join yet.
 *
 * Separate from the mailbox read because it is on the join path, which is time-critical and must not
 * pull down forty read messages to find the one new jail notice.
 */
export interface PendingMailResponse {
    uuid: string;
    items: MailDto[];
    unread: number;
}

/** `POST /api/mail/read` — marks one mail read, or acknowledges a set as shown on join. */
export interface MarkMailRequest extends ServerIdentity {
    guildId: string;
    uuid: string;
    /** Omitted when only acknowledging announcements. */
    mailId?: string;
    /** Mail shown to the player on join, so a jail notice is not repeated every session. */
    announcedIds?: string[];
    requestId: string;
}

/** `POST /api/mail` — post a mail. Used by the game server and by Discord-side automation. */
export interface SendMailRequest extends ServerIdentity {
    guildId: string;
    uuid: string;
    username: string;
    category: MailCategory;
    subject: string;
    body: string[];
    senderName?: string;
    important?: boolean;
    referenceId?: string;
    requestId: string;
}
