import { MOD_SECURITY_CONFIG_KEY_PREFIX } from "@constants";

export function buildSecurityConfigKey(guildId: string): string {
    return `${MOD_SECURITY_CONFIG_KEY_PREFIX}:${guildId}`;
}
