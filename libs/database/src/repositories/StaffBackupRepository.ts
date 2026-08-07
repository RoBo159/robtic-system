import { StaffBackup, type IStaffBackup, type IWorldLocation } from "@database/models/StaffBackup";

/** Everything the plugin captures before it clears a staff member's inventory. */
export interface StaffBackupInput {
    guildId: string;
    minecraftUuid: string;
    minecraftUsername: string;
    serverId: string;
    inventory: string;
    armor: string;
    offhand: string;
    enderChest?: string;
    xpLevel: number;
    xpProgress: number;
    food: number;
    health: number;
    heldSlot: number;
    location: IWorldLocation;
    baseGroup: string;
}

export class StaffBackupRepository {
    /**
     * Stores the pre-staff-mode snapshot. The caller must await this before clearing an inventory:
     * the row existing is the only thing that makes the restore survivable across a crash.
     */
    static async put(input: StaffBackupInput): Promise<IStaffBackup> {
        const { guildId, minecraftUuid, serverId, ...rest } = input;

        return StaffBackup.findOneAndUpdate(
            { guildId, minecraftUuid: minecraftUuid.toLowerCase(), serverId },
            { $set: rest },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IStaffBackup>;
    }

    static async get(guildId: string, minecraftUuid: string, serverId: string): Promise<IStaffBackup | null> {
        return StaffBackup.findOne({ guildId, minecraftUuid: minecraftUuid.toLowerCase(), serverId });
    }

    /**
     * Removes the backup once a restore is confirmed. Called only after the plugin has put the
     * items back — deleting any earlier would turn a failed restore into permanent item loss.
     */
    static async remove(guildId: string, minecraftUuid: string, serverId: string): Promise<void> {
        await StaffBackup.deleteOne({ guildId, minecraftUuid: minecraftUuid.toLowerCase(), serverId });
    }

    /** Outstanding backups for a server, which is how a crash is detected on the next start. */
    static async listByServer(guildId: string, serverId: string): Promise<IStaffBackup[]> {
        return StaffBackup.find({ guildId, serverId });
    }
}
