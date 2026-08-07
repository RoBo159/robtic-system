import { MinecraftJail, type IMinecraftJail } from "@database/models/MinecraftJail";

export class MinecraftJailRepository {
    /**
     * Opens a sentence. The partial unique index on unreleased rows is what makes a double `/jail`
     * a conflict rather than two overlapping sentences, so the caller checks {@link findActive}
     * first and surfaces the existing sentence instead of stacking a second.
     */
    static async open(input: {
        guildId: string;
        minecraftUuid: string;
        minecraftUsername: string;
        serverId: string;
        reason: string;
        moderatorUuid: string;
        moderatorUsername: string;
        durationMs: number | null;
    }): Promise<IMinecraftJail> {
        const jailedAt = new Date();
        return MinecraftJail.create({
            ...input,
            minecraftUuid: input.minecraftUuid.toLowerCase(),
            jailedAt,
            releaseAt: input.durationMs === null ? null : new Date(jailedAt.getTime() + input.durationMs),
        });
    }

    static async findActive(guildId: string, minecraftUuid: string): Promise<IMinecraftJail | null> {
        return MinecraftJail.findOne({ guildId, minecraftUuid: minecraftUuid.toLowerCase(), released: false });
    }

    static async release(
        guildId: string,
        minecraftUuid: string,
        releasedBy: { uuid: string; username: string },
        reason?: string,
    ): Promise<IMinecraftJail | null> {
        return MinecraftJail.findOneAndUpdate(
            { guildId, minecraftUuid: minecraftUuid.toLowerCase(), released: false },
            {
                $set: {
                    released: true,
                    releasedAt: new Date(),
                    releasedByUuid: releasedBy.uuid.toLowerCase(),
                    releasedByUsername: releasedBy.username,
                    releaseReason: reason,
                },
            },
            { returnDocument: "after" }
        );
    }

    /** Sentences whose time has run out, for the API's release sweep. */
    static async findExpired(now: Date, limit: number): Promise<IMinecraftJail[]> {
        return MinecraftJail.find({ released: false, releaseAt: { $ne: null, $lte: now } }).limit(limit);
    }

    static async history(guildId: string, minecraftUuid: string, limit: number, offset: number): Promise<IMinecraftJail[]> {
        return MinecraftJail.find({ guildId, minecraftUuid: minecraftUuid.toLowerCase() })
            .sort({ jailedAt: -1 })
            .skip(offset)
            .limit(limit);
    }

    static async countHistory(guildId: string, minecraftUuid: string): Promise<number> {
        return MinecraftJail.countDocuments({ guildId, minecraftUuid: minecraftUuid.toLowerCase() });
    }

    static async listActive(guildId: string): Promise<IMinecraftJail[]> {
        return MinecraftJail.find({ guildId, released: false }).sort({ jailedAt: -1 });
    }

    static async markDiscordRoleApplied(jailId: string, applied: boolean): Promise<void> {
        await MinecraftJail.updateOne({ _id: jailId }, { $set: { discordRoleApplied: applied } });
    }

    /** Recent sentences across the guild, for the staff dashboard's punishment feed. */
    static async recent(guildId: string, limit: number): Promise<IMinecraftJail[]> {
        return MinecraftJail.find({ guildId }).sort({ jailedAt: -1 }).limit(limit);
    }
}
