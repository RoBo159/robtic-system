import { BotClient } from "@core/bot-client";
import { loadModules } from "@core/loader/load-modules";
import { clearFeatureRegistry } from "@core/features/feature-registry";
import { clearProfileTabs } from "@core/profile/profile-tabs";
import { clearMetricListeners } from "@core/metrics";
import { DiscordErrorHandler } from "@core/handlers";
import { Logger } from "@logger";
import { BOT_DEFINITION } from "@config";

/**
 * Owns the bot's single Discord client.
 *
 * This used to juggle one client per bot definition, keyed by token, with a merge path for the
 * (universal, in practice) case of several definitions sharing a token. There is one bot now, so
 * the token grouping, the per-name client collection and the "already loaded" bookkeeping that
 * stopped merged bots double-registering their listeners are all gone with it.
 */
export class ClientManager {
    private client: BotClient | null = null;
    private startedAt: number | null = null;
    private botModulesRoot = `${import.meta.dir}/../../../apps/bot/src`;
    private static instance: ClientManager;

    private constructor() {}

    static getInstance(): ClientManager {
        if (!ClientManager.instance) {
            ClientManager.instance = new ClientManager();
        }
        return ClientManager.instance;
    }

    /** Directory containing commands/events/components; set by the app entrypoint. */
    setBotModulesRoot(dir: string): void {
        this.botModulesRoot = dir;
    }

    /** Creates the client (if needed) and loads every command, event and component from disk. */
    async initialize(): Promise<BotClient> {
        const token = process.env[BOT_DEFINITION.tokenKey];
        if (!token) {
            throw new Error(
                `${BOT_DEFINITION.tokenKey} is not set — NODE_ENV=${process.env.NODE_ENV || "development"} reads that variable.`,
            );
        }

        if (!this.client) {
            this.client = new BotClient(BOT_DEFINITION.name, token, BOT_DEFINITION.intents, BOT_DEFINITION.partials);
            new DiscordErrorHandler(this.client).init();
        }

        await loadModules(this.client, this.botModulesRoot);

        return this.client;
    }

    /** Initializes and logs in. Safe to call once; a second call only re-registers slash commands. */
    async start(): Promise<void> {
        const client = await this.initialize();

        if (client.isReady()) {
            await client.registerSlashCommands();
            return;
        }

        client.once("clientReady", async () => {
            await client.registerSlashCommands();
        });

        await client.start();
        this.startedAt = Date.now();
    }

    /**
     * Re-reads every module from disk and re-publishes the slash command payload.
     *
     * Listeners are detached one by one from the recorded bindings rather than with
     * `removeAllListeners`, which would also tear down the ones DiscordErrorHandler installs on the
     * client at construction and never reinstalls.
     *
     * Note that Bun caches ES modules, so `import()` returns what it returned the first time: this
     * re-*registers* from disk, it does not re-*read* changed source. Restart for that.
     */
    async reload(): Promise<void> {
        if (!this.client) {
            await this.start();
            return;
        }

        const emitter = this.client.asEmitter();
        for (const { name, listener } of this.client.eventBindings) {
            emitter.off(name, listener);
        }
        this.client.eventBindings = [];

        this.client.commands.clear();
        this.client.components.clear();
        this.client.messageCommands.clear();
        clearFeatureRegistry();
        clearProfileTabs();
        // Consumers re-subscribe as their modules re-import; without this a reload would leave the
        // old closures attached and every metric would be handled twice.
        clearMetricListeners();

        await this.initialize();
        await this.client.registerSlashCommands();
        Logger.info("Modules reloaded", BOT_DEFINITION.name);
    }

    async stop(): Promise<void> {
        if (!this.client) return;
        await this.client.destroy();
        this.client = null;
        this.startedAt = null;
        Logger.info("Bot stopped", BOT_DEFINITION.name);
    }

    getClient(): BotClient | null {
        return this.client;
    }

    getStatus(): BotStatus {
        const client = this.client;

        return {
            name: BOT_DEFINITION.name,
            online: client?.isReady() ?? false,
            uptime: this.startedAt ? Date.now() - this.startedAt : null,
            guilds: client?.guilds.cache.size ?? 0,
            ping: client?.ws.ping ?? -1,
            commands: client?.commands.size ?? 0,
        };
    }
}
