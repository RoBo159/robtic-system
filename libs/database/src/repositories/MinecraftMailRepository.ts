import {
    MinecraftMail,
    type IMinecraftMail,
    type MinecraftMailCategory,
} from "@database/models/MinecraftMail";

/** What a caller has to supply to post a mail. Everything else has a sensible default. */
export interface MailInput {
    guildId: string;
    recipientUuid: string;
    recipientUsername: string;
    category: MinecraftMailCategory;
    subject: string;
    body: string[];
    senderName?: string;
    important?: boolean;
    referenceId?: string;
    serverId?: string;
}

/**
 * The in-game mailbox.
 *
 * Mail is never deleted by the plugin — a player marking one read leaves the row in place, so the
 * history of what somebody was told about their own punishments stays readable by staff. Pruning, if
 * a guild ever wants it, is an operator decision rather than something the read path does silently.
 */
export class MinecraftMailRepository {
    static async send(input: MailInput): Promise<IMinecraftMail> {
        return MinecraftMail.create({
            guildId: input.guildId,
            recipientUuid: input.recipientUuid.toLowerCase(),
            recipientUsername: input.recipientUsername,
            category: input.category,
            subject: input.subject,
            body: input.body,
            senderName: input.senderName ?? "Server",
            important: input.important ?? false,
            referenceId: input.referenceId,
            serverId: input.serverId,
        });
    }

    /** One player's mailbox, newest first. */
    static async list(guildId: string, recipientUuid: string, limit = 45): Promise<IMinecraftMail[]> {
        return MinecraftMail.find({ guildId, recipientUuid: recipientUuid.toLowerCase() })
            .sort({ createdAt: -1 })
            .limit(limit);
    }

    static async get(guildId: string, mailId: string): Promise<IMinecraftMail | null> {
        return MinecraftMail.findOne({ _id: mailId, guildId });
    }

    static async countUnread(guildId: string, recipientUuid: string): Promise<number> {
        return MinecraftMail.countDocuments({
            guildId,
            recipientUuid: recipientUuid.toLowerCase(),
            read: false,
        });
    }

    /**
     * Marks a mail read.
     *
     * Filtered on `read: false` so re-opening a mail does not keep rewriting `readAt` — the first
     * time it was seen is the interesting one.
     */
    static async markRead(guildId: string, mailId: string): Promise<IMinecraftMail | null> {
        return MinecraftMail.findOneAndUpdate(
            { _id: mailId, guildId, read: false },
            { $set: { read: true, readAt: new Date() } },
            { returnDocument: "after" }
        );
    }

    /**
     * The important mail this player has not been shown on join yet.
     *
     * Read and marked in two steps rather than one atomic update because the caller has to be able
     * to *deliver* it: marking first and then failing to send would lose the notice entirely, and a
     * jail notice shown twice is a far smaller problem than one never shown at all.
     */
    static async pendingAnnouncements(
        guildId: string,
        recipientUuid: string,
        limit = 5,
    ): Promise<IMinecraftMail[]> {
        return MinecraftMail.find({
            guildId,
            recipientUuid: recipientUuid.toLowerCase(),
            important: true,
            announced: false,
        })
            .sort({ createdAt: 1 })
            .limit(limit);
    }

    static async markAnnounced(guildId: string, mailIds: string[]): Promise<void> {
        if (mailIds.length === 0) return;

        await MinecraftMail.updateMany(
            { _id: { $in: mailIds }, guildId, announced: false },
            { $set: { announced: true, announcedAt: new Date() } },
        );
    }
}
