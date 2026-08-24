import { Schema, model, type Document } from "mongoose";

/**
 * The report lifecycle.
 *
 * `reviewing` sits between open and closed: a report a staff member has claimed but not yet finished
 * with. Without it a claimed report is indistinguishable from an unclaimed one, so two staff members
 * can pick up the same case and a queue count cannot tell "waiting" from "being handled" — which is
 * the whole point of claiming.
 *
 * `accepted` and `refused` are the two ways a report ends. They are separate from the older
 * `resolved` and `dismissed` because they mean something stronger: accepting a report jails the
 * reported player and mails both sides, so "this report was upheld" has to be answerable from the
 * status alone rather than inferred from whether a jail happens to exist.
 */
export const MINECRAFT_REPORT_STATUSES = [
    "open",
    "reviewing",
    "accepted",
    "refused",
    "resolved",
    "dismissed",
] as const;
export type MinecraftReportStatus = typeof MINECRAFT_REPORT_STATUSES[number];

/** The statuses a report can still be acted on from. */
export const MINECRAFT_REPORT_OPEN_STATUSES: MinecraftReportStatus[] = ["open", "reviewing"];

/** Where a player was standing. Kept flat so a stale world name cannot fail to deserialise. */
export interface IMinecraftReportLocation {
    world: string;
    x: number;
    y: number;
    z: number;
    serverId?: string;
    /** When this position was taken, which for the reported player may be much older than the report. */
    recordedAt?: Date;
}

/**
 * A player report filed in game with `/report`. Visible only to staff, kept permanently, and counted
 * towards the reported player's history so a repeatedly reported player surfaces in the join alert.
 *
 * <h2>The six-digit code, not the ObjectId</h2>
 *
 * Staff act on a report by typing `/report accept <id>`, and reading a 24-character hex ObjectId out
 * of a Discord embed and retyping it correctly is not something to ask of somebody mid-shift. So
 * every report also carries a six-digit code, unique within the guild, and that is what is printed
 * everywhere a human has to read it. The ObjectId remains the primary key.
 *
 * <h2>Locations are captured at filing time</h2>
 *
 * Both sides' positions are recorded when the report is filed rather than looked up when it is read:
 * by the time a staff member opens it, the reporter has walked away and the reported player may be
 * offline. A location resolved at read time would answer a question nobody asked.
 */
export interface IMinecraftReport extends Document {
    guildId: string;
    serverId: string;

    /** Six digits, unique per guild. What staff type and what the Discord embed prints. */
    code: string;

    reporterUuid: string;
    reporterUsername: string;
    /** Null when they have not linked Discord, which never blocks a report. */
    reporterDiscordId?: string;
    reporterLocation?: IMinecraftReportLocation;

    targetUuid: string;
    targetUsername: string;
    targetDiscordId?: string;
    targetLocation?: IMinecraftReportLocation;
    /** False when the reported player was offline at filing time, so staff know before teleporting. */
    targetOnline: boolean;

    reason: string;
    status: MinecraftReportStatus;

    /**
     * The staff member who claimed it, set when the status becomes `reviewing`.
     *
     * Assignment and status change together, atomically — see the repository's `claimReport`.
     * Recording one without the other is what allows a second staff member to claim an
     * already-claimed report, so they are never written separately.
     */
    assignedToUuid?: string;
    assignedToUsername?: string;
    claimedAt?: Date;

    resolvedByUuid?: string;
    resolvedByUsername?: string;
    resolvedAt?: Date;
    resolutionNote?: string;

    /** Set when accepting the report opened a jail sentence, so the two can be traced to each other. */
    jailApplied: boolean;

    createdAt: Date;
    updatedAt: Date;
}

const locationSchema = new Schema<IMinecraftReportLocation>(
    {
        world: { type: String, required: true, trim: true },
        x: { type: Number, required: true },
        y: { type: Number, required: true },
        z: { type: Number, required: true },
        serverId: { type: String, trim: true },
        recordedAt: { type: Date },
    },
    { _id: false }
);

const minecraftReportSchema = new Schema<IMinecraftReport>(
    {
        guildId: { type: String, required: true, index: true },
        serverId: { type: String, required: true, trim: true },

        code: { type: String, required: true, trim: true },

        reporterUuid: { type: String, required: true, lowercase: true, trim: true },
        reporterUsername: { type: String, required: true, trim: true },
        reporterDiscordId: { type: String, trim: true },
        reporterLocation: { type: locationSchema, default: undefined },

        targetUuid: { type: String, required: true, index: true, lowercase: true, trim: true },
        targetUsername: { type: String, required: true, trim: true },
        targetDiscordId: { type: String, trim: true },
        targetLocation: { type: locationSchema, default: undefined },
        targetOnline: { type: Boolean, default: false },

        reason: { type: String, required: true, trim: true },
        status: { type: String, enum: [...MINECRAFT_REPORT_STATUSES], default: "open", index: true },

        assignedToUuid: { type: String, lowercase: true, trim: true, index: true },
        assignedToUsername: { type: String, trim: true },
        claimedAt: { type: Date },

        resolvedByUuid: { type: String, lowercase: true, trim: true },
        resolvedByUsername: { type: String, trim: true },
        resolvedAt: { type: Date },
        resolutionNote: { type: String, trim: true },

        jailApplied: { type: Boolean, default: false },
    },
    { timestamps: true }
);

minecraftReportSchema.index({ guildId: 1, status: 1, createdAt: -1 });
minecraftReportSchema.index({ guildId: 1, targetUuid: 1, createdAt: -1 });

/**
 * The code is unique per guild, and that uniqueness is enforced here rather than by checking first.
 *
 * Two reports filed in the same second would both pass a "is this code taken?" read and then both
 * write it. The index makes the second write fail instead, which is what the repository's retry
 * loop is built on — see `addReport`.
 *
 * <h2>Partial, because of the reports that already exist</h2>
 *
 * Every report filed before codes existed has no `code` field, and to a plain unique index a missing
 * field is a null that collides with every other missing field — so on any database with more than
 * one historic report the index would fail to build, silently leaving new reports with no uniqueness
 * guarantee at all. The partial filter excludes those rows, so the constraint covers exactly the
 * documents it is meant to.
 */
minecraftReportSchema.index(
    { guildId: 1, code: 1 },
    { unique: true, partialFilterExpression: { code: { $type: "string" } } }
);

export const MinecraftReport = model<IMinecraftReport>("MinecraftReport", minecraftReportSchema);
