import type { GuildMember } from "discord.js";
import { StreakRepository, StreakRecoveryRepository, StreakSettingsRepository } from "@database/repositories";
import { resolveStreakWindows } from "@core/streak";
import { Logger } from "@logger";
import { applyStreakRole } from "../utils/streak-role";

const CTX = "main:streak";

/**
 * Ends a member's streak because they were punished.
 *
 * Writes the recovery row first, exactly like natural expiry does, so a punishment that turns out
 * to be a mistake can still be undone with `/streak-return`. The original timeout handler skipped
 * that, which quietly made punished streaks unrecoverable — the one case where somebody is most
 * likely to want them back.
 *
 * Returns true when a streak was actually ended.
 */
export async function breakStreak(member: GuildMember, reason: string): Promise<boolean> {
    const guildId = member.guild.id;

    const record = await StreakRepository.find(member.id, guildId);
    if (!record || !record.active || record.currentStreak <= 0) return false;

    const { returnWindowHours } = resolveStreakWindows(await StreakSettingsRepository.get(guildId));

    await StreakRecoveryRepository.create(member.id, guildId, record.currentStreak, record.bestStreak);
    await StreakRepository.expire(member.id, guildId, returnWindowHours);
    await applyStreakRole(member, 0).catch(() => null);

    Logger.debug(`Broke streak for ${member.id} in ${guildId} (${reason}, lost ${record.currentStreak})`, CTX);
    return true;
}
