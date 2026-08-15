import { Schema, model, type Document } from "mongoose";
import { SHORTCUT_DELETE_MODES, type ShortcutDeleteMode } from "@constants";

/**
 * One custom message trigger for one guild.
 *
 * These used to live as an embedded array on ServerConfig, which meant loading the whole server
 * document on every message and gave nowhere to hang per-shortcut settings. A collection of its own
 * indexes the lookup and leaves room for the restrictions below.
 */
export interface IShortcutDoc extends Document {
    guildId: string;
    /** Stored lowercased — matching is case-insensitive, so `Red` and `red` are the same trigger. */
    trigger: string;
    /** A runnable command path (`warn add`) or a channel-utility key (`lock`). */
    command: string;
    /**
     * Fixed arguments merged with whatever the member types.
     *
     * `{args}` is replaced by their input; without the placeholder the template is appended after
     * it. That covers both "always end with this reason" and "put the input in the middle".
     */
    argsTemplate: string;
    deleteMode: ShortcutDeleteMode;
    /** Empty means anyone who can run the underlying command. */
    allowedRoleIds: string[];
    /** Empty means every channel. */
    channelIds: string[];
    /** Off keeps the row but stops it firing — a pause, rather than deleting and re-adding. */
    enabled: boolean;
    uses: number;
    lastUsedAt: Date | null;
    createdBy: string;
    createdAt: Date;
    updatedAt: Date;
}

const shortcutSchema = new Schema<IShortcutDoc>(
    {
        guildId: { type: String, required: true, index: true },
        trigger: { type: String, required: true },
        command: { type: String, required: true },
        argsTemplate: { type: String, default: "" },
        deleteMode: { type: String, enum: SHORTCUT_DELETE_MODES, default: "none" },
        allowedRoleIds: { type: [String], default: [] },
        channelIds: { type: [String], default: [] },
        enabled: { type: Boolean, default: true },
        uses: { type: Number, default: 0 },
        lastUsedAt: { type: Date, default: null },
        createdBy: { type: String, default: "" },
    },
    { timestamps: true }
);

shortcutSchema.index({ guildId: 1, trigger: 1 }, { unique: true });

export const Shortcut = model<IShortcutDoc>("Shortcut", shortcutSchema);
