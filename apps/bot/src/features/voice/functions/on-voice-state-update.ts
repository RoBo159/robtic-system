import type { VoiceState } from "discord.js";
import { touchActivity } from "@core/activity";
import { isFeatureEnabled } from "@core/features";
import { startSession, endSession, moveSession } from "./session-store";

/**
 * Opens, moves and closes sessions as members come and go.
 *
 * Joining, leaving or switching channel is a deliberate act, so it counts toward presence — which
 * is what stops someone who just joined being treated as AFK on the very first tick.
 *
 * A channel switch moves the existing session rather than ending it: hopping between rooms is one
 * stay, and splitting it would wreck both the session count and the average length.
 */
export async function onVoiceStateUpdate(oldState: VoiceState, newState: VoiceState): Promise<void> {
    const member = newState.member ?? oldState.member;
    if (!member || member.user.bot) return;

    const guildId = newState.guild.id;
    if (!(await isFeatureEnabled(guildId, "voice"))) return;

    const before = oldState.channelId;
    const after = newState.channelId;
    if (before === after) return;

    touchActivity(guildId, member.id, "voice-state");

    if (!before && after) {
        await startSession(guildId, member.id, member.user.username, after);
        return;
    }

    if (before && !after) {
        await endSession(guildId, member.id);
        return;
    }

    if (before && after) moveSession(guildId, member.id, after);
}
