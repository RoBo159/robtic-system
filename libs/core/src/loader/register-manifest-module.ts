import type { FeatureManifest } from "@typings/feature";
import { registerFeature } from "@core/features/feature-registry";
import type { LoadReport } from "./load-report";

function isManifest(value: unknown): value is FeatureManifest {
    const candidate = value as FeatureManifest | undefined;
    return (
        typeof candidate?.key === "string" &&
        typeof candidate?.description === "string" &&
        (candidate?.activation === "opt-in" || candidate?.activation === "default-on") &&
        Array.isArray(candidate?.commands)
    );
}

/**
 * Registers a feature's `<key>/<key>.ts` manifest.
 *
 * Manifests load before anything else so the activation registry is complete by the time the first
 * command or listener is registered, and a mismatch between the folder name and the declared key is
 * rejected rather than quietly producing a feature nothing can enable — `/feature enable <key>`
 * writes the declared key, while the folder name is what a person reads.
 */
export function registerManifestModule(mod: Record<string, unknown>, path: string, report: LoadReport): void {
    // Default or named, because the manifest is imported by the feature's own command and message
    // files — `import { topFeature } from "./top"` reads better there than a default import, and
    // requiring one shape over the other would buy nothing.
    const candidate = isManifest(mod.default) ? mod.default : Object.values(mod).find(isManifest);

    if (!isManifest(candidate)) {
        report.invalid.push({ path, reason: "feature manifest needs `key`, `description`, `activation` and `commands`" });
        return;
    }

    const folder = path.replaceAll("\\", "/").split("/").at(-2);
    if (folder !== candidate.key) {
        report.invalid.push({ path, reason: `manifest key "${candidate.key}" does not match folder "${folder}"` });
        return;
    }

    registerFeature(candidate);
    report.features++;
}
