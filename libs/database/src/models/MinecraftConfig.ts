import { Schema, model, type Document } from "mongoose";

/** One Discord role → one LuckPerms group. Only mapped groups are ever touched by the sync. */
export interface IMinecraftRoleMapping {
    roleId: string;
    /** LuckPerms group name, e.g. "moderator". */
    group: string;
}

/** Per-guild Minecraft integration settings, edited through `/minecraft config`. */
export interface IMinecraftConfig extends Document {
    guildId: string;
    /** Channel that hosts the auto-updating server status embed. */
    statusChannelId?: string;
    /** Channel bridged to in-game chat, both directions. */
    chatChannelId?: string;
    /** Whether Discord messages in the bridged channel are relayed into Minecraft. */
    chatBridgeEnabled: boolean;
    /** Whether LuckPerms groups are synchronised from Discord roles on join and on role change. */
    roleSyncEnabled: boolean;
    roleMappings: IMinecraftRoleMapping[];
    createdAt: Date;
    updatedAt: Date;
}

const roleMappingSchema = new Schema<IMinecraftRoleMapping>(
    {
        roleId: { type: String, required: true },
        group: { type: String, required: true, lowercase: true, trim: true },
    },
    { _id: false }
);

const minecraftConfigSchema = new Schema<IMinecraftConfig>(
    {
        guildId: { type: String, required: true, unique: true, index: true },
        statusChannelId: { type: String },
        chatChannelId: { type: String },
        chatBridgeEnabled: { type: Boolean, default: true },
        roleSyncEnabled: { type: Boolean, default: true },
        roleMappings: { type: [roleMappingSchema], default: [] },
    },
    { timestamps: true }
);

export const MinecraftConfig = model<IMinecraftConfig>("MinecraftConfig", minecraftConfigSchema);
