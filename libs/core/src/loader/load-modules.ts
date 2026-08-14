import type { BotClient } from "@core/bot-client";
import { Logger } from "@logger";
import { BotError, handleError } from "@core/handlers";
import { scanModuleFiles } from "./scan-module-files";
import { createLoadReport, type LoadReport } from "./load-report";
import { registerCommandModule } from "./register-command-module";
import { registerEventModule } from "./register-event-module";
import { registerComponentModule } from "./register-component-module";
import { registerMessageModule } from "./register-message-module";
import { registerManifestModule } from "./register-manifest-module";

export interface LoadOptions {
    /** Skip gateway listeners. Set on reload, which re-reads commands and components only. */
    skipEvents?: boolean;
}

/**
 * Imports and registers every module under `root` in one pass, discovered by filename suffix.
 */
export async function loadModules(client: BotClient, root: string, options: LoadOptions = {}): Promise<LoadReport> {
    const report = createLoadReport();
    const files = await scanModuleFiles(root);
    const imported = new Set<string>();

    for (const file of files) {
        if (imported.has(file.path)) continue;
        imported.add(file.path);

        if (options.skipEvents && file.kind === "event") continue;

        let mod: Record<string, unknown>;
        try {
            mod = await import(file.path) as Record<string, unknown>;
        } catch (error) {
            handleError(new BotError(`Failed to load: ${file.path}`, "MODULE"), file.path);
            report.invalid.push({ path: file.path, reason: String(error) });
            continue;
        }

        switch (file.kind) {
            case "manifest":
                registerManifestModule(mod, file.path, report);
                break;
            case "command":
                registerCommandModule(client, mod.default, file.path, report);
                break;
            case "event":
                registerEventModule(client, mod.default, file.path, report);
                break;
            case "component":
                registerComponentModule(client, mod, file.path, report);
                break;
            case "message":
                registerMessageModule(client, mod.default, file.path, report);
                break;
        }
    }

    reportLoad(report, client.botName, options.skipEvents ?? false);
    return report;
}

function reportLoad(report: LoadReport, botName: BotClient["botName"], skippedEvents: boolean): void {
    const parts = [
        `${report.features} features`,
        `${report.commands} commands`,
        `${report.components} components`,
        `${report.messages} message commands`,
        skippedEvents ? "events unchanged" : `${report.events} events`,
    ];
    Logger.info(`Loaded ${parts.join(" / ")}`, botName);

    for (const collision of report.collisions) {
        Logger.error(
            `Duplicate ${collision.kind} "${collision.name}" — kept ${collision.kept}, ignored ${collision.ignored}`,
            botName,
        );
    }

    for (const invalid of report.invalid) {
        Logger.warn(`Skipped ${invalid.path}: ${invalid.reason}`, botName);
    }
}
