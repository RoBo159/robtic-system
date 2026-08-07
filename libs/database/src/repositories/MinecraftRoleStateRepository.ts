import { MinecraftRoleState, type IMinecraftRoleState } from "@database/models/MinecraftRoleState";

export class MinecraftRoleStateRepository {
    /**
     * Replaces a member's projected roles. `$set` on the arrays rather than a merge is deliberate:
     * Discord's role list is authoritative and a role removed there must disappear here, which a
     * merge would silently prevent.
     */
    static async upsert(input: {
        guildId: string;
        discordId: string;
        minecraftUuid: string;
        roleIds: string[];
        groups: string[];
        reason: string;
    }): Promise<IMinecraftRoleState> {
        return MinecraftRoleState.findOneAndUpdate(
            { guildId: input.guildId, discordId: input.discordId },
            {
                $set: {
                    minecraftUuid: input.minecraftUuid.toLowerCase(),
                    roleIds: input.roleIds,
                    groups: input.groups,
                    reason: input.reason,
                    syncedAt: new Date(),
                },
            },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IMinecraftRoleState>;
    }

    static async getByUuid(guildId: string, minecraftUuid: string): Promise<IMinecraftRoleState | null> {
        return MinecraftRoleState.findOne({ guildId, minecraftUuid: minecraftUuid.toLowerCase() });
    }

    static async getByDiscordId(guildId: string, discordId: string): Promise<IMinecraftRoleState | null> {
        return MinecraftRoleState.findOne({ guildId, discordId });
    }

    /** Dropped alongside the link when a player unlinks, so no orphan projection survives. */
    static async remove(guildId: string, discordId: string): Promise<void> {
        await MinecraftRoleState.deleteOne({ guildId, discordId });
    }
}
