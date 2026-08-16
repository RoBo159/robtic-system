import { EmbedBuilder, MessageFlags, type GuildMember } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { StreakRepository, StreakRecoveryRepository, StreakSettingsRepository } from "@database/repositories";
import { COLORS } from "@constants";
import { resolveStreakWindows } from "@core/streak";
import { canReturnStreaks } from "../functions/can-return-streaks";
import { applyStreakRole } from "../utils/streak-role";

/**
 * Gives a member their expired streak back.
 *
 * Staff only — administrators, plus whatever roles the guild assigned with
 * `/streak-config return-role add`. It is deliberately not self-service: a streak a member can
 * restore themselves is not really a streak, it is a button.
 */
export const returnStreak: FeatureSubcommandHandler = async (interaction, _client) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guildId = interaction.guildId!;
    const actor = interaction.member as GuildMember | null;

    if (!actor) {
        await interaction.editReply({ content: "This command only works in a server." });
        return;
    }

    const settings = await StreakSettingsRepository.get(guildId);

    if (!canReturnStreaks(actor, settings?.returnRoleIds ?? [])) {
        await interaction.editReply({
            content: "Only administrators, or a role assigned with `/streak-config return-role add`, can return a streak.",
        });
        return;
    }

    const user = interaction.options.getUser("user", true);
    const recovery = await StreakRecoveryRepository.find(user.id, guildId);

    if (!recovery) {
        await interaction.editReply({ content: `${user} has no streak waiting to be returned.` });
        return;
    }

    const { returnWindowHours } = resolveStreakWindows(settings);
    const deadline = recovery.expiredAt.getTime() + returnWindowHours * 3_600_000;

    if (Date.now() > deadline) {
        await interaction.editReply({
            content: `The ${returnWindowHours}h window to return ${user}'s streak has passed.`,
        });
        return;
    }

    // Restore clears pendingReturnUntil, which unfreezes them — from here their next qualifying
    // message continues the streak rather than being ignored.
    await StreakRepository.restore(user.id, guildId, recovery.currentStreak, recovery.bestStreak);
    await StreakRecoveryRepository.delete(user.id, guildId);

    const member = await interaction.guild?.members.fetch(user.id).catch(() => null);
    if (member) await applyStreakRole(member, recovery.currentStreak).catch(() => null);

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle("✅ Streak returned")
            .setColor(COLORS.success)
            .setDescription(`${user} is back to **${recovery.currentStreak}** days (best **${recovery.bestStreak}**).`)],
    });
};
