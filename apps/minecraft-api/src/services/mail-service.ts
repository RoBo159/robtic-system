import { ApiError, normaliseUuid, type MailDto, type MailboxResponse } from "@sdk";
import { MinecraftMailRepository, type MailInput } from "@database/repositories";
import type { IMinecraftMail } from "@database/models/MinecraftMail";

/**
 * The in-game mailbox.
 *
 * <h2>Why the API owns this and not the plugin</h2>
 *
 * Every message this holds is generated while the recipient is usually offline — a report accepted
 * hours after it was filed, a jail applied to somebody who logged out, a warning issued from
 * Discord. A game server can only talk to players connected to it, so anything it "sends" to an
 * absent player is lost, and mail that arrives only if you happen to be online when it is written
 * is not mail.
 *
 * Keeping it here also means a network of servers shares one mailbox: a jail notice written while
 * the player was on survival is waiting for them when they join the lobby.
 */
export class MailService {
    static async send(input: MailInput): Promise<MailDto> {
        const record = await MinecraftMailRepository.send({
            ...input,
            recipientUuid: normaliseUuid(input.recipientUuid),
        });

        return this.toDto(record);
    }

    /**
     * Posts several mails, tolerating individual failures.
     *
     * Used where mail is a *consequence* of something already committed — accepting a report has
     * jailed somebody by the time this runs, and failing the whole request because a notification
     * could not be written would leave the caller believing the jail did not happen either.
     *
     * @returns how many were actually written.
     */
    static async sendAll(inputs: MailInput[]): Promise<number> {
        const results = await Promise.allSettled(inputs.map(input => this.send(input)));
        return results.filter(result => result.status === "fulfilled").length;
    }

    static async mailbox(guildId: string, uuid: string): Promise<MailboxResponse> {
        const normalised = normaliseUuid(uuid);

        const [rows, unread] = await Promise.all([
            MinecraftMailRepository.list(guildId, normalised),
            MinecraftMailRepository.countUnread(guildId, normalised),
        ]);

        return { uuid: normalised, items: rows.map(row => this.toDto(row)), unread };
    }

    /**
     * The important mail waiting to be shown on join.
     *
     * Deliberately does *not* mark anything announced. The plugin acknowledges what it actually put
     * in front of the player, because marking here and then failing to deliver — a disconnect during
     * the join sequence is the ordinary case — would lose a jail notice permanently. Showing one
     * twice is a far smaller problem than never showing it.
     */
    static async pending(guildId: string, uuid: string): Promise<MailboxResponse> {
        const normalised = normaliseUuid(uuid);

        const [rows, unread] = await Promise.all([
            MinecraftMailRepository.pendingAnnouncements(guildId, normalised),
            MinecraftMailRepository.countUnread(guildId, normalised),
        ]);

        return { uuid: normalised, items: rows.map(row => this.toDto(row)), unread };
    }

    /** Marks one mail read. Reading somebody else's is refused rather than silently ignored. */
    static async markRead(guildId: string, uuid: string, mailId: string): Promise<MailDto> {
        const existing = await MinecraftMailRepository.get(guildId, mailId);

        if (!existing) throw ApiError.notFound("That mail");

        if (existing.recipientUuid !== normaliseUuid(uuid)) {
            throw ApiError.forbidden("That mail belongs to somebody else.");
        }

        // Already read is not an error: the plugin opens a mail whenever the book is opened, and
        // reading one twice is ordinary.
        const updated = await MinecraftMailRepository.markRead(guildId, mailId);
        return this.toDto(updated ?? existing);
    }

    static async acknowledge(guildId: string, mailIds: string[]): Promise<void> {
        await MinecraftMailRepository.markAnnounced(guildId, mailIds);
    }

    private static toDto(record: IMinecraftMail): MailDto {
        return {
            id: String(record._id),
            category: record.category,
            subject: record.subject,
            body: record.body ?? [],
            senderName: record.senderName,
            important: record.important,
            read: record.read,
            referenceId: record.referenceId ?? null,
            createdAt: record.createdAt.toISOString(),
        };
    }
}
