import { Schema, model, type Document } from "mongoose";
import { QUEST_TIERS, DEFAULT_QUEST_WINDOWS, type QuestTier } from "@constants";

/** A slice of the guild's local day in which a quest may appear. */
export interface IQuestWindow {
    /** Stable identifier used in the generation key, e.g. "morning". */
    key: string;
    startHour: number;
    endHour: number;
    enabled: boolean;
}

export interface IQuestSettings extends Document {
    guildId: string;
    /**
     * Where every generated quest is posted, whatever its tier.
     *
     * There were three of these — daily, VIP, and a per-tier fallback chain. Splitting the feed by
     * tier meant a member had to watch several channels to see what was available, and it made VIP
     * quests configurable into a channel VIP members could not read. One feed, one place to look.
     */
    questChannelId: string | null;
    /** The weekly community challenge panel, which is a different kind of thing and stays separate. */
    communityChannelId: string | null;
    /** Tier → role id pinged when that tier is posted. */
    mentionRoles: Record<string, string | null>;
    /** Any one of these may claim VIP quests. There is no other premium concept in the bot. */
    vipRoleIds: string[];
    /** Which tiers generate here at all. */
    enabledTiers: Record<string, boolean>;
    windows: IQuestWindow[];
    /**
     * Minutes east of UTC, used to read the windows as local wall clock.
     *
     * Minutes rather than hours because +05:30 and +05:45 exist. A fixed offset drifts by an hour
     * across DST for observing guilds — accepted, since nothing else in the bot handles timezones
     * and the alternative is a full IANA dependency.
     */
    utcOffsetMinutes: number;
    communityEnabled: boolean;
    communityRewardBase: number;
    /** Contribution below which a member is not paid at settlement. */
    communityMinContribution: number;
    createdAt: Date;
    updatedAt: Date;
}

const questWindowSchema = new Schema<IQuestWindow>(
    {
        key: { type: String, required: true },
        startHour: { type: Number, required: true },
        endHour: { type: Number, required: true },
        enabled: { type: Boolean, default: true },
    },
    { _id: false }
);

const defaultMentionRoles = (): Record<string, string | null> =>
    Object.fromEntries([...QUEST_TIERS, "community"].map(tier => [tier, null]));

const defaultEnabledTiers = (): Record<string, boolean> =>
    Object.fromEntries(QUEST_TIERS.map(tier => [tier, true]));

const questSettingsSchema = new Schema<IQuestSettings>(
    {
        guildId: { type: String, required: true, unique: true, index: true },
        questChannelId: { type: String, default: null },
        communityChannelId: { type: String, default: null },
        mentionRoles: { type: Schema.Types.Mixed, default: defaultMentionRoles },
        vipRoleIds: { type: [String], default: [] },
        enabledTiers: { type: Schema.Types.Mixed, default: defaultEnabledTiers },
        windows: { type: [questWindowSchema], default: () => DEFAULT_QUEST_WINDOWS.map(w => ({ ...w })) },
        utcOffsetMinutes: { type: Number, default: 0 },
        communityEnabled: { type: Boolean, default: true },
        communityRewardBase: { type: Number, default: 50 },
        communityMinContribution: { type: Number, default: 5 },
    },
    { timestamps: true }
);

export const QuestSettings = model<IQuestSettings>("QuestSettings", questSettingsSchema);

/** Narrower accessor so callers do not index a Mixed record with a bare string. */
export function mentionRoleFor(settings: IQuestSettings, tier: QuestTier | "community"): string | null {
    return settings.mentionRoles?.[tier] ?? null;
}

export function tierEnabled(settings: IQuestSettings, tier: QuestTier): boolean {
    return settings.enabledTiers?.[tier] ?? true;
}
