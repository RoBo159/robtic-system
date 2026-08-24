import { Schema, model, type Document } from "mongoose";

/**
 * What produced a mail. Drives the icon the in-game list shows and nothing else — the body is
 * always plain text, so a category this server has never heard of still renders.
 */
export const MINECRAFT_MAIL_CATEGORIES = [
    "report_accepted",
    "report_refused",
    "jailed",
    "warned",
    "system",
] as const;

export type MinecraftMailCategory = typeof MINECRAFT_MAIL_CATEGORIES[number];

/**
 * A message waiting for a player in game.
 *
 * <h2>Why this is not a chat message</h2>
 *
 * Everything that generates one of these happens while the recipient is very often offline: a report
 * is accepted hours after it was filed, a jail is applied to somebody who logged out, a warning is
 * issued from Discord. A chat line sent to a player who is not connected is simply lost, and the
 * player never learns what happened to them — which for "you have been jailed" is the difference
 * between a punishment and an unexplained teleport.
 *
 * So it is stored, and delivered the next time they join.
 *
 * <h2>Important mail is shown before anything else</h2>
 *
 * `important` marks the mail a player must not be able to miss — the outcome of their own report, a
 * jail, a warning. Those are surfaced on join ahead of every other join message. Ordinary mail waits
 * in the mailbox until they open it.
 */
export interface IMinecraftMail extends Document {
    guildId: string;
    recipientUuid: string;
    recipientUsername: string;

    category: MinecraftMailCategory;
    subject: string;
    /** One entry per line. Stored split so the book renderer does not have to guess where to break. */
    body: string[];

    /** Who or what sent it. "Server" for anything the system generated on its own. */
    senderName: string;

    important: boolean;
    read: boolean;
    readAt?: Date;

    /** Shown on join, so a jail notice is not repeated every session once it has been seen. */
    announced: boolean;
    announcedAt?: Date;

    /** The report, jail or warning this mail is about, for the in-game detail view. */
    referenceId?: string;
    serverId?: string;

    createdAt: Date;
    updatedAt: Date;
}

const minecraftMailSchema = new Schema<IMinecraftMail>(
    {
        guildId: { type: String, required: true, index: true },
        recipientUuid: { type: String, required: true, index: true, lowercase: true, trim: true },
        recipientUsername: { type: String, required: true, trim: true },

        category: { type: String, enum: [...MINECRAFT_MAIL_CATEGORIES], default: "system" },
        subject: { type: String, required: true, trim: true },
        body: { type: [String], default: [] },

        senderName: { type: String, default: "Server", trim: true },

        important: { type: Boolean, default: false, index: true },
        read: { type: Boolean, default: false, index: true },
        readAt: { type: Date },

        announced: { type: Boolean, default: false },
        announcedAt: { type: Date },

        referenceId: { type: String, trim: true },
        serverId: { type: String, trim: true },
    },
    { timestamps: true }
);

/** The mailbox read: one player's mail, newest first. */
minecraftMailSchema.index({ guildId: 1, recipientUuid: 1, createdAt: -1 });

/** The join read: what this player has not been shown yet. */
minecraftMailSchema.index({ guildId: 1, recipientUuid: 1, announced: 1, important: 1 });

export const MinecraftMail = model<IMinecraftMail>("MinecraftMail", minecraftMailSchema);
