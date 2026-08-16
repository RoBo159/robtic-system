import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS, PREMIUM_CONFIG } from "@constants";
import { PremiumRepository } from "@database/repositories";
import { getPremiumFeature, premiumFeaturesByModule, allPremiumFeatures } from "@core/premium";
import { formatFeatureValue, valueHint } from "../utils/format";

/**
 * Validates a raw number against what the feature's type actually means.
 *
 * One command configures every perk, so this is where "12" becomes twelve percent, twelve slots or
 * twelve hours — and where a nonsense combination is refused with the unit spelled out rather than
 * stored and quietly misapplied months later.
 */
function coerce(def: ReturnType<typeof getPremiumFeature>, raw: number): { value: number | boolean } | { error: string } {
    if (!def) return { error: "Unknown perk." };

    switch (def.type) {
        case "flag":
            return { value: raw > 0 };

        case "percent": {
            const { min, max } = PREMIUM_CONFIG.percentRange;
            if (raw < min || raw > max) return { error: `A percentage between ${min} and ${max}.` };
            return { value: Math.round(raw) };
        }

        case "count": {
            const { min, max } = PREMIUM_CONFIG.countRange;
            if (raw < min || raw > max || !Number.isInteger(raw)) return { error: `A whole number between ${min} and ${max}.` };
            return { value: raw };
        }

        case "duration": {
            const { min, max } = PREMIUM_CONFIG.durationHoursRange;
            if (raw < min || raw > max) return { error: `Hours, between ${min} and ${max}.` };
            return { value: Math.round(raw) };
        }
    }
}

export const featureSet: FeatureSubcommandHandler = async (interaction, _client) => {
    const tierKey = interaction.options.getString("tier", true);
    const featureKey = interaction.options.getString("feature", true).toUpperCase();
    const raw = interaction.options.getNumber("value", true);

    const def = getPremiumFeature(featureKey);
    if (!def) {
        await interaction.editReply({
            content: `No perk called \`${featureKey}\`. \`/premium-admin feature list\` shows every one.`,
        });
        return;
    }

    const tier = await PremiumRepository.findTier(tierKey);
    if (!tier) {
        await interaction.editReply({ content: `No tier called **${tierKey}**.` });
        return;
    }

    const coerced = coerce(def, raw);
    if ("error" in coerced) {
        await interaction.editReply({ content: `❌ ${coerced.error} For **${def.key}**, that means ${valueHint(def)}.` });
        return;
    }

    await PremiumRepository.setValue({
        tierKey: tier.key,
        feature: def.key,
        value: coerced.value,
        setBy: interaction.user.id,
    });

    const stacking = def.stacking === "highest"
        ? "Members holding several tiers get this from their highest."
        : `Stacks across tiers (${def.stacking}).`;

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle(`${tier.emoji} ${tier.name} — ${def.key}`)
            .setDescription(
                `${def.description}\n\n**Now worth:** ${formatFeatureValue(def, coerced.value)}\n${stacking}`
            )
            .setFooter({ text: "Applies immediately — cached benefits are dropped on every change." })],
    });
};

export const featureClear: FeatureSubcommandHandler = async (interaction, _client) => {
    const tierKey = interaction.options.getString("tier", true);
    const featureKey = interaction.options.getString("feature", true).toUpperCase();

    const cleared = await PremiumRepository.clearValue(tierKey, featureKey);
    const def = getPremiumFeature(featureKey);

    await interaction.editReply({
        content: cleared
            ? `**${featureKey}** is back to its default for **${tierKey}** (${formatFeatureValue(def, def?.baseline ?? 0)}).`
            : `**${tierKey}** had no value set for **${featureKey}**.`,
    });
};

/** The catalogue: every perk that can be configured, what it does, and what it defaults to. */
export const featureList: FeatureSubcommandHandler = async (interaction, _client) => {
    const wanted = interaction.options.getString("module")?.trim().toLowerCase();
    const grouped = premiumFeaturesByModule();

    const embed = new EmbedBuilder()
        .setTitle("💎 Configurable perks")
        .setColor(COLORS.info)
        .setFooter({ text: `${allPremiumFeatures().length} perks · set one with /premium-admin feature set` });

    const modules = [...grouped.keys()].filter(module => !wanted || module === wanted);

    if (modules.length === 0) {
        await interaction.editReply({
            content: `No perks for \`${wanted}\`. Systems: ${[...grouped.keys()].join(", ")}.`,
        });
        return;
    }

    for (const module of modules.slice(0, 25)) {
        const lines = (grouped.get(module) ?? []).map(def =>
            `\`${def.key}\` — ${def.description} *(${def.type}${def.stacking !== "highest" ? `, ${def.stacking}` : ""})*`
        );

        embed.addFields({ name: module, value: lines.join("\n").slice(0, 1024) });
    }

    await interaction.editReply({ embeds: [embed] });
};
