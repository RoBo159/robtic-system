import { ConfigRepository } from "@database/repositories";
import {
    buildSecurityConfigKey,
    normalizeSecurityConfig,
    DEFAULT_MODERATION_SECURITY_CONFIG,
    type ModerationSecurityConfig,
} from "../config";

export async function saveModerationSecurityConfig(
    guildId: string,
    config: ModerationSecurityConfig,
    updatedBy: string,
): Promise<ModerationSecurityConfig> {
    const key = buildSecurityConfigKey(guildId);
    let normalized = normalizeSecurityConfig(config);
    if (!normalized) normalized = DEFAULT_MODERATION_SECURITY_CONFIG;
    await ConfigRepository.set(key, "moderation", normalized, updatedBy);
    return normalized;
}
