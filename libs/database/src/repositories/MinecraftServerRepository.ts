import { MinecraftServer, type IMinecraftServer } from "@database/models/MinecraftServer";
import type { MinecraftServerState } from "@constants";

export class MinecraftServerRepository {
    static async list(guildId: string): Promise<IMinecraftServer[]> {
        return MinecraftServer.find({ guildId }).sort({ displayName: 1 });
    }

    static async get(guildId: string, serverKey: string): Promise<IMinecraftServer | null> {
        return MinecraftServer.findOne({ guildId, serverKey });
    }

    /**
     * Upsert used by the plugin for both lifecycle transitions and periodic heartbeats.
     *
     * Optional telemetry fields are stripped when absent rather than written as undefined, so a
     * heartbeat that omits CPU does not erase the last known value.
     */
    static async report(snapshot: {
        guildId: string;
        serverKey: string;
        displayName: string;
        status: MinecraftServerState;
        onlinePlayers: number;
        maxPlayers: number;
        version: string;
        startedAt?: Date;
        serverType?: string;
        address?: string;
        port?: number;
        supportedVersions?: string[];
        software?: string;
        javaVersion?: string;
        tps?: number;
        memoryUsedMb?: number;
        memoryMaxMb?: number;
        cpuPercent?: number;
        uptimeMs?: number;
        world?: string;
        pluginVersion?: string;
    }): Promise<IMinecraftServer> {
        const { startedAt, ...rest } = snapshot;
        const defined = Object.fromEntries(Object.entries(rest).filter(([, value]) => value !== undefined));

        return MinecraftServer.findOneAndUpdate(
            { guildId: snapshot.guildId, serverKey: snapshot.serverKey },
            {
                $set: { ...defined, lastHeartbeatAt: new Date(), ...(startedAt ? { startedAt } : {}) },
            },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IMinecraftServer>;
    }

    static async setStatus(guildId: string, serverKey: string, status: MinecraftServerState): Promise<IMinecraftServer | null> {
        return MinecraftServer.findOneAndUpdate(
            { guildId, serverKey },
            { $set: { status, lastHeartbeatAt: new Date() } },
            { returnDocument: "after" }
        );
    }

    /**
     * Flips servers whose heartbeat went stale to CRASHED — a clean shutdown writes OFFLINE itself,
     * so silence while still marked ONLINE means the process died. Returns the affected servers.
     */
    static async markStaleAsCrashed(guildId: string, timeoutMs: number): Promise<IMinecraftServer[]> {
        const threshold = new Date(Date.now() - timeoutMs);
        const stale = await MinecraftServer.find({
            guildId,
            status: { $in: ["ONLINE", "RESTARTING"] },
            lastHeartbeatAt: { $lt: threshold },
        });

        if (stale.length === 0) return [];

        await MinecraftServer.updateMany(
            { _id: { $in: stale.map(server => server._id) } },
            { $set: { status: "CRASHED", onlinePlayers: 0 } }
        );

        return stale;
    }

    /** Every guild that has at least one registered server, used to drive the status/bridge loops. */
    static async guildIds(): Promise<string[]> {
        return MinecraftServer.distinct("guildId");
    }
}
