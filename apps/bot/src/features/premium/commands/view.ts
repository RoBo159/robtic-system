import { EmbedBuilder, type GuildMember } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
import { PremiumRepository } from "@database/repositories";
import { benefitsForRoles, getBenefits, allPremiumFeatures, getPremiumFeature, premiumFeaturesByModule } from "@core/premium";
import { formatFeatureValue } from "../utils/format";

/**
 * What this member actually gets, resolved by the engine rather than read off their roles.
 *
 * Only perks that differ from the baseline are listed: a wall of "+0%" tells a member nothing, and
 * the interesting question is always "what does my tier change".
 */
export const view: FeatureSubcommandHandler = async (interaction, _client) => {
    const guildId = interaction.guildId!;
    const target = interaction.options.getUser("user") ?? interaction.user;
    const isSelf = target.id === interaction.user.id;

    // Prefer the roles already in hand for the caller; anyone else goes through the engine's cache.
    const member = interaction.member as GuildMember | null;
    const benefits = isSelf && member
        ? await benefitsForRoles(guildId, target.id, [...member.roles.cache.keys()])
        : await getBenefits(guildId, target.id);

    if (!benefits.isPremium) {
        const tiers = await PremiumRepository.listTiers();

        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle(`💎 Premium — ${target.username}`)
                .setColor(COLORS.info)
                .setDescription(
                    tiers.length === 0
                        ? "No premium tiers exist yet."
                        : `${isSelf ? "You have" : "They have"} no premium tier.\n` +
                          `Tiers: ${tiers.map(t => `${t.emoji} ${t.name}`).join(" · ")}\n` +
                          "`/premium tiers` shows what each gives — the same in every server."
                )],
        });
        return;
    }

    const granted = allPremiumFeatures().filter(def => {
        const value = benefits.values[def.key];
        return typeof value === "boolean" ? value !== def.baseline : (value ?? 0) !== def.baseline;
    });

    const held = benefits.holdings[0]!;

    const embed = new EmbedBuilder()
        .setTitle(`${benefits.tier!.emoji} ${benefits.tier!.name} — ${target.username}`)
        .setColor(benefits.tier!.color ? Number.parseInt(benefits.tier!.color.slice(1), 16) : COLORS.success)
        .setThumbnail(target.displayAvatarURL())
        .setFooter({
            text: benefits.holdings.length > 1
                ? `Also holds: ${benefits.holdings.slice(1).map(h => h.tier.name).join(", ")}`
                : held.source === "membership"
                    ? "A membership — it applies in every server"
                    : "Granted by a role in this server",
        });

    if (granted.length === 0) {
        embed.setDescription("This tier has no perks configured yet.");
        await interaction.editReply({ embeds: [embed] });
        return;
    }

    const byModule = new Map<string, string[]>();
    for (const def of granted) {
        const bucket = byModule.get(def.module) ?? [];
        bucket.push(`• ${def.description} — **${formatFeatureValue(def, benefits.values[def.key]!)}**`);
        byModule.set(def.module, bucket);
    }

    for (const [module, lines] of byModule) {
        embed.addFields({ name: module, value: lines.join("\n").slice(0, 1024), inline: false });
    }

    await interaction.editReply({ embeds: [embed] });
};

/** The ladder as a member sees it: every tier and what it grants, without the role plumbing. */
export const tiers: FeatureSubcommandHandler = async (interaction, _client) => {
    const [tierRows, values] = await Promise.all([
        PremiumRepository.listTiers(),
        PremiumRepository.listValues(),
    ]);

    if (tierRows.length === 0) {
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle("💎 Premium")
                .setColor(COLORS.info)
                .setDescription("No premium tiers exist yet.")],
        });
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle("💎 Premium tiers")
        .setColor(COLORS.info)
        .setFooter({ text: "The same everywhere the bot runs · /premium view shows what you hold" });

    // Ascending, so the ladder reads as a ladder rather than as a ranking.
    for (const tier of [...tierRows].sort((a, b) => a.rank - b.rank).slice(0, 25)) {
        const perks = values
            .filter(row => row.tierKey === tier.key)
            .map(row => {
                const def = getPremiumFeature(row.feature);
                return `• ${def?.description ?? row.feature} — **${formatFeatureValue(def, row.value)}**`;
            });

        embed.addFields({
            name: `${tier.emoji} ${tier.name}`,
            value: (perks.length ? perks.join("\n") : "*nothing configured yet*").slice(0, 1024),
        });
    }

    // Kept out of the loop: a member reading this wants the perks, not the taxonomy.
    if (premiumFeaturesByModule().size === 0) embed.setDescription("No perks are registered.");

    await interaction.editReply({ embeds: [embed] });
};
