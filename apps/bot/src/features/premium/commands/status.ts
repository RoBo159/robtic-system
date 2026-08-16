import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
import { PremiumRepository } from "@database/repositories";
import { premiumCacheSize, allPremiumFeatures } from "@core/premium";

export const toggle: FeatureSubcommandHandler = async (interaction, _client) => {
    const enabled = interaction.options.getBoolean("enabled", true);
    await PremiumRepository.setSettings(interaction.guildId!, { enabled });

    await interaction.editReply({
        content: enabled
            ? "Premium perks apply in this server again."
            : "Premium perks are off **in this server**. Memberships and role mappings are kept — every member simply resolves to the defaults here until you turn it back on.",
    });
};

/**
 * What premium looks like from inside this server.
 *
 * Deliberately shows both halves: the global ladder this server did not choose, and the local role
 * mappings it did. Premium fails silently — an unmapped ladder is indistinguishable from a working
 * one until someone notices they get nothing — so the warnings matter more than the counts.
 */
export const status: FeatureSubcommandHandler = async (interaction, _client) => {
    const guildId = interaction.guildId!;
    const [settings, tiers, values, roleMaps] = await Promise.all([
        PremiumRepository.getSettings(guildId),
        PremiumRepository.listTiers(),
        PremiumRepository.listValues(),
        PremiumRepository.listRoleMaps(guildId),
    ]);

    const warnings: string[] = [];
    if (!settings.enabled) warnings.push("Premium is switched off here — no perk applies in this server.");
    if (tiers.length === 0) warnings.push("No premium tiers exist yet. Only the bot operator can create them.");

    const mappedKeys = new Set(roleMaps.map(row => row.tierKey));
    const orphaned = roleMaps.filter(row => !tiers.some(tier => tier.key === row.tierKey));
    if (orphaned.length) {
        warnings.push(`${orphaned.length} role mapping(s) point at a tier that no longer exists — they grant nothing.`);
    }

    if (tiers.length > 0 && roleMaps.length === 0) {
        warnings.push("No roles are mapped here. Members only get premium through a global membership.");
    }

    const bare = tiers.filter(tier => !values.some(row => row.tierKey === tier.key));
    if (bare.length) warnings.push(`No perks configured on: ${bare.map(t => t.name).join(", ")} *(global — ask the operator)*.`);

    const cache = premiumCacheSize();

    const embed = new EmbedBuilder()
        .setTitle("💎 Premium — this server")
        .setColor(warnings.length ? COLORS.warning : COLORS.success)
        .setDescription(
            tiers.length
                ? tiers
                    .map(tier =>
                        `${tier.emoji} **${tier.name}** · rank ${tier.rank} · ` +
                        `${values.filter(v => v.tierKey === tier.key).length} perk(s) · ` +
                        `${roleMaps.filter(r => r.tierKey === tier.key).length} role(s) here` +
                        (mappedKeys.has(tier.key) ? "" : " *(not mapped here)*")
                    )
                    .join("\n")
                    .slice(0, 4096)
                : "No tiers exist."
        )
        .addFields(
            { name: "Perks apply here", value: settings.enabled ? "yes" : "no", inline: true },
            { name: "Badges", value: settings.showBadges ? "shown" : "hidden", inline: true },
            { name: "Roles mapped", value: `${roleMaps.length}`, inline: true },
            { name: "Global tiers", value: `${tiers.length}`, inline: true },
            { name: "Perks registered", value: `${allPremiumFeatures().length}`, inline: true },
            { name: "Cached", value: `${cache.members} member(s), ${cache.guilds} guild(s)`, inline: true },
        )
        .setFooter({ text: "Tiers and perk values are global. This server only controls its role mappings and the switch above." });

    if (warnings.length) {
        embed.addFields({ name: "⚠️ Needs attention", value: warnings.map(line => `• ${line}`).join("\n").slice(0, 1024) });
    }

    await interaction.editReply({ embeds: [embed] });
};
