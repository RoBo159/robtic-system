import { PremiumTier, type IPremiumTier } from "@database/models/PremiumTier";
import { PremiumFeatureValue, type IPremiumFeatureValue } from "@database/models/PremiumFeatureValue";
import { PremiumRoleMap, type IPremiumRoleMap } from "@database/models/PremiumRoleMap";
import { PremiumMembership, type IPremiumMembership } from "@database/models/PremiumMembership";
import { PremiumSettings, type IPremiumSettings } from "@database/models/PremiumSettings";

/**
 * What changed, so the engine knows what to drop.
 *
 * `global` covers the tier ladder and its feature values — those affect every guild and every
 * member at once. A guild scope covers that server's role mappings and settings; a member scope
 * covers one person's memberships.
 */
export type PremiumMutation =
    | { scope: "global" }
    | { scope: "guild"; guildId: string }
    | { scope: "member"; discordId: string };

type MutationListener = (mutation: PremiumMutation) => void;

const listeners = new Set<MutationListener>();

function announce(mutation: PremiumMutation): void {
    for (const listener of listeners) listener(mutation);
}

export class PremiumRepository {
    /** Every write announces itself, so no command has to remember to invalidate a cache. */
    static onMutation(listener: MutationListener): () => void {
        listeners.add(listener);
        return () => listeners.delete(listener);
    }

    // ── Tiers (global) ───────────────────────────────────────────────────────

    static async listTiers(): Promise<IPremiumTier[]> {
        return PremiumTier.find().sort({ rank: -1 }).lean<IPremiumTier[]>();
    }

    static async findTier(key: string): Promise<IPremiumTier | null> {
        return PremiumTier.findOne({ key: key.toLowerCase() });
    }

    static async countTiers(): Promise<number> {
        return PremiumTier.countDocuments();
    }

    /** Creates a tier, or returns null when the key is taken. */
    static async createTier(input: {
        key: string;
        name: string;
        rank: number;
        emoji?: string;
        color?: string | null;
        createdBy: string;
    }): Promise<IPremiumTier | null> {
        try {
            const tier = await PremiumTier.create({ ...input, key: input.key.toLowerCase() }) as unknown as IPremiumTier;
            announce({ scope: "global" });
            return tier;
        } catch (err) {
            if ((err as { code?: number }).code === 11000) return null;
            throw err;
        }
    }

    static async updateTier(
        key: string,
        changes: Partial<Pick<IPremiumTier, "name" | "rank" | "emoji" | "color" | "enabled">>,
    ): Promise<IPremiumTier | null> {
        const tier = await PremiumTier.findOneAndUpdate(
            { key: key.toLowerCase() },
            { $set: changes },
            { returnDocument: "after" }
        );

        if (tier) announce({ scope: "global" });
        return tier;
    }

    /**
     * Deletes a tier along with everything that points at it.
     *
     * Feature values, role mappings and memberships all go. Leaving any of them would re-apply
     * silently if the key were ever recreated — a surprise nobody would connect to a deletion
     * months earlier.
     */
    static async deleteTier(key: string): Promise<boolean> {
        const lowered = key.toLowerCase();
        const deleted = await PremiumTier.findOneAndDelete({ key: lowered });
        if (!deleted) return false;

        await Promise.all([
            PremiumFeatureValue.deleteMany({ tierKey: lowered }),
            PremiumRoleMap.deleteMany({ tierKey: lowered }),
            PremiumMembership.deleteMany({ tierKey: lowered }),
        ]);

        announce({ scope: "global" });
        return true;
    }

    // ── Feature values (global) ──────────────────────────────────────────────

    static async listValues(): Promise<IPremiumFeatureValue[]> {
        return PremiumFeatureValue.find().lean<IPremiumFeatureValue[]>();
    }

    static async setValue(input: {
        tierKey: string;
        feature: string;
        value: number | boolean;
        setBy: string;
    }): Promise<void> {
        await PremiumFeatureValue.updateOne(
            { tierKey: input.tierKey.toLowerCase(), feature: input.feature },
            { $set: { value: input.value, setBy: input.setBy } },
            { upsert: true }
        );

        announce({ scope: "global" });
    }

    /** Removes an override so the feature falls back to its definition's baseline. */
    static async clearValue(tierKey: string, feature: string): Promise<boolean> {
        const result = await PremiumFeatureValue.deleteOne({ tierKey: tierKey.toLowerCase(), feature });
        if (result.deletedCount > 0) announce({ scope: "global" });
        return result.deletedCount > 0;
    }

    // ── Role mappings (per guild) ────────────────────────────────────────────

    static async listRoleMaps(guildId: string): Promise<IPremiumRoleMap[]> {
        return PremiumRoleMap.find({ guildId }).lean<IPremiumRoleMap[]>();
    }

    static async findRoleMap(guildId: string, roleId: string): Promise<IPremiumRoleMap | null> {
        return PremiumRoleMap.findOne({ guildId, roleId });
    }

    static async mapRole(input: {
        guildId: string;
        roleId: string;
        tierKey: string;
        addedBy: string;
    }): Promise<IPremiumRoleMap> {
        const row = await PremiumRoleMap.findOneAndUpdate(
            { guildId: input.guildId, roleId: input.roleId },
            { $set: { tierKey: input.tierKey.toLowerCase(), addedBy: input.addedBy } },
            { upsert: true, returnDocument: "after" }
        ) as IPremiumRoleMap;

        announce({ scope: "guild", guildId: input.guildId });
        return row;
    }

    static async unmapRole(guildId: string, roleId: string): Promise<boolean> {
        const result = await PremiumRoleMap.deleteOne({ guildId, roleId });
        if (result.deletedCount > 0) announce({ scope: "guild", guildId });
        return result.deletedCount > 0;
    }

    // ── Memberships (global, per member) ─────────────────────────────────────

    /** Live memberships only — an expired row stays as history but grants nothing. */
    static async listMemberships(discordId: string, now = new Date()): Promise<IPremiumMembership[]> {
        return PremiumMembership.find({
            discordId,
            $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
        }).lean<IPremiumMembership[]>();
    }

    static async allMemberships(discordId: string): Promise<IPremiumMembership[]> {
        return PremiumMembership.find({ discordId }).sort({ createdAt: -1 }).lean<IPremiumMembership[]>();
    }

    static async grantMembership(input: {
        discordId: string;
        tierKey: string;
        source?: string;
        grantedBy: string;
        reason?: string;
        expiresAt: Date | null;
    }): Promise<IPremiumMembership> {
        const row = await PremiumMembership.findOneAndUpdate(
            { discordId: input.discordId, tierKey: input.tierKey.toLowerCase() },
            {
                $set: {
                    source: input.source ?? "manual",
                    grantedBy: input.grantedBy,
                    reason: input.reason ?? "",
                    expiresAt: input.expiresAt,
                },
            },
            { upsert: true, returnDocument: "after" }
        ) as IPremiumMembership;

        announce({ scope: "member", discordId: input.discordId });
        return row;
    }

    static async revokeMembership(discordId: string, tierKey: string): Promise<boolean> {
        const result = await PremiumMembership.deleteOne({ discordId, tierKey: tierKey.toLowerCase() });
        if (result.deletedCount > 0) announce({ scope: "member", discordId });
        return result.deletedCount > 0;
    }

    /** Members holding a live membership, newest first — for the operator's roster. */
    static async listHolders(tierKey: string | null, limit = 25, now = new Date()): Promise<IPremiumMembership[]> {
        return PremiumMembership.find({
            ...(tierKey ? { tierKey: tierKey.toLowerCase() } : {}),
            $or: [{ expiresAt: null }, { expiresAt: { $gt: now } }],
        })
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean<IPremiumMembership[]>();
    }

    // ── Settings (per guild) ─────────────────────────────────────────────────

    static async getSettings(guildId: string): Promise<IPremiumSettings> {
        return await PremiumSettings.findOneAndUpdate(
            { guildId },
            { $setOnInsert: { guildId } },
            { upsert: true, returnDocument: "after" }
        ) as IPremiumSettings;
    }

    static async setSettings(
        guildId: string,
        changes: Partial<Pick<IPremiumSettings, "enabled" | "showBadges">>,
    ): Promise<IPremiumSettings> {
        const settings = await PremiumSettings.findOneAndUpdate(
            { guildId },
            { $set: changes },
            { upsert: true, returnDocument: "after" }
        ) as IPremiumSettings;

        announce({ scope: "guild", guildId });
        return settings;
    }
}
