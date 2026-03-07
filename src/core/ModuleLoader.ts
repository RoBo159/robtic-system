import { readdirSync, statSync, existsSync } from "fs";
import path from "path";
import { BotClient } from "@core/BotClient";

import { Logger } from "@core/libs";
import { handleError, BotError } from "@core/handlers";
import type { CommandConfig, ComponentHandler } from "@core/config";

export class ModuleLoader {
    constructor(private client: BotClient) {}

    async loadCommands(dir: string): Promise<void> {
        if (!existsSync(dir)) return;
        await this.walkDir(dir, async (filePath, name) => {
            const mod = await import(filePath);
            const command: CommandConfig = mod.default;

            if (command?.data && command?.run!) {
                this.client.commands.set(command.data.name, command);
                Logger.debug(`Loaded command: ${command.data.name}`, this.client.botName);
            } else {
                Logger.warn(`Invalid command at ${filePath}`, this.client.botName);
            }
        });
    }

    async loadEvents(dir: string): Promise<void> {
        if (!existsSync(dir)) return;
        await this.walkDir(dir, async (filePath, name) => {
            const mod = await import(filePath);
            const event = mod.default;

            if (event?.name && event?.execute) {
                if (event.once) {
                    this.client.once(event.name, (...args: unknown[]) =>
                        event.execute(...args, this.client)
                    );
                } else {
                    this.client.on(event.name, (...args: unknown[]) =>
                        event.execute(...args, this.client)
                    );
                }
                Logger.debug(`Loaded event: ${event.name}`, this.client.botName);
            } else {
                Logger.warn(`Invalid event at ${filePath}`, this.client.botName);
            }
        });
    }

    async loadComponents(dir: string): Promise<void> {
        if (!existsSync(dir)) return;
        await this.walkDir(dir, async (filePath, name) => {
            const mod = await import(filePath);

            for (const exp of Object.values(mod)) {
                const component = exp as ComponentHandler;
                if (component?.customId && typeof component?.run === "function") {
                    const key = component.customId instanceof RegExp
                        ? component.customId.source
                        : component.customId;
                    this.client.components.set(key, component);
                    Logger.debug(`Loaded component: ${key}`, this.client.botName);
                }
            }
        });
    }

    private async walkDir(
        dir: string,
        callback: (filePath: string, name: string) => Promise<void>
    ): Promise<void> {
        const entries = readdirSync(dir);

        for (const entry of entries) {
            const fullPath = path.join(dir, entry);
            const stat = statSync(fullPath);

            if (stat.isDirectory()) {
                await this.walkDir(fullPath, callback);
            } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
                const name = entry.replace(".ts", "");
                try {
                    await callback(fullPath, name);
                } catch (err) {
                    handleError(
                        new BotError(`Failed to load: ${fullPath}`, "MODULE"),
                        fullPath
                    );
                }
            }
        }
    }
}
