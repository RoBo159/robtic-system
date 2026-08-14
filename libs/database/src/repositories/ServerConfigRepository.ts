import { ServerConfig, type IServerConfig, type ISentPanel, type IShortcut, type IServerRoles } from "@database/models/ServerConfig";

const PREFIX_CACHE_TTL_MS = 60_000;
const prefixCache = new Map<string, { prefix: string | null; expiresAt: number }>();

const BOT_ADMIN_ROLES_CACHE_TTL_MS = 60_000;
const botAdminRolesCache = new Map<string, { roleIds: string[]; expiresAt: number }>();

export class ServerConfigRepository {
    static async find(guildId: string): Promise<IServerConfig | null> {
        return ServerConfig.findOne({ guildId });
    }

    static async findOrCreate(guildId: string): Promise<IServerConfig> {
        let config = await ServerConfig.findOne({ guildId });
        if (!config) {
            config = await ServerConfig.create({ guildId, sentPanels: [], shortcuts: [] });
        }
        return config;
    }

    static async setRole(guildId: string, type: keyof IServerRoles, roleId: string): Promise<IServerConfig> {
        return ServerConfig.findOneAndUpdate(
            { guildId },
            { $set: { [`roles.${type}`]: roleId } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IServerConfig>;
    }

    static async getRole(guildId: string, type: keyof IServerRoles): Promise<string | null> {
        const config = await ServerConfig.findOne({ guildId });
        return config?.roles?.[type] ?? null;
    }

    static async getAdminPanelRoles(guildId: string): Promise<string[]> {
        const config = await ServerConfig.findOne({ guildId });
        return config?.adminPanelRoles ?? [];
    }

    static async setAdminPanelRoles(guildId: string, roleIds: string[]): Promise<IServerConfig> {
        return ServerConfig.findOneAndUpdate(
            { guildId },
            { $set: { adminPanelRoles: roleIds } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IServerConfig>;
    }

    /**
     * Roles that count as bot administrators here.
     *
     * Cached, because this is read inside checkPermissions — which runs before the command's own
     * deferReply() and therefore inside Discord's ~3s acknowledgement window.
     */
    static async getBotAdminRolesCached(guildId: string): Promise<string[]> {
        const cached = botAdminRolesCache.get(guildId);
        if (cached && cached.expiresAt > Date.now()) return cached.roleIds;

        const config = await ServerConfig.findOne({ guildId });
        const roleIds = config?.botAdminRoles ?? [];
        botAdminRolesCache.set(guildId, { roleIds, expiresAt: Date.now() + BOT_ADMIN_ROLES_CACHE_TTL_MS });
        return roleIds;
    }

    static async addBotAdminRole(guildId: string, roleId: string): Promise<string[]> {
        const config = await ServerConfig.findOneAndUpdate(
            { guildId },
            { $addToSet: { botAdminRoles: roleId } },
            { upsert: true, returnDocument: "after" }
        ) as IServerConfig;

        botAdminRolesCache.delete(guildId);
        return config.botAdminRoles ?? [];
    }

    static async removeBotAdminRole(guildId: string, roleId: string): Promise<string[]> {
        const config = await ServerConfig.findOneAndUpdate(
            { guildId },
            { $pull: { botAdminRoles: roleId } },
            { upsert: true, returnDocument: "after" }
        ) as IServerConfig;

        botAdminRolesCache.delete(guildId);
        return config.botAdminRoles ?? [];
    }

    static async setPrefix(guildId: string, prefix: string): Promise<IServerConfig> {
        const config = await ServerConfig.findOneAndUpdate(
            { guildId },
            { $set: { prefix } },
            { upsert: true, returnDocument: "after" }
        ) as IServerConfig;
        prefixCache.set(guildId, { prefix: config.prefix ?? null, expiresAt: Date.now() + PREFIX_CACHE_TTL_MS });
        return config;
    }

    /** Hot-path entry point — called on every guild message by every bot's shortcut/prefix listener, so this is cached rather than hitting Mongo per message. */
    static async getPrefix(guildId: string): Promise<string | null> {
        const cached = prefixCache.get(guildId);
        if (cached && cached.expiresAt > Date.now()) return cached.prefix;

        const config = await ServerConfig.findOne({ guildId });
        const prefix = config?.prefix ?? null;
        prefixCache.set(guildId, { prefix, expiresAt: Date.now() + PREFIX_CACHE_TTL_MS });
        return prefix;
    }

    static async setCommandsChannel(guildId: string, channelId: string): Promise<IServerConfig> {
        return ServerConfig.findOneAndUpdate(
            { guildId },
            { $set: { commandsChannelId: channelId } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IServerConfig>;
    }

    static async getCommandsChannel(guildId: string): Promise<string | null> {
        const config = await ServerConfig.findOne({ guildId });
        return config?.commandsChannelId ?? null;
    }

    static async addLineChannel(guildId: string, channelId: string): Promise<IServerConfig> {
        return ServerConfig.findOneAndUpdate(
            { guildId },
            { $addToSet: { lineChannelIds: channelId } },
            { upsert: true, returnDocument: "after" }
        ) as Promise<IServerConfig>;
    }

    static async removeLineChannel(guildId: string, channelId: string): Promise<IServerConfig | null> {
        const config = await ServerConfig.findOne({ guildId });
        if (!config) return null;

        const update: Record<string, unknown> = { $pull: { lineChannelIds: channelId } };
        if (config.lineChannelId === channelId) {
            update.$unset = { lineChannelId: "" };
        }

        return ServerConfig.findOneAndUpdate({ guildId }, update, { returnDocument: "after" });
    }

    static async getLineChannels(guildId: string): Promise<string[]> {
        const config = await ServerConfig.findOne({ guildId });
        if (!config) return [];
        // Merge legacy single-channel field in case it was never migrated
        const legacy = config.lineChannelId && !config.lineChannelIds.includes(config.lineChannelId)
            ? [config.lineChannelId]
            : [];
        return [...config.lineChannelIds, ...legacy];
    }

    static async addShortcut(guildId: string, command: string, trigger: string, deleteMode?: IShortcut["deleteMode"]): Promise<IServerConfig> {
        const config = await this.findOrCreate(guildId);
        // Avoid duplicates for same trigger
        const exists = config.shortcuts.find(s => s.trigger === trigger);
        if (exists) {
            exists.command = command; // Update existing
            exists.deleteMode = deleteMode;
        } else {
            config.shortcuts.push({ command, trigger, deleteMode });
        }
        config.markModified("shortcuts");
        return config.save();
    }

    static async removeShortcut(guildId: string, trigger: string): Promise<IServerConfig | null> {
        return ServerConfig.findOneAndUpdate(
            { guildId },
            { $pull: { shortcuts: { trigger } } },
            { returnDocument: "after" }
        );
    }

    static async getShortcuts(guildId: string): Promise<IShortcut[]> {
        const config = await this.findOrCreate(guildId);
        return config.shortcuts || [];
    }

    static async addSentPanel(
        guildId: string,
        panel: Omit<ISentPanel, "guildId">
    ): Promise<IServerConfig> {
        const config = await this.findOrCreate(guildId);
        config.sentPanels.push({ ...panel, guildId });
        return config.save();
    }

    static async removeSentPanel(guildId: string, messageId: string): Promise<IServerConfig | null> {
        return ServerConfig.findOneAndUpdate(
            { guildId },
            { $pull: { sentPanels: { messageId } } },
            { returnDocument: "after" }
        );
    }

    static async getSentPanels(guildId: string): Promise<ISentPanel[]> {
        const config = await ServerConfig.findOne({ guildId });
        return config?.sentPanels ?? [];
    }

    static async getSentPanel(guildId: string, messageId: string): Promise<ISentPanel | undefined> {
        const config = await ServerConfig.findOne({ guildId });
        return config?.sentPanels.find(p => p.messageId === messageId);
    }

    static async getSentPanelByKey(guildId: string, panelKey: string): Promise<ISentPanel | undefined> {
        const config = await ServerConfig.findOne({ guildId });
        return config?.sentPanels.find(p => p.panelKey === panelKey);
    }

    static async upsertSentPanel(
        guildId: string,
        panel: Omit<ISentPanel, "guildId">
    ): Promise<IServerConfig> {
        const config = await this.findOrCreate(guildId);
        const index = config.sentPanels.findIndex((p) => p.panelKey === panel.panelKey);

        if (index >= 0) {
            config.sentPanels[index] = { ...panel, guildId };
        } else {
            config.sentPanels.push({ ...panel, guildId });
        }

        return config.save();
    }

    static async getAllSentPanelsByKey(panelKey: string): Promise<ISentPanel[]> {
        const configs = await ServerConfig.find(
            { "sentPanels.panelKey": panelKey },
            { sentPanels: 1 }
        ).lean();

        const panels: ISentPanel[] = [];

        for (const config of configs) {
            for (const panel of config.sentPanels ?? []) {
                if (panel.panelKey === panelKey) {
                    panels.push(panel as ISentPanel);
                }
            }
        }

        return panels;
    }
}
