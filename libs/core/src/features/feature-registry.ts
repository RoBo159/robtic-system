import type { FeatureManifest } from "@typings/feature";

/**
 * Every feature manifest the loader found this run.
 *
 * Module-level rather than a field on BotClient so `isFeatureEnabled` is importable from a
 * feature's own listeners without threading a client through them, and so deleting a feature
 * folder removes its entry with no other edit — the registry is only ever populated by the scan.
 */
const manifests = new Map<string, FeatureManifest>();

export function registerFeature(manifest: FeatureManifest): void {
    manifests.set(manifest.key, manifest);
}

/** Cleared before every reload so a deleted feature stops being listed. */
export function clearFeatureRegistry(): void {
    manifests.clear();
}

export function getFeatureManifest(key: string): FeatureManifest | undefined {
    return manifests.get(key);
}

export function listFeatureManifests(): FeatureManifest[] {
    return [...manifests.values()].sort((a, b) => a.key.localeCompare(b.key));
}
