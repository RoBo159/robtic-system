import { isFeatureEnabled } from "@core/features";
import { getFeatureManifest } from "@core/features/feature-registry";
import type { CommandConfig } from "@typings/command";
import { INTERACTION_MESSAGES } from "@constants";

export interface FeatureGateResult {
    allowed: boolean;
    /** Set when `allowed` is false — what to tell the user. */
    message?: string;
}

/**
 * Whether a command's owning feature is switched on in this guild.
 *
 * Commands with no `feature` always pass, which covers everything outside `features/`. Returns the
 * refusal text rather than replying, because the slash and prefix paths answer very differently —
 * one with an ephemeral embed, the other with a self-deleting chat notice.
 */
export async function checkFeatureEnabled(command: CommandConfig, guildId: string | null): Promise<FeatureGateResult> {
    if (!command.feature || !guildId) return { allowed: true };
    if (await isFeatureEnabled(guildId, command.feature)) return { allowed: true };

    const manifest = getFeatureManifest(command.feature);
    return {
        allowed: false,
        message: INTERACTION_MESSAGES.featureDisabled(manifest?.description ?? command.feature, command.feature),
    };
}
