import { Schema, model, type Document } from "mongoose";
import { MINECRAFT_SERVER_STATES, type MinecraftServerState } from "@constants";

/**
 * Live state of one Paper server, written by the plugin on lifecycle events and on every
 * heartbeat. A heartbeat older than MINECRAFT_STATUS.heartbeatTimeoutMs is treated as a crash by
 * the bot, which is how a server that died without a clean shutdown gets reported.
 */
export interface IMinecraftServer extends Document {
    guildId: string;
    /** Stable identifier configured in the plugin, e.g. "survival". */
    serverKey: string;
    /** Human-readable name shown in the status embed, e.g. "Survival Server". */
    displayName: string;
    status: MinecraftServerState;
    onlinePlayers: number;
    maxPlayers: number;
    /** Server version string reported by Bukkit, e.g. "1.21.4". */
    version: string;
    /** Last time the plugin reported in; drives crash detection. */
    lastHeartbeatAt: Date;
    /** Last transition into ONLINE, used for the uptime field. */
    startedAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}

const minecraftServerSchema = new Schema<IMinecraftServer>(
    {
        guildId: { type: String, required: true, index: true },
        serverKey: { type: String, required: true, trim: true },
        displayName: { type: String, required: true, trim: true },
        status: { type: String, required: true, enum: [...MINECRAFT_SERVER_STATES], default: "OFFLINE" },
        onlinePlayers: { type: Number, default: 0, min: 0 },
        maxPlayers: { type: Number, default: 0, min: 0 },
        version: { type: String, default: "unknown", trim: true },
        lastHeartbeatAt: { type: Date, default: Date.now },
        startedAt: { type: Date },
    },
    { timestamps: true }
);

minecraftServerSchema.index({ guildId: 1, serverKey: 1 }, { unique: true });

export const MinecraftServer = model<IMinecraftServer>("MinecraftServer", minecraftServerSchema);
