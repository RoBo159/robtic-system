import { existsSync } from "fs";
import type { PanelDefinition } from "@typings/panel";
import { Logger } from "@logger";
import { registerPanel } from "./panel-store";

const definitionsGlob = new Bun.Glob("**/*.ts");

/** Sibling of this registry folder — `..` because this file lives one level deeper than `definitions`. */
const DEFINITIONS_DIR = `${import.meta.dir}/../definitions`;

async function loadDefinitions(): Promise<void> {
    if (!existsSync(DEFINITIONS_DIR)) return;

    for await (const file of definitionsGlob.scan({ cwd: DEFINITIONS_DIR, absolute: true })) {
        if (file.endsWith(".d.ts")) continue;
        try {
            const mod = await import(file);
            const panel: PanelDefinition | undefined = mod.default;
            if (!panel?.key || typeof panel.getContent !== "function") {
                Logger.warn(`Invalid panel definition at ${file} (needs a default export with "key" and "getContent")`, "Panels");
                continue;
            }
            registerPanel(panel);
        } catch (err) {
            Logger.error(`Failed to load panel definition ${file}: ${err}`, "Panels");
        }
    }
}

let loadPromise: Promise<void> | null = null;

/** Scans the definitions folder and registers every file's default export. Safe to call repeatedly. */
export function ensurePanelsLoaded(): Promise<void> {
    if (!loadPromise) loadPromise = loadDefinitions();
    return loadPromise;
}
