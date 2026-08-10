import { ConfigRepository } from "@database/repositories";
import {
    buildSecurityConfigKey,
    normalizeSecurityConfig,
    DEFAULT_MODERATION_SECURITY_CONFIG,
    type ModerationSecurityConfig,
} from "../config";

export async function getModerationSecurityConfig(guildId: string): Promise<ModerationSecurityConfig> {
    const key = buildSecurityConfigKey(guildId);
    const doc = await ConfigRepository.get(key, "moderation");

    let normalized = doc ? normalizeSecurityConfig(doc.value) : undefined;
    if (!normalized) {
        normalized = DEFAULT_MODERATION_SECURITY_CONFIG;
        await ConfigRepository.set(key, "moderation", normalized, "system");
        return normalized;
    }

    if (doc && JSON.stringify(normalized) !== JSON.stringify(doc.value)) {
        await ConfigRepository.set(key, "moderation", normalized, String((doc && doc.updatedBy) || "system"));
    }

    return normalized;
}
