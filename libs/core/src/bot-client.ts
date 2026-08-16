import {
    Client,
    Collection,
    REST,
    Routes,
    type ClientEvents,
    type GatewayIntentBits,
    type Partials,
} from "discord.js";
import type { EventEmitter } from "node:events";
import type { CommandConfig, ComponentHandler } from "@typings/command";
import type { MessageCommandConfig } from "@typings/message-command";
import { Logger } from "@logger";
import { sendStatus } from "./status/status";
import { buildCommandPayload } from "./registration/build-command-payload";
import { putCommandRoute } from "./registration/put-command-route";
import { getAdminGuildId } from "./bot-admin/admin-guild";

/** Comfortably above the listeners the loader attaches, low enough that a real leak still warns. */
const MAX_LISTENERS_PER_EVENT = 40;

export class BotClient extends Client {
    public commands = new Collection<string, CommandConfig>();
    public components = new Collection<string, ComponentHandler>();
    /** Prefix-only handlers, keyed by name and by each alias. Deliberately separate from `commands`. */
    public messageCommands = new Collection<string, MessageCommandConfig>();
    /**
     * Every listener the loader attached, so a reload can detach exactly those and no others.
     *
     * Typed against the base EventEmitter rather than discord.js's per-event overloads: those
     * resolve one concrete event name at a time and cannot accept a `keyof ClientEvents` union.
     */
    public eventBindings: Array<{ name: keyof ClientEvents; listener: (...args: unknown[]) => void }> = [];

    /** The client as a plain emitter, for attaching/detaching listeners by a non-literal event name. */
    asEmitter(): EventEmitter {
        return this as unknown as EventEmitter;
    }
    public botName: BotName;
    private token_: string;

    constructor(name: BotName, token: string, intents: GatewayIntentBits[], partials?: Partials[]) {
        super({ intents, ...(partials?.length ? { partials } : {}) });
        this.botName = name;
        this.token_ = token;

        // Node warns past ten listeners on one event as a leak heuristic. Here they are deliberate:
        // messageCreate alone carries the prefix router, shortcuts, the channel guard, message
        // stats, combo, streak, community XP, auto-replies and presence tracking. Raised rather
        // than removed, so a genuine runaway still trips it.
        this.setMaxListeners(MAX_LISTENERS_PER_EVENT);
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
    /** A REST client bound to this bot's token, for callers that publish command routes directly. */
    rest_(): REST {
        return new REST({ version: "10" }).setToken(this.token_);
    }

    /**
     * Publishes commands to up to two routes: the ordinary one, and — for `scope: "admin"` commands
     * — the guild set with `!admin-guild`.
     *
     * With no admin guild configured the admin payload is not published anywhere. That is
     * deliberate rather than a fallback to COMMAND_GUILD_ID: admin commands stay fully usable by
     * prefix, because the prefix router resolves against the loaded command collection and never
     * against Discord's registry, so skipping costs nothing and never leaks `/whitelist` into every
     * server the bot joins.
     */
    async registerSlashCommands(): Promise<void> {
        if (this.commands.size === 0) return;

        if (!this.user) {
            Logger.warn("Client not ready, deferring command registration", this.botName);
            return;
        }

        const { main, admin } = buildCommandPayload(this.commands, this.botName);
        const rest = this.rest_();

        const commandGuildId = process.env.COMMAND_GUILD_ID?.trim();
        const adminGuildId = await getAdminGuildId();

        // One test server for everything is the normal dev setup, and two puts to the same route
        // would leave only whichever landed second. Merge instead.
        if (adminGuildId && adminGuildId === commandGuildId) {
            await putCommandRoute(
                rest,
                Routes.applicationGuildCommands(this.user.id, adminGuildId),
                [...main, ...admin],
                `guild ${adminGuildId}`,
                this.botName,
            );
            await this.pruneGlobalCommands(rest, commandGuildId);
            return;
        }

        const mainRoute = commandGuildId
            ? Routes.applicationGuildCommands(this.user.id, commandGuildId)
            : Routes.applicationCommands(this.user.id);
        const mainLabel = commandGuildId ? `guild ${commandGuildId} (instant)` : "global (up to 1h to appear)";

        await putCommandRoute(rest, mainRoute, main, mainLabel, this.botName);
        await this.pruneGlobalCommands(rest, commandGuildId);

        if (!admin.length) return;

        if (!adminGuildId) {
            Logger.warn(
                `${admin.length} admin-scope command(s) not registered — no admin guild is set. ` +
                `Run \`!admin-guild set <id>\` in the server that should host them. They remain usable by prefix.`,
                this.botName,
            );
            return;
        }

        await putCommandRoute(
            rest,
            Routes.applicationGuildCommands(this.user.id, adminGuildId),
            admin,
            `admin guild ${adminGuildId}`,
            this.botName,
        );
    }

    /**
     * Clears globally-registered commands while a command guild is configured.
     *
     * Guild and global commands are separate registries and Discord shows **both** in the picker.
     * A bot that once ran without COMMAND_GUILD_ID leaves its global copies behind forever, so the
     * test server ends up with two identical `/shortcut` entries: one current, one frozen at
     * whatever the options looked like the day it was published. Picking the stale one sends the
     * bot an interaction missing options its handler requires — `Required option "trigger" not
     * found`, from a command that is demonstrably correct in source.
     *
     * Nothing is pruned when no command guild is set: that is the production shape, where the
     * global registry is the real one.
     */
    private async pruneGlobalCommands(rest: REST, commandGuildId: string | undefined): Promise<void> {
        if (!commandGuildId || !this.user) return;

        const existing = await rest
            .get(Routes.applicationCommands(this.user.id))
            .catch(() => null) as unknown[] | null;

        if (!existing?.length) return;

        Logger.warn(
            `Removing ${existing.length} stale global command(s) — COMMAND_GUILD_ID is set, so guild ` +
            "registrations are authoritative and the global copies only shadow them in the picker.",
            this.botName,
        );

        await putCommandRoute(rest, Routes.applicationCommands(this.user.id), [], "global (pruned)", this.botName);
    }
}
