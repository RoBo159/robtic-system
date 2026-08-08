import {
    Client,
    Collection,
    REST,
    Routes,
    type GatewayIntentBits,
    type Partials,
} from "discord.js";
import type { CommandConfig, ComponentHandler } from "@typings/command";
import { Logger } from "@logger";
import { sendStatus } from "./status/status";

/**
 * The character budget Discord actually measures a command against.
 *
 * Its limit covers the combined length of every name, description and choice value in one command
 * — not the serialised JSON, which is roughly twice as long because of keys and punctuation.
 * Measuring the wrong thing here would mean warning at half the real ceiling and sending people
 * to split commands that are nowhere near it.
 */
function commandCharacterCount(node: unknown): number {
    if (Array.isArray(node)) {
        return node.reduce<number>((total, entry) => total + commandCharacterCount(entry), 0);
    }

    if (typeof node !== "object" || node === null) return 0;

    let total = 0;

    for (const [key, value] of Object.entries(node)) {
        if (typeof value === "string" && (key === "name" || key === "description" || key === "value")) {
            total += value.length;
        } else if (typeof value === "object" && value !== null) {
            total += commandCharacterCount(value);
        }
    }

    return total;
}

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

        if (!this.user) {
            Logger.warn("Client not ready, deferring command registration", this.botName);
            return;
        }

        const payload: object[] = [];

        for (const [name, command] of this.commands) {
            try {
                const json = command.data.toJSON();

                const size = commandCharacterCount(json);
                if (size > 6500) {
                    Logger.warn(
                        `Command "${name}" uses ${size} of Discord's 8000-character budget. ` +
                        `Split a subcommand group out before it starts failing to register.`,
                        this.botName,
                    );
                }

                payload.push(json);
            } catch (error) {
                Logger.error(
                    `Command "${name}" is invalid and was skipped so the rest can still register: ${error}`,
                    this.botName,
                );
            }
        }

        const rest = new REST({ version: "10" }).setToken(this.token_);
        const guildId = process.env.COMMAND_GUILD_ID?.trim();

        try {
            if (guildId) {
                Logger.info(`Registering ${payload.length} commands to guild ${guildId} (instant)...`, this.botName);
                await rest.put(Routes.applicationGuildCommands(this.user.id, guildId), { body: payload });
                Logger.success(`Registered ${payload.length} commands to guild ${guildId}`, this.botName);
                return;
            }

            Logger.info(`Registering ${payload.length} global commands (may take up to 1h to appear)...`, this.botName);
            await rest.put(Routes.applicationCommands(this.user.id), { body: payload });
            Logger.success(`Registered ${payload.length} global commands`, this.botName);
        } catch (error) {
            this.reportRegistrationFailure(error, payload);
        }
    }

    private reportRegistrationFailure(error: unknown, payload: object[]): void {
        const raw = (error as { rawError?: { errors?: Record<string, unknown>; message?: string } }).rawError;

        Logger.error(`Failed to register commands: ${(error as Error).message}`, this.botName);

        if (!raw?.errors) return;

        for (const [index, detail] of Object.entries(raw.errors)) {
            const name = (payload[Number(index)] as { name?: string })?.name ?? `#${index}`;
            Logger.error(`  → "${name}": ${JSON.stringify(detail)}`, this.botName);
        }
    }
}
