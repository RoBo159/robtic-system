import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS, QUEST_TIERS, type QuestTier } from "@constants";
import { mentionRoleFor, tierEnabled } from "@database/models";
import { QuestSettingsRepository } from "@database/repositories";
import { tierTitle } from "../../utils/quest-lines";

const channel = (id: string | null): string => (id ? `<#${id}>` : "*not set*");

/**
 * The whole configuration on one screen, with the problems called out.
 *
 * The warnings matter more than the values: every one of them is a state where the engine keeps
 * running and quietly achieves nothing, which is exactly the kind of thing nobody notices for a
 * week.
 */
export const status: FeatureSubcommandHandler = async (interaction, _client) => {
    const settings = await QuestSettingsRepository.getCached(interaction.guildId!);

    const sign = settings.utcOffsetMinutes < 0 ? "-" : "+";
    const abs = Math.abs(settings.utcOffsetMinutes);
    const clock = `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;

    const warnings: string[] = [];
    if (!settings.dailyChannelId) warnings.push("No daily channel — generated quests are posted nowhere.");
    if (settings.communityEnabled && !settings.communityChannelId) {
        warnings.push("No community channel — the weekly challenge runs unseen.");
    }
    if (settings.vipRoleIds.length === 0 && tierEnabled(settings, "vip")) {
        warnings.push("No VIP roles — VIP quests are posted but nobody can claim them.");
    }
    if (settings.windows.filter(window => window.enabled).length === 0) {
        warnings.push("No enabled windows — nothing will be generated at all.");
    }

    const embed = new EmbedBuilder()
        .setTitle("Quest configuration")
        .setColor(warnings.length > 0 ? COLORS.warning : COLORS.success)
        .addFields(
            {
                name: "Channels",
                value:
                    `Daily — ${channel(settings.dailyChannelId)}\n` +
                    `Community — ${channel(settings.communityChannelId)}\n` +
                    `VIP — ${settings.vipChannelId ? channel(settings.vipChannelId) : "*falls back to daily*"}`,
                inline: true,
            },
            {
                name: "Mentions",
                value: [...QUEST_TIERS, "community" as const]
                    .map(type => {
                        const roleId = mentionRoleFor(settings, type);
                        const name = type === "community" ? "🌍 Community" : tierTitle(type as QuestTier);
                        return `${name} — ${roleId ? `<@&${roleId}>` : "—"}`;
                    })
                    .join("\n"),
                inline: true,
            },
            {
                name: "Difficulties",
                value: QUEST_TIERS
                    .map(tier => `${tierEnabled(settings, tier) ? "✅" : "🚫"} ${tierTitle(tier)}`)
                    .join("\n"),
                inline: true,
            },
            {
                name: `Windows (${clock})`,
                value: settings.windows.length > 0
                    ? settings.windows
                        .map(window =>
                            `${window.enabled ? "•" : "○"} **${window.key}** ${String(window.startHour).padStart(2, "0")}:00 → ${String(window.endHour).padStart(2, "0")}:00`)
                        .join("\n")
                    : "*none*",
                inline: true,
            },
            {
                name: "VIP roles",
                value: settings.vipRoleIds.length > 0
                    ? settings.vipRoleIds.map(id => `<@&${id}>`).join(", ")
                    : "*none*",
                inline: true,
            },
            {
                name: "Community challenge",
                value: settings.communityEnabled
                    ? `On · ${settings.communityRewardBase.toLocaleString()} points base · ` +
                      `min ${settings.communityMinContribution.toLocaleString()}`
                    : "Off",
                inline: true,
            },
        );

    if (warnings.length > 0) {
        embed.addFields({ name: "⚠️ Needs attention", value: warnings.map(line => `• ${line}`).join("\n") });
    }

    await interaction.editReply({ embeds: [embed] });
};
