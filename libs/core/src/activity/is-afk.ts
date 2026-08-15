import { ActivityXP } from "@database/models";
import { getLastActivity, primeActivity } from "./activity-tracker";

/**
 * Whether a member counts as away.
 *
 * Presence is measured by *doing* something, not by microphone state — someone listening in a
 * study channel with their mic off is present, and someone with an open mic who left the room an
 * hour ago is not. See VOICE_CONFIG.afkTimeoutMs for the window.
 *
 * On a cold cache the persisted timestamp is read once and seeded, so a restart does not decide
 * that every connected member went AFK. A member with no record at all is treated as present:
 * withholding rewards from someone the process has simply never seen is the wrong default.
 */
export async function isAfk(guildId: string, discordId: string, timeoutMs: number): Promise<boolean> {
    let last = getLastActivity(guildId, discordId);

    if (last === null) {
        const record = await ActivityXP.findOne({ guildId, discordId }, { "decay.lastActiveAt": 1 });
        const persisted = record?.decay?.lastActiveAt;
        if (!persisted) return false;

        primeActivity(guildId, discordId, persisted);
        last = persisted.getTime();
    }

    return Date.now() - last > timeoutMs;
}
