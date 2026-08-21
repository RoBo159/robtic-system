import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
import { PremiumRepository } from "@database/repositories";

/**
 * Grants a membership that follows the member everywhere.
 *
 * This is the path that makes premium a *membership* rather than a role reader: nothing about it
 * depends on a server, so someone granted Prime here has Prime in every server the bot is in,
 * including ones that never configured a premium role.
 */
export const grant: FeatureSubcommandHandler = async (interaction, _client) => {
    const target = interaction.options.getUser("user", true);
    const tierKey = interaction.options.getString("tier", true);
    const days = interaction.options.getInteger("days");
    const reason = interaction.options.getString("reason")?.trim() ?? "";

    const tier = await PremiumRepository.findTier(tierKey);
    if (!tier) {
        await interaction.editReply({ content: `No tier called \`${tierKey}\`.` });
        return;
    }

    const expiresAt = days && days > 0 ? new Date(Date.now() + days * 24 * 60 * 60 * 1000) : null;

    await PremiumRepository.grantMembership({
        discordId: target.id,
        tierKey: tier.key,
        grantedBy: interaction.user.id,
        reason,
        expiresAt,
    });

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setColor(COLORS.success)
            .setTitle(`${tier.emoji} ${tier.name} granted`)
            .setDescription(
                `<@${target.id}> now holds **${tier.name}** in every server.\n` +
                (expiresAt ? `Expires <t:${Math.floor(expiresAt.getTime() / 1000)}:R>.` : "Permanent — no expiry.") +
                (reason ? `\n\n*${reason}*` : "")
            )],
    });
};

export const revoke: FeatureSubcommandHandler = async (interaction, _client) => {
    const target = interaction.options.getUser("user", true);
    const tierKey = interaction.options.getString("tier", true);

    const removed = await PremiumRepository.revokeMembership(target.id, tierKey);

    await interaction.editReply({
        content: removed
            ? `Revoked \`${tierKey}\` from <@${target.id}>. Any tier granted by a server role is unaffected.`
            : `<@${target.id}> holds no membership on \`${tierKey}\`.`,
    });
};

/** One member's memberships, expired ones included — the record of what they had and when. */
export const memberships: FeatureSubcommandHandler = async (interaction, _client) => {
    const target = interaction.options.getUser("user", true);
    const [rows, tiers] = await Promise.all([
        PremiumRepository.allMemberships(target.id),
        PremiumRepository.listTiers(),
    ]);

    const byKey = new Map(tiers.map(tier => [tier.key, tier]));
    const now = Date.now();

    const embed = new EmbedBuilder()
        .setTitle(`💎 Memberships — ${target.username}`)
        .setColor(rows.length ? COLORS.info : COLORS.warning);

    if (rows.length === 0) {
        embed.setDescription("No global memberships. They may still hold a tier through a server role.");
        await interaction.editReply({ embeds: [embed] });
        return;
    }

    embed.setDescription(
        rows.map(row => {
            const tier = byKey.get(row.tierKey);
            const name = tier ? `${tier.emoji} **${tier.name}**` : `\`${row.tierKey}\` *(deleted)*`;
            const expiry = row.expiresAt === null
                ? "permanent"
                : row.expiresAt.getTime() > now
                    ? `expires <t:${Math.floor(row.expiresAt.getTime() / 1000)}:R>`
                    : `expired <t:${Math.floor(row.expiresAt.getTime() / 1000)}:R>`;

            return `${name} — ${expiry}${row.reason ? ` · *${row.reason}*` : ""}`;
        }).join("\n").slice(0, 4096)
    );

    await interaction.editReply({ embeds: [embed] });
};

/** Who currently holds memberships — the operator's roster. */
export const holders: FeatureSubcommandHandler = async (interaction, _client) => {
    const tierKey = interaction.options.getString("tier");
    const rows = await PremiumRepository.listHolders(tierKey ?? null, 25);

    const embed = new EmbedBuilder()
        .setTitle(tierKey ? `💎 Members holding \`${tierKey}\`` : "💎 Membership holders")
        .setColor(COLORS.info)
        .setFooter({ text: "Live memberships only · role-granted tiers are not listed here" });

    embed.setDescription(
        rows.length
            ? rows.map(row =>
                `<@${row.discordId}> — \`${row.tierKey}\`` +
                (row.expiresAt ? ` · until <t:${Math.floor(row.expiresAt.getTime() / 1000)}:d>` : " · permanent")
            ).join("\n").slice(0, 4096)
            : "Nobody holds a membership right now."
    );

    await interaction.editReply({ embeds: [embed] });
};
