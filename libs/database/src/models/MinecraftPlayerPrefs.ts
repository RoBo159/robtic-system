import { Schema, model, type Document } from "mongoose";

/**
 * Every per-player preference: friend teleports, lobby behaviour and the premium cosmetics.
 *
 * One document rather than several collections because they share a lifecycle and an access
 * pattern — each is read once on join, cached for the session, and written only when the player
 * changes it. Splitting them would mean several reads on every join to populate one cache.
 *
 * A player with no row has never changed anything, so absence means "all defaults" rather than a
 * missing record. Nothing here needs a Discord link.
 */
export interface IMinecraftPlayerPrefs extends Document {
    minecraftUuid: string;

    /**
     * Whether `/friend tp` may teleport somebody in without asking.
     *
     * Defaults to false — manual approval — because the safe default for "somebody may appear next
     * to you unannounced" is to be asked, and a player who wants the convenience can opt in.
     */
    friendTpAutoAccept: boolean;

    /** Premium cosmetic. Null means the server's default message is used. */
    joinMessage: string | null;
    /** Premium cosmetic. Null means the server's default message is used. */
    leaveMessage: string | null;
    /** Bukkit `Particle` name, or null when the player has none selected or has run /particle off. */
    particle: string | null;

    /**
     * Whether other players are rendered for this player in the lobby (`/players`).
     *
     * Defaults to true: somebody who has never touched the setting expects to see a populated
     * lobby, and hiding by default would make the server look empty.
     */
    playersVisible: boolean;

    /**
     * Whether this player's profile is hidden from other players in the lobby menu.
     *
     * Only affects the player-to-player view. Staff tooling and the Discord profile are unaffected
     * — this is a courtesy setting, not a moderation bypass.
     */
    privateProfile: boolean;

    createdAt: Date;
    updatedAt: Date;
}

const minecraftPlayerPrefsSchema = new Schema<IMinecraftPlayerPrefs>(
    {
        minecraftUuid: { type: String, required: true, unique: true, lowercase: true, trim: true },
        friendTpAutoAccept: { type: Boolean, default: false },
        joinMessage: { type: String, default: null, maxlength: 120 },
        leaveMessage: { type: String, default: null, maxlength: 120 },
        particle: { type: String, default: null, uppercase: true, trim: true },
        playersVisible: { type: Boolean, default: true },
        privateProfile: { type: Boolean, default: false },
    },
    { timestamps: true }
);

export const MinecraftPlayerPrefs = model<IMinecraftPlayerPrefs>(
    "MinecraftPlayerPrefs",
    minecraftPlayerPrefsSchema,
);
