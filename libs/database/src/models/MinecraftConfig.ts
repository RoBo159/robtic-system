import { Schema, model, type Document } from "mongoose";
import { STAFF_ACTIONS } from "@sdk";

/** One Discord role → one LuckPerms group. Only mapped groups are ever touched by the sync. */
export interface IMinecraftRoleMapping {
    roleId: string;
    /** LuckPerms group name, e.g. "moderator". */
    group: string;
}

/**
 * One configured staff rank. `priority` is the ordering, lowest first, and is what decides which
 * rank a member holding several staff roles is given in staff mode.
 */
export interface IMinecraftStaffRank {
    roleId: string;
    /** Display name shown in staff chat and the Discord embeds, e.g. "Moderator". */
    name: string;
    /** LuckPerms group applied while the rank holder is in staff mode. */
    group: string;
    priority: number;
}

/**
 * One premium tier: a Discord role, the LuckPerms group it grants in game, and the limits that
 * come with it.
 *
 * <h2>This is the one flow that still runs Discord → Minecraft</h2>
 *
 * Premium is *bought and managed on Discord*, so unlike a staff rank — which is a LuckPerms group
 * the game server owns — the role is genuinely the source here and the group follows it.
 *
 * The two directions never collide because the sets are disjoint: the staff mirror only ever
 * touches role ids listed in roles.yml, and premium sync only ever touches the groups named below.
 * Putting a staff rank's group in a premium tier, or vice versa, is the one configuration that
 * would make them fight, and is worth avoiding deliberately.
 */
export interface IMinecraftPremiumTier {
    /** Tier key, e.g. "tier1". Ordering is by `level`, not by this. */
    id: string;
    /** Shown on the Discord profile and the in-game GUI, e.g. "Premium I". */
    name: string;
    /** Higher wins when a member holds several tiers. */
    level: number;
    discordRoleId: string;
    luckPermsGroup: string;
    /** How many homes this tier allows. */
    homeLimit: number;
    /** `/back` uses per window. Zero disables the command for this tier. */
    backUses: number;
    /** How many chests may be locked at once. */
    lockedChestLimit: number;
    /** Tier II features: the portable linked chest. */
    portableChest: boolean;
    /** Whether the tier may use `/ec`, `/particle` and a custom join message. */
    cosmetics: boolean;
}

/** A teleport destination offered by the staff lobby menu. */
export interface IMinecraftLobby {
    id: string;
    name: string;
    world: string;
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    /** Bukkit permission required to see and use it, or null for every staff member. */
    permission: string | null;
    /** Material name for the menu icon. */
    icon: string;
}

/**
 * Where one kind of staff action is logged. Either a channel or a webhook may be set; the channel
 * wins when both are, and an action with neither is simply not mirrored to Discord.
 */
export interface IMinecraftLogTarget {
    action: string;
    channelId?: string;
    webhookUrl?: string;
    enabled: boolean;
}

/** Per-guild Minecraft integration settings, edited through `/minecraft config`. */
export interface IMinecraftConfig extends Document {
    guildId: string;
    /** Channel that hosts the auto-updating server status embed. */
    statusChannelId?: string;
    /** Channel bridged to in-game chat, both directions. */
    chatChannelId?: string;
    /** Channel bridged to in-game staff chat, both directions. */
    staffChatChannelId?: string;
    /** Fallback destination for any action without its own target in `logTargets`. */
    defaultLogChannelId?: string;
    /** Whether Discord messages in the bridged channel are relayed into Minecraft. */
    chatBridgeEnabled: boolean;
    /** Whether LuckPerms groups are synchronised from Discord roles on join and on role change. */
    roleSyncEnabled: boolean;
    /** Whether the in-game staff system is available at all on this guild. */
    staffSystemEnabled: boolean;
    roleMappings: IMinecraftRoleMapping[];
    staffRanks: IMinecraftStaffRank[];
    /** Premium tiers, pushed from the game server's premium.yml. Highest `level` wins. */
    premiumTiers: IMinecraftPremiumTier[];
    /** Homes allowed to a player with no premium tier. */
    freeHomeLimit: number;
    /** Length of the `/back` budget window, in milliseconds. */
    backWindowMs: number;
    lobbies: IMinecraftLobby[];
    logTargets: IMinecraftLogTarget[];
    /** Group every linked staff member holds outside staff mode. */
    baseStaffGroup: string;
    /** Role applied to a linked player for the duration of a jail sentence. */
    jailRoleId?: string;
    /** Public connect address reported by `!ip`, when it is not per-server. */
    publicAddress?: string;
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

const staffRankSchema = new Schema<IMinecraftStaffRank>(
    {
        roleId: { type: String, required: true },
        name: { type: String, required: true, trim: true },
        group: { type: String, required: true, lowercase: true, trim: true },
        priority: { type: Number, required: true },
    },
    { _id: false }
);

const premiumTierSchema = new Schema<IMinecraftPremiumTier>(
    {
        id: { type: String, required: true, lowercase: true, trim: true },
        name: { type: String, required: true, trim: true },
        level: { type: Number, required: true },
        discordRoleId: { type: String, required: true },
        luckPermsGroup: { type: String, required: true, lowercase: true, trim: true },
        homeLimit: { type: Number, default: 5, min: 0 },
        backUses: { type: Number, default: 0, min: 0 },
        lockedChestLimit: { type: Number, default: 0, min: 0 },
        portableChest: { type: Boolean, default: false },
        cosmetics: { type: Boolean, default: false },
    },
    { _id: false }
);

const lobbySchema = new Schema<IMinecraftLobby>(
    {
        id: { type: String, required: true, lowercase: true, trim: true },
        name: { type: String, required: true, trim: true },
        world: { type: String, required: true, trim: true },
        x: { type: Number, required: true },
        y: { type: Number, required: true },
        z: { type: Number, required: true },
        yaw: { type: Number, default: 0 },
        pitch: { type: Number, default: 0 },
        permission: { type: String, default: null },
        icon: { type: String, default: "COMPASS", uppercase: true, trim: true },
    },
    { _id: false }
);

const logTargetSchema = new Schema<IMinecraftLogTarget>(
    {
        action: { type: String, required: true, enum: [...STAFF_ACTIONS] },
        channelId: { type: String },
        webhookUrl: { type: String },
        enabled: { type: Boolean, default: true },
    },
    { _id: false }
);

const minecraftConfigSchema = new Schema<IMinecraftConfig>(
    {
        guildId: { type: String, required: true, unique: true, index: true },
        statusChannelId: { type: String },
        chatChannelId: { type: String },
        staffChatChannelId: { type: String },
        defaultLogChannelId: { type: String },
        chatBridgeEnabled: { type: Boolean, default: true },
        roleSyncEnabled: { type: Boolean, default: true },
        staffSystemEnabled: { type: Boolean, default: true },
        roleMappings: { type: [roleMappingSchema], default: [] },
        staffRanks: { type: [staffRankSchema], default: [] },
        premiumTiers: { type: [premiumTierSchema], default: [] },
        freeHomeLimit: { type: Number, default: 2, min: 0 },
        // Four hours, matching the /back window the premium tiers are described in.
        backWindowMs: { type: Number, default: 4 * 60 * 60 * 1000, min: 60_000 },
        lobbies: { type: [lobbySchema], default: [] },
        logTargets: { type: [logTargetSchema], default: [] },
        baseStaffGroup: { type: String, default: "staff", lowercase: true, trim: true },
        jailRoleId: { type: String },
        publicAddress: { type: String, trim: true },
    },
    { timestamps: true }
);

export const MinecraftConfig = model<IMinecraftConfig>("MinecraftConfig", minecraftConfigSchema);
