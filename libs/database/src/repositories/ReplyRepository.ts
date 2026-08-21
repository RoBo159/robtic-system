import { Reply, toReplyEntries, newReplyId, type IReply, type IReplyEntry } from "@database/models/Reply";

const CACHE_TTL_MS = 60_000;

/**
 * Lowercased trigger set per guild.
 *
 * The auto-reply listener runs on every message, and almost none of them are triggers. Without
 * this, each one would cost a Mongo round trip to discover that. The set is small — a guild has a
 * handful of triggers — so the common answer is an in-memory miss and no query at all.
 */
const triggerCache = new Map<string, { triggers: Set<string>; expiresAt: number }>();

/** One reply, with the trigger it belongs to. What `/reply list` and `/reply remove` work from. */
export interface ReplyListing extends IReplyEntry {
    trigger: string;
}

export class ReplyRepository {
    /** Adds a reply to a trigger, creating the trigger if it is new. Returns the entry it wrote. */
    static async addReply(
        guildId: string,
        trigger: string,
        text: string,
        createdBy: string,
    ): Promise<{ doc: IReply; entry: IReplyEntry }> {
        const entry: IReplyEntry = { id: newReplyId(), text, createdBy, createdAt: new Date() };

        const doc = await Reply.findOneAndUpdate(
            { guildId, trigger },
            { $push: { replies: entry } },
            { upsert: true, returnDocument: "after" }
        ) as IReply;

        triggerCache.delete(guildId);
        return { doc, entry };
    }

    /**
     * Removes one reply by its id, wherever it lives.
     *
     * The trigger goes too when it was the last reply — a trigger with nothing to say would match
     * messages and then answer nothing, which reads as the bot ignoring people.
     */
    static async deleteReplyById(
        guildId: string,
        id: string,
    ): Promise<{ trigger: string; entry: IReplyEntry; triggerRemoved: boolean } | null> {
        const docs = await Reply.find({ guildId });

        for (const doc of docs) {
            const entries = toReplyEntries(doc.replies);
            const entry = entries.find(e => e.id === id);
            if (!entry) continue;

            const remaining = entries.filter(e => e.id !== id);

            if (remaining.length === 0) {
                await Reply.deleteOne({ _id: doc._id });
            } else {
                await Reply.updateOne({ _id: doc._id }, { $set: { replies: remaining } });
            }

            triggerCache.delete(guildId);
            return { trigger: doc.trigger, entry, triggerRemoved: remaining.length === 0 };
        }

        return null;
    }

    /** Removes a whole trigger and every reply on it. */
    static async deleteTrigger(guildId: string, trigger: string): Promise<IReply | null> {
        const doc = await Reply.findOneAndDelete({
            guildId,
            trigger: new RegExp(`^${escapeRegex(trigger)}$`, "i"),
        });

        triggerCache.delete(guildId);
        return doc;
    }

    static async getReply(guildId: string, trigger: string): Promise<IReply | null> {
        return Reply.findOne({ guildId, trigger: new RegExp(`^${escapeRegex(trigger)}$`, "i") });
    }

    static async getAllTriggers(guildId: string): Promise<string[]> {
        const docs = await Reply.find({ guildId }, { trigger: 1 });
        return docs.map(d => d.trigger);
    }

    /** Every reply in the guild, flattened, newest trigger first — the backing for `/reply list`. */
    static async listAll(guildId: string): Promise<ReplyListing[]> {
        const docs = await Reply.find({ guildId }).sort({ trigger: 1 });

        return docs.flatMap(doc =>
            toReplyEntries(doc.replies).map(entry => ({ ...entry, trigger: doc.trigger }))
        );
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

    /** Case-insensitive, so `Hello` matches a trigger stored as `hello`. */
    static async getRandomReply(guildId: string, trigger: string): Promise<string | null> {
        const doc = await Reply.findOne({ guildId, trigger: new RegExp(`^${escapeRegex(trigger)}$`, "i") });
        const entries = toReplyEntries(doc?.replies);
        if (entries.length === 0) return null;

        return entries[Math.floor(Math.random() * entries.length)]?.text ?? null;
    }

    static invalidate(guildId: string): void {
        triggerCache.delete(guildId);
    }
}

function escapeRegex(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
