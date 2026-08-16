import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
import { PremiumRepository } from "@database/repositories";

/**
 * Maps one of this server's Discord roles onto a global tier.
 *
 * This is the *only* premium thing a server configures. What Prime is worth is decided once for the
 * whole bot; a guild is answering "in here, this role means Prime". A server that maps nothing has
 * no role-granted premium — and members who own a global membership still get theirs.
 */
export const roleAdd: FeatureSubcommandHandler = async (interaction, _client) => {
    const guildId = interaction.guildId!;
    const tierKey = interaction.options.getString("tier", true);
    const role = interaction.options.getRole("role", true);

    const tier = await PremiumRepository.findTier(tierKey);
    if (!tier) {
        const tiers = await PremiumRepository.listTiers();
        await interaction.editReply({
            content: tiers.length
                ? `No tier called **${tierKey}**. Available: ${tiers.map(t => `\`${t.key}\``).join(", ")}.`
                : "No premium tiers exist yet — the bot operator has to create them first.",
        });
        return;
    }

    const existing = await PremiumRepository.findRoleMap(guildId, role.id);
    await PremiumRepository.mapRole({ guildId, roleId: role.id, tierKey: tier.key, addedBy: interaction.user.id });

    await interaction.editReply({
        content: existing && existing.tierKey !== tier.key
            ? `<@&${role.id}> now grants ${tier.emoji} **${tier.name}** — it used to grant \`${existing.tierKey}\`.`
            : `<@&${role.id}> now grants ${tier.emoji} **${tier.name}** in this server.`,
    });
};

export const roleRemove: FeatureSubcommandHandler = async (interaction, _client) => {
    const role = interaction.options.getRole("role", true);
    const removed = await PremiumRepository.unmapRole(interaction.guildId!, role.id);

    await interaction.editReply({
        content: removed
            ? `<@&${role.id}> no longer grants a premium tier here. Global memberships are unaffected.`
            : `<@&${role.id}> was not mapped to anything.`,
    });
};

export const roleList: FeatureSubcommandHandler = async (interaction, _client) => {
    const [rows, tiers] = await Promise.all([
        PremiumRepository.listRoleMaps(interaction.guildId!),
        PremiumRepository.listTiers(),
    ]);

    const byKey = new Map(tiers.map(tier => [tier.key, tier]));

    const embed = new EmbedBuilder()
        .setTitle("💎 Premium roles in this server")
        .setColor(rows.length ? COLORS.info : COLORS.warning)
        .setFooter({ text: "Tiers and their perks are the same in every server — only these mappings are local." });

    if (rows.length === 0) {
        embed.setDescription(
            tiers.length === 0
                ? "No premium tiers exist yet."
                : "No roles are mapped here. `/premium-config role add` connects one of your roles to a tier.\n" +
                  `Tiers: ${tiers.map(t => `${t.emoji} ${t.name} (\`${t.key}\`)`).join(" · ")}`
        );
        await interaction.editReply({ embeds: [embed] });
        return;
    }

    // Grouped by tier rather than listed per role: an admin checking this wants to see the ladder,
    // not an alphabetical list of roles.
    const grouped = new Map<string, string[]>();
    for (const row of rows) {
        const bucket = grouped.get(row.tierKey) ?? [];
        bucket.push(`<@&${row.roleId}>`);
        grouped.set(row.tierKey, bucket);
    }

    embed.setDescription(
        [...grouped]
            .sort((a, b) => (byKey.get(b[0])?.rank ?? 0) - (byKey.get(a[0])?.rank ?? 0))
            .map(([tierKey, roles]) => {
                const tier = byKey.get(tierKey);
                const name = tier ? `${tier.emoji} **${tier.name}**` : `⚠️ \`${tierKey}\` *(no longer exists)*`;
                return `${name}\n${roles.join(" ")}`;
            })
            .join("\n\n")
            .slice(0, 4096)
    );

    await interaction.editReply({ embeds: [embed] });
};
