import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS, PREMIUM_CONFIG } from "@constants";
import { PremiumRepository } from "@database/repositories";
import { getPremiumFeature } from "@core/premium";
import { formatFeatureValue } from "../utils/format";

/** Tier keys appear in role maps, memberships and autocomplete, so they stay boring. */
const slugify = (raw: string): string =>
    raw.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24);

/**
 * Creates a tier for the whole bot.
 *
 * Operator-only, because it is global: a tier created here appears in every server, and its perks
 * are worth the same everywhere. That is the guarantee the membership system rests on.
 */
export const tierCreate: FeatureSubcommandHandler = async (interaction, _client) => {
    const name = interaction.options.getString("name", true).trim().slice(0, 40);
    const rank = interaction.options.getInteger("rank", true);
    const emoji = interaction.options.getString("emoji")?.trim() ?? "💎";
    const color = interaction.options.getString("color")?.trim() ?? null;

    const key = slugify(name);
    if (!key) {
        await interaction.editReply({ content: "That name has no usable characters — try something like `Prime+`." });
        return;
    }

    if (await PremiumRepository.countTiers() >= PREMIUM_CONFIG.maxTiers) {
        await interaction.editReply({ content: `There are already ${PREMIUM_CONFIG.maxTiers} tiers.` });
        return;
    }

    if (color && !/^#[0-9a-f]{6}$/i.test(color)) {
        await interaction.editReply({ content: "Colour must look like `#f5c518`." });
        return;
    }

    const tier = await PremiumRepository.createTier({ key, name, rank, emoji, color, createdBy: interaction.user.id });

    if (!tier) {
        await interaction.editReply({ content: `A tier called \`${key}\` already exists — edit it with \`/premium-admin tier edit\`.` });
        return;
    }

    await interaction.editReply({
        content: `Created ${emoji} **${name}** (\`${key}\`) at rank **${rank}**, in every server.\n` +
            "Next: `/premium-admin feature set` gives it perks. Servers map their own roles to it with `/premium-config role add`.",
    });
};

export const tierDelete: FeatureSubcommandHandler = async (interaction, _client) => {
    const key = interaction.options.getString("tier", true);
    const deleted = await PremiumRepository.deleteTier(key);

    await interaction.editReply({
        content: deleted
            ? `Deleted \`${key}\` everywhere, along with its perk values, every server's role mapping to it, and every membership on it.`
            : `No tier called \`${key}\`.`,
    });
};

export const tierEdit: FeatureSubcommandHandler = async (interaction, _client) => {
    const key = interaction.options.getString("tier", true);

    const changes: Record<string, unknown> = {};
    const name = interaction.options.getString("name")?.trim();
    const rank = interaction.options.getInteger("rank");
    const emoji = interaction.options.getString("emoji")?.trim();
    const color = interaction.options.getString("color")?.trim();
    const enabled = interaction.options.getBoolean("enabled");

    if (name) changes.name = name.slice(0, 40);
    if (rank !== null) changes.rank = rank;
    if (emoji) changes.emoji = emoji;
    if (enabled !== null) changes.enabled = enabled;
    if (color) {
        if (!/^#[0-9a-f]{6}$/i.test(color)) {
            await interaction.editReply({ content: "Colour must look like `#f5c518`." });
            return;
        }
        changes.color = color;
    }

    if (Object.keys(changes).length === 0) {
        await interaction.editReply({ content: "Nothing to change — give at least one of name, rank, emoji, colour or enabled." });
        return;
    }

    const tier = await PremiumRepository.updateTier(key, changes);

    await interaction.editReply({
        content: tier
            ? `Updated ${tier.emoji} **${tier.name}**${tier.enabled ? "" : " — currently disabled, so it grants nothing"}.`
            : `No tier called \`${key}\`.`,
    });
};

/** The global ladder, with everything configured on it. */
export const tierList: FeatureSubcommandHandler = async (interaction, _client) => {
    const [tiers, values] = await Promise.all([
        PremiumRepository.listTiers(),
        PremiumRepository.listValues(),
    ]);

    if (tiers.length === 0) {
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle("💎 Premium tiers")
                .setColor(COLORS.info)
                .setDescription("No tiers yet. `/premium-admin tier create` makes one, for every server at once.")],
        });
        return;
    }

    const embed = new EmbedBuilder()
        .setTitle("💎 Premium tiers — global")
        .setColor(COLORS.info)
        .setFooter({ text: "These apply in every server. Servers only choose which of their roles grant them." });

    for (const tier of tiers.slice(0, 25)) {
        const perks = values
            .filter(row => row.tierKey === tier.key)
            .map(row => `• \`${row.feature}\` — **${formatFeatureValue(getPremiumFeature(row.feature), row.value)}**`);

        embed.addFields({
            name: `${tier.emoji} ${tier.name} · rank ${tier.rank}${tier.enabled ? "" : " · disabled"}`,
            value: (perks.length ? perks.join("\n") : "*no perks configured*").slice(0, 1024),
        });
    }

    await interaction.editReply({ embeds: [embed] });
};
