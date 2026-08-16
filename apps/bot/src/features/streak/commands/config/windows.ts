import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS, STREAK_LIMITS } from "@constants";
import { StreakSettingsRepository } from "@database/repositories";
import { resolveStreakWindows } from "@core/streak";

const clamp = (value: number, { min, max }: { min: number; max: number }): number =>
    Math.max(min, Math.min(max, Math.round(value)));

/** Sets how long a streak lasts, and how long staff have to give it back. Omitted options are left alone. */
export const windows: FeatureSubcommandHandler = async (interaction, _client) => {
    const guildId = interaction.guildId!;
    const current = resolveStreakWindows(await StreakSettingsRepository.get(guildId));

    const claimInput = interaction.options.getInteger("claim-days");
    const expireInput = interaction.options.getInteger("expire-days");
    const returnInput = interaction.options.getInteger("return-hours");

    const claimDays = claimInput === null ? current.claimDays : clamp(claimInput, STREAK_LIMITS.claimDays);
    const requestedExpire = expireInput === null ? current.expireDays : clamp(expireInput, STREAK_LIMITS.expireDays);
    const returnWindowHours = returnInput === null
        ? current.returnWindowHours
        : clamp(returnInput, STREAK_LIMITS.returnWindowHours);

    // A streak that expires before it can next be claimed could never be continued, so expiry is
    // pushed past the claim window rather than the command being rejected — the admin's intent is
    // clear either way, and refusing would just make them do the arithmetic themselves.
    const expireDays = Math.max(claimDays + 1, requestedExpire);

    await StreakSettingsRepository.setWindows(guildId, claimDays, expireDays, returnWindowHours);

    const adjusted = expireDays !== requestedExpire
        ? `\n\n⚠️ Expiry raised to **${expireDays}** days so it stays above the claim window.`
        : "";

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle("Streak windows updated")
            .setColor(COLORS.success)
            .setDescription(
                `**Claim every:** ${claimDays} day(s)\n` +
                `**Expires after:** ${expireDays} day(s) without a claim\n` +
                `**Staff can return for:** ${returnWindowHours}h after expiry${adjusted}`
            )],
    });
};
