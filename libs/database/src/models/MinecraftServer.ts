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
    /** Free-form category — survival, skyblock, prison, minigames. */
    serverType?: string;
    /** Public connect address shown by `!ip`, e.g. "mc.robtic.org". */
    address?: string;
    port?: number;
    /** Client versions the proxy accepts, shown by `!version`. */
    supportedVersions: string[];
    /** Server software banner, e.g. "Paper 1.21.4" or "Purpur 1.21.4". */
    software?: string;
    javaVersion?: string;
    /** Live telemetry from the last heartbeat, rendered by `!status`. */
    tps?: number;
    memoryUsedMb?: number;
    memoryMaxMb?: number;
    cpuPercent?: number;
    uptimeMs?: number;
    world?: string;
    pluginVersion?: string;
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
        serverType: { type: String, trim: true },
        address: { type: String, trim: true },
        port: { type: Number, min: 1, max: 65535 },
        supportedVersions: { type: [String], default: [] },
        software: { type: String, trim: true },
        javaVersion: { type: String, trim: true },
        tps: { type: Number },
        memoryUsedMb: { type: Number },
        memoryMaxMb: { type: Number },
        cpuPercent: { type: Number },
        uptimeMs: { type: Number },
        world: { type: String, trim: true },
        pluginVersion: { type: String, trim: true },
    },
    { timestamps: true }
);

minecraftServerSchema.index({ guildId: 1, serverKey: 1 }, { unique: true });

export const MinecraftServer = model<IMinecraftServer>("MinecraftServer", minecraftServerSchema);
