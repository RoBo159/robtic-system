import { Events } from "discord.js";
import type { BotClient } from "@core/BotClient";
import { AuditLogRepository } from "@database/repositories";

function isObject(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === "object";
}

function trimString(text: string, limit = 400): string {
    if (text.length <= limit) return text;
    return `${text.slice(0, limit)}...`;
}

function sanitize(value: unknown, depth = 0): unknown {
    if (value == null) return value;
    if (typeof value === "string") return trimString(value, 500);
    if (typeof value === "number" || typeof value === "boolean") return value;
    if (depth >= 2) return "[max-depth]";

    if (Array.isArray(value)) {
        return value.slice(0, 20).map((item) => sanitize(item, depth + 1));
    }
    if (isObject(value)) {
        const output: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value).slice(0, 25)) {
            output[key] = sanitize(item, depth + 1);
        }
        return output;
    }
    return String(value);
}

export default {
    name: Events.ClientReady,
    once: true,
    async execute(client: BotClient) {
        client.on(Events.Raw, async (packet) => {
            await AuditLogRepository.log({
                eventName: packet.t ? `raw:${packet.t}` : "raw:unknown",
                source: "gateway",
                guildId: isObject(packet.d) && typeof packet.d.guild_id === "string" ? packet.d.guild_id : undefined,
                actorId: isObject(packet.d) && typeof packet.d.user_id === "string" ? packet.d.user_id : undefined,
                botName: client.botName,
                metadata: {
                    op: packet.op,
                    s: packet.s,
                    d: sanitize(packet.d) as Record<string, unknown>,
                },
            }).catch(() => null);
        });
    },
};
