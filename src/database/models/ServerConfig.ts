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
}

export interface IServerConfig extends Document {
    guildId: string;
    sentPanels: ISentPanel[];
    shortcuts: IShortcut[];
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
}, { _id: false });

const serverConfigSchema = new Schema<IServerConfig>(
    {
        guildId: { type: String, required: true, unique: true },
        sentPanels: { type: [sentPanelSchema], default: [] },
        shortcuts: { type: [shortcutSchema], default: [] },
    },
    { timestamps: true }
);

export const ServerConfig = model<IServerConfig>("ServerConfig", serverConfigSchema);
