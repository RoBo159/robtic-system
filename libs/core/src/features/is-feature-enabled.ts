import { GuildFeatureRepository } from "@database/repositories";
import { getFeatureManifest } from "./feature-registry";

/**
 * Whether a feature is live in this guild: the guild's explicit `/feature` choice if it made one,
 * otherwise the manifest's `activation` default.
 *
 * An unknown key returns `true`. The gate exists to honour a guild's choice, not to police keys —
 * refusing to run a command whose manifest failed to load would turn one bad file into a silent
 * outage, and the loader already logs that failure loudly.
 */
export async function isFeatureEnabled(guildId: string, key: string): Promise<boolean> {
    const manifest = getFeatureManifest(key);
    if (!manifest) return true;

    const overrides = await GuildFeatureRepository.getOverrides(guildId);
    return overrides.get(key) ?? manifest.activation === "default-on";
}
