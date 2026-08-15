import { Point, type IPoint } from "@database/models/Point";
import { PointHistory, type PointSource } from "@database/models/PointHistory";

export interface PointMovement {
    guildId: string;
    discordId: string;
    username: string;
    /** Signed: positive earned, negative spent. */
    amount: number;
    source: PointSource;
    detail?: string;
    actorId?: string | null;
}

export type ProgressKind = "message" | "combo" | "voice";

const PROGRESS_FIELD: Record<ProgressKind, keyof IPoint & string> = {
    message: "messageProgress",
    combo: "comboProgress",
    voice: "voiceProgress",
};

export class PointsRepository {
    static async findOrCreate(guildId: string, discordId: string, username: string): Promise<IPoint> {
        return Point.findOneAndUpdate(
            { guildId, discordId },
            { $setOnInsert: { username } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IPoint>;
    }

    static async get(guildId: string, discordId: string): Promise<IPoint | null> {
        return Point.findOne({ guildId, discordId });
    }

    /**
     * Applies a signed movement and writes the ledger row for it.
     *
     * `lifetimePoints` only ever climbs — spending reduces the balance alone, so "earned" stays a
     * meaningful statistic after a member cashes out.
     */
    static async move(input: PointMovement): Promise<IPoint> {
        const { guildId, discordId, username, amount, source, detail = "", actorId = null } = input;

        const updated = await Point.findOneAndUpdate(
            { guildId, discordId },
            {
                $inc: { points: amount, ...(amount > 0 ? { lifetimePoints: amount } : {}) },
                $setOnInsert: { username },
            },
            { upsert: true, returnDocument: "after" }
        ) as IPoint;

        await PointHistory.create({
            guildId,
            discordId,
            amount,
            source,
            detail,
            balanceAfter: updated.points,
            actorId,
        });

        return updated;
    }

    /**
     * Adds progress from one source and converts whole units into Points.
     *
     * The remainder is carried rather than dropped (`progress -= earned * rate`), so nothing is
     * lost at the boundary and a member who is one message short keeps that message.
     */
    static async addProgress(
        guildId: string,
        discordId: string,
        username: string,
        kind: ProgressKind,
        amount: number,
        rate: number,
        detail = "",
    ): Promise<number> {
        if (rate <= 0 || amount <= 0) return 0;
        const field = PROGRESS_FIELD[kind];

        const record = await Point.findOneAndUpdate(
            { guildId, discordId },
            { $inc: { [field]: amount }, $setOnInsert: { username } },
            { upsert: true, returnDocument: "after" }
        ) as IPoint;

        const earned = Math.floor((record[field] as number) / rate);
        if (earned <= 0) return 0;

        await Point.updateOne(
            { guildId, discordId },
            { $inc: { [field]: -earned * rate } },
        );

        await this.move({ guildId, discordId, username, amount: earned, source: kind, detail });
        return earned;
    }

    /** Moves RC without touching Points — the conversion service handles both sides. */
    static async addRc(guildId: string, discordId: string, amount: number): Promise<IPoint> {
        return Point.findOneAndUpdate(
            { guildId, discordId },
            { $inc: { rc: amount } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IPoint>;
    }

    static async getTop(guildId: string, limit = 10): Promise<IPoint[]> {
        return Point.find({ guildId }).sort({ points: -1 }).limit(limit);
    }

    static async getRank(guildId: string, discordId: string): Promise<number> {
        const record = await Point.findOne({ guildId, discordId });
        if (!record) return 0;
        return (await Point.countDocuments({ guildId, points: { $gt: record.points } })) + 1;
    }
}
