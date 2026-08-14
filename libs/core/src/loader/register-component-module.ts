import type { BotClient } from "@core/bot-client";
import type { ComponentHandler } from "@typings/command";
import type { FeatureComponentIndex } from "@typings/feature";
import type { LoadReport } from "./load-report";

function isHandler(value: unknown): value is ComponentHandler {
    const candidate = value as ComponentHandler | undefined;
    return Boolean(candidate?.customId && typeof candidate?.run === "function");
}

function isComponentIndex(value: unknown): value is FeatureComponentIndex {
    const candidate = value as FeatureComponentIndex | undefined;
    return typeof candidate?.namespace === "string" && Array.isArray(candidate?.handlers);
}

function add(client: BotClient, handler: ComponentHandler, path: string, report: LoadReport, feature?: string): void {
    const key = handler.customId instanceof RegExp ? handler.customId.source : handler.customId;
    const existing = report.componentSources.get(key);

    if (existing) {
        report.collisions.push({ kind: "component", name: key, kept: existing, ignored: path });
        return;
    }

    client.components.set(key, feature ? { ...handler, feature } : handler);
    report.componentSources.set(key, path);
    report.components++;
}

/**
 * Registers component handlers from three shapes:
 *
 * - a `FeatureComponentIndex` default export — explicit, and the only shape that tags its handlers
 *   with an owning feature so a disabled feature's buttons can say so;
 * - a default-exported handler or array of handlers;
 * - every named export that looks like a handler, which is how the ~59 pre-existing component files
 *   are written.
 *
 * The last of those is why a stray named export shaped like `{ customId, run }` anywhere under
 * `components/` becomes a live handler. New feature code uses the index shape, which makes
 * registration a deliberate act rather than a property of what a file happens to export.
 */
export function registerComponentModule(client: BotClient, mod: Record<string, unknown>, path: string, report: LoadReport): void {
    if (isComponentIndex(mod.default)) {
        const { namespace, handlers } = mod.default;
        for (const handler of handlers) {
            if (isHandler(handler)) add(client, handler, path, report, handler.feature ?? namespace);
            else report.invalid.push({ path, reason: `component index "${namespace}" contains a non-handler entry` });
        }
        return;
    }

    // Every export, `default` included, and arrays flattened. Scanning all of them rather than
    // stopping at the default matters: profile-settings-buttons.ts ships one handler as its default
    // and two more as named exports, and taking only the default would silently unbind two buttons.
    const seen = new Set<ComponentHandler>();

    for (const value of Object.values(mod)) {
        for (const candidate of Array.isArray(value) ? value : [value]) {
            if (!isHandler(candidate) || seen.has(candidate)) continue;
            seen.add(candidate);
            add(client, candidate, path, report);
        }
    }
}
