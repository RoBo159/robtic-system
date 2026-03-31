import {
    Client,
    Collection,
    REST,
    Routes,
    type GatewayIntentBits,
    type Partials,
} from "discord.js";
import type { CommandConfig, ComponentHandler } from "@core/config";
import { Logger } from "@core/libs";
import { sendStatus } from "./utils";

export class BotClient extends Client {
    public commands = new Collection<string, CommandConfig>();
    public components = new Collection<string, ComponentHandler>();
    public cooldowns = new Collection<string, Collection<string, number>>();
    public botName: BotName;
    public loadedModules: string[] = [];
    private token_: string;

    constructor(name: BotName, token: string, intents: GatewayIntentBits[], partials?: Partials[]) {
        super({ intents, ...(partials?.length ? { partials } : {}) });
        this.botName = name;
        this.token_ = token;
    }

    async start(): Promise<void> {
        try {
            await sendStatus(this.botName, "STARTING", "Booting...");
            await this.login(this.token_);
            Logger.success(`Bot started`, this.botName);
            await sendStatus(this.botName, "HEALTHY", `${this.user?.tag} online`)
        } catch (err) {
            Logger.error(`Failed to start: ${err}`, this.botName);
            await sendStatus(this.botName, "OFFLINE", "Startup failed")
            throw err;
        }
    }

    async registerSlashCommands(): Promise<void> {
        if (this.commands.size === 0) return;

        const commands = this.commands.map((cmd) => cmd.data.toJSON());
        const rest = new REST({ version: "10" }).setToken(this.token_);

        try {
            Logger.info(`Registering ${commands.length} application commands...`, this.botName);

            if (!this.user) {
                Logger.warn("Client not ready, deferring command registration", this.botName);
                return;
            }

            await rest.put(Routes.applicationCommands(this.user.id), {
                body: commands,
            });

            Logger.success(`Registered ${commands.length} application commands`, this.botName);
        } catch (err) {
            Logger.error(`Failed to register commands: ${err}`, this.botName);
        }
    }
}
