import type { GuildMember } from "discord.js";
import { StreakSettingsRepository } from "@database/repositories";
import { handleError, BotError } from "@core/handlers";
import { isFeatureEnabled } from "@core/features";
import { detectKickAuditEntry } from "@bot/utils/moderation/security";
import { breakStreak } from "./break-streak";

/**
 * A kick ends the streak, when the guild has asked for that.
 *
 * `guildMemberRemove` cannot tell a kick from someone leaving on their own, so the audit log is
 * consulted. If that lookup returns nothing — no entry yet, or the bot lacks View Audit Log — this
 * treats the departure as voluntary and leaves the streak alone. Failing open is the right way
 * round: wrongly destroying a 300-day streak is far worse than missing one kick.
 */
export async function onKickReset(member: GuildMember): Promise<void> {
    if (member.user.bot) return;
    if (!(await isFeatureEnabled(member.guild.id, "streak"))) return;

    try {
        const settings = await StreakSettingsRepository.get(member.guild.id);
        if (!settings?.breakOnKick) return;

        const kick = await detectKickAuditEntry(member.guild, member.id);
        if (!kick) return;

        await breakStreak(member, "kick");
    } catch (err) {
        handleError(new BotError(`Failed to reset streak on kick: ${err}`, "EVENT"), "main/streak-kick-reset");
    }
}
