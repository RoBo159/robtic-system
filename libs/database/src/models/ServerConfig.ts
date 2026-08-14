import { Schema, model, type Document } from "mongoose";

export interface ISentPanel {
    panelKey: string;
    channelId: string;
    messageId: string;
    guildId: string;
    sentBy: string;
}

export interface IShortcut {
    command: string;
    trigger: string;
    /**
     * What to clean up after the shortcut runs. Optional: shortcuts created before this field
     * existed fall back to the per-command default (see resolveShortcutDeleteMode), which is what
     * they already did.
     */
    deleteMode?: "both" | "output" | "none";
}

export interface IServerRoles {
    en?: string;
    ar?: string;
    members?: string;
    bots?: string;
}

export interface IServerConfig extends Document {
    guildId: string;
    sentPanels: ISentPanel[];
    shortcuts: IShortcut[];
    roles: IServerRoles;
    /** @deprecated legacy single-channel field, replaced by lineChannelIds */
    lineChannelId?: string;
    lineChannelIds: string[];
    /** Prefix for main-bot text commands in this guild (e.g. "!"). Falls back to DEFAULT_PREFIX when unset. */
    prefix?: string;
    /** Channel where plain chat is auto-deleted, keeping it command-only (see commands-channel-guard.ts). */
    commandsChannelId?: string;
    /** Roles allowed into the Activity's guild admin panel (besides owner/Administrator). */
    adminPanelRoles: string[];
    /**
     * Roles treated as bot administrators in this guild: they pass `access: "admin"` commands
     * alongside Discord's own Administrator permission.
     *
     * Deliberately separate from adminPanelRoles, which grants the web panel. Reusing that field
     * would hand every panel role the ability to run admin commands in chat — a privilege
     * escalation delivered by a rename.
     */
    botAdminRoles: string[];
    createdAt: Date;
    updatedAt: Date;
}

const sentPanelSchema = new Schema<ISentPanel>(
    {
        panelKey: { type: String, required: true },
        channelId: { type: String, required: true },
        messageId: { type: String, required: true },
        guildId: { type: String, required: true },
        sentBy: { type: String, required: true },
    },
    { _id: true }
);

const shortcutSchema = new Schema<IShortcut>({
    command: { type: String, required: true },
    trigger: { type: String, required: true },
    deleteMode: { type: String, enum: ["both", "output", "none"] },
}, { _id: false });

const serverConfigSchema = new Schema<IServerConfig>(
    {
        guildId: { type: String, required: true, unique: true },
        sentPanels: { type: [sentPanelSchema], default: [] },
        shortcuts: { type: [shortcutSchema], default: [] },
        roles: {
            type: {
                en: { type: String },
                ar: { type: String },
                members: { type: String },
                bots: { type: String },
            },
            default: {},
        },
        lineChannelId: { type: String }, // legacy single-channel field, kept for migration fallback
        lineChannelIds: { type: [String], default: [] },
        prefix: { type: String },
        commandsChannelId: { type: String },
        adminPanelRoles: { type: [String], default: [] },
        botAdminRoles: { type: [String], default: [] },
    },
    { timestamps: true }
);

export const ServerConfig = model<IServerConfig>("ServerConfig", serverConfigSchema);
