import { MinecraftFreeze, type IMinecraftFreeze } from "@database/models/MinecraftFreeze";

export class MinecraftFreezeRepository {
    /**
     * Freezes a player, or returns the existing row when they already are. Upserting on the active
     * partial index keeps a second `/freeze` idempotent rather than an error the moderator has to
     * read and dismiss mid-incident.
     */
    static async freeze(input: {
        guildId: string;
        minecraftUuid: string;
        minecraftUsername: string;
        serverId: string;
        frozenByUuid: string;
        frozenByUsername: string;
        reason?: string;
    }): Promise<IMinecraftFreeze> {
        return MinecraftFreeze.findOneAndUpdate(
            { guildId: input.guildId, minecraftUuid: input.minecraftUuid.toLowerCase(), active: true },
            {
                $setOnInsert: {
                    minecraftUsername: input.minecraftUsername,
                    serverId: input.serverId,
                    frozenByUuid: input.frozenByUuid.toLowerCase(),
                    frozenByUsername: input.frozenByUsername,
                    reason: input.reason,
                    frozenAt: new Date(),
                    disconnectedWhileFrozen: false,
                },
            },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IMinecraftFreeze>;
    }

    static async findActive(guildId: string, minecraftUuid: string): Promise<IMinecraftFreeze | null> {
        return MinecraftFreeze.findOne({ guildId, minecraftUuid: minecraftUuid.toLowerCase(), active: true });
    }

    static async unfreeze(guildId: string, minecraftUuid: string, unfrozenByUuid: string): Promise<IMinecraftFreeze | null> {
        return MinecraftFreeze.findOneAndUpdate(
            { guildId, minecraftUuid: minecraftUuid.toLowerCase(), active: true },
            { $set: { active: false, unfrozenAt: new Date(), unfrozenByUuid: unfrozenByUuid.toLowerCase() } },
            { returnDocument: "after" }
        );
    }

    /** Records that a frozen player logged out, which is what the staff alert is built from. */
    static async markDisconnected(guildId: string, minecraftUuid: string): Promise<void> {
        await MinecraftFreeze.updateOne(
            { guildId, minecraftUuid: minecraftUuid.toLowerCase(), active: true },
            { $set: { disconnectedWhileFrozen: true } }
        );
    }

    static async listActive(guildId: string): Promise<IMinecraftFreeze[]> {
        return MinecraftFreeze.find({ guildId, active: true }).sort({ frozenAt: -1 });
    }
}
