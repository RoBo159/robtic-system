import { Shortcut, type IShortcutDoc } from "@database/models/Shortcut";
import type { ShortcutDeleteMode } from "@constants";

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { shortcuts: IShortcutDoc[]; expiresAt: number }>();

export interface CreateShortcutInput {
    trigger: string;
    command: string;
    argsTemplate?: string;
    deleteMode: ShortcutDeleteMode;
    createdBy: string;
}

export class ShortcutRepository {
    /**
     * Every shortcut for a guild, cached.
     *
     * The message listener consults this on each message, so the common case — a guild with a
     * handful of triggers and a message that matches none of them — must not cost a query.
     */
    static async listCached(guildId: string): Promise<IShortcutDoc[]> {
        const hit = cache.get(guildId);
        if (hit && hit.expiresAt > Date.now()) return hit.shortcuts;

        const shortcuts = await Shortcut.find({ guildId }).sort({ trigger: 1 });
        cache.set(guildId, { shortcuts, expiresAt: Date.now() + CACHE_TTL_MS });
        return shortcuts;
    }

    static async list(guildId: string): Promise<IShortcutDoc[]> {
        return Shortcut.find({ guildId }).sort({ trigger: 1 });
    }

    static async find(guildId: string, trigger: string): Promise<IShortcutDoc | null> {
        return Shortcut.findOne({ guildId, trigger: trigger.toLowerCase() });
    }

    static async upsert(guildId: string, input: CreateShortcutInput): Promise<IShortcutDoc> {
        const doc = await Shortcut.findOneAndUpdate(
            { guildId, trigger: input.trigger.toLowerCase() },
            {
                $set: {
                    command: input.command,
                    argsTemplate: input.argsTemplate ?? "",
                    deleteMode: input.deleteMode,
                },
                $setOnInsert: { createdBy: input.createdBy, enabled: true },
            },
            { upsert: true, returnDocument: "after" }
        ) as IShortcutDoc;

        cache.delete(guildId);
        return doc;
    }

    static async remove(guildId: string, trigger: string): Promise<IShortcutDoc | null> {
        const doc = await Shortcut.findOneAndDelete({ guildId, trigger: trigger.toLowerCase() });
        cache.delete(guildId);
        return doc;
    }

    static async setEnabled(guildId: string, trigger: string, enabled: boolean): Promise<IShortcutDoc | null> {
        const doc = await Shortcut.findOneAndUpdate(
            { guildId, trigger: trigger.toLowerCase() },
            { $set: { enabled } },
            { returnDocument: "after" }
        );
        cache.delete(guildId);
        return doc;
    }

    static async editRestriction(
        guildId: string,
        trigger: string,
        field: "allowedRoleIds" | "channelIds",
        id: string,
        action: "add" | "remove",
    ): Promise<IShortcutDoc | null> {
        const mutation = action === "add" ? { $addToSet: { [field]: id } } : { $pull: { [field]: id } };
        const doc = await Shortcut.findOneAndUpdate(
            { guildId, trigger: trigger.toLowerCase() },
            mutation,
            { returnDocument: "after" }
        );
        cache.delete(guildId);
        return doc;
    }

    static async clearRestrictions(guildId: string, trigger: string): Promise<IShortcutDoc | null> {
        const doc = await Shortcut.findOneAndUpdate(
            { guildId, trigger: trigger.toLowerCase() },
            { $set: { allowedRoleIds: [], channelIds: [] } },
            { returnDocument: "after" }
        );
        cache.delete(guildId);
        return doc;
    }

    /** Fire-and-forget usage stamp — not cached, and never worth failing a shortcut over. */
    static async recordUse(guildId: string, trigger: string): Promise<void> {
        await Shortcut.updateOne(
            { guildId, trigger: trigger.toLowerCase() },
            { $inc: { uses: 1 }, $set: { lastUsedAt: new Date() } },
        ).catch(() => null);
    }

    static invalidate(guildId: string): void {
        cache.delete(guildId);
    }
}
