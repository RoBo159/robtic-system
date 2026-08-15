import { Reply, type IReply } from "@database/models/Reply";

const CACHE_TTL_MS = 60_000;

/**
 * Lowercased trigger set per guild.
 *
 * The auto-reply listener runs on every message, and almost none of them are triggers. Without
 * this, each one would cost a Mongo round trip to discover that. The set is small — a guild has a
 * handful of triggers — so the common answer is an in-memory miss and no query at all.
 */
const triggerCache = new Map<string, { triggers: Set<string>; expiresAt: number }>();

export class ReplyRepository {
    static async addReply(guildId: string, trigger: string, reply: string): Promise<IReply> {
        const doc = await Reply.findOneAndUpdate(
            { guildId, trigger },
            { $addToSet: { replies: reply } },
            { upsert: true, returnDocument: "after" }
        ) as IReply;

        triggerCache.delete(guildId);
        return doc;
    }

    static async deleteReply(guildId: string, trigger: string): Promise<IReply | null> {
        const doc = await Reply.findOneAndDelete({ guildId, trigger });
        triggerCache.delete(guildId);
        return doc;
    }

    static async getReply(guildId: string, trigger: string): Promise<IReply | null> {
        return Reply.findOne({ guildId, trigger });
    }

    static async getAllTriggers(guildId: string): Promise<string[]> {
        const docs = await Reply.find({ guildId });
        return docs.map(d => d.trigger);
    }

    /** Cached, case-insensitive membership test — the hot path for the message listener. */
    static async hasTrigger(guildId: string, trigger: string): Promise<boolean> {
        const hit = triggerCache.get(guildId);
        if (hit && hit.expiresAt > Date.now()) return hit.triggers.has(trigger.toLowerCase());

        const docs = await Reply.find({ guildId }, { trigger: 1 });
        const triggers = new Set(docs.map(d => d.trigger.toLowerCase()));
        triggerCache.set(guildId, { triggers, expiresAt: Date.now() + CACHE_TTL_MS });

        return triggers.has(trigger.toLowerCase());
    }

    /** Case-insensitive, so `!Hello` matches a trigger stored as `hello`. */
    static async getRandomReply(guildId: string, trigger: string): Promise<string | null> {
        const doc = await Reply.findOne({ guildId, trigger: new RegExp(`^${escapeRegex(trigger)}$`, "i") });
        if (!doc?.replies.length) return null;
        return doc.replies[Math.floor(Math.random() * doc.replies.length)] ?? null;
    }

    static invalidate(guildId: string): void {
        triggerCache.delete(guildId);
    }
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
