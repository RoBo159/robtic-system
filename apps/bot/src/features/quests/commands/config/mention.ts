import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS, QUEST_TIERS, type QuestTier } from "@constants";
import { mentionRoleFor } from "@database/models";
import { QuestSettingsRepository } from "@database/repositories";
import { tierTitle } from "../../utils/quest-lines";

/** Tier order, with the community challenge last — it is not a tier, but it does get pinged. */
const PINGABLE = [...QUEST_TIERS, "community"] as const;

const label = (type: typeof PINGABLE[number]): string =>
    type === "community" ? "🌍 Community" : tierTitle(type as QuestTier);

/** Sets — or with no role, clears — the role pinged when one kind of quest is posted. */
export const mentionSet: FeatureSubcommandHandler = async (interaction, _client) => {
    const type = interaction.options.getString("type", true) as typeof PINGABLE[number];
    const role = interaction.options.getRole("role");

    await QuestSettingsRepository.setMentionRole(interaction.guildId!, type, role?.id ?? null);

    await interaction.editReply({
        content: role
            ? `${label(type)} quests will ping <@&${role.id}>.`
            : `${label(type)} quests will no longer ping anyone.`,
    });
};

export const mentionList: FeatureSubcommandHandler = async (interaction, _client) => {
    const settings = await QuestSettingsRepository.getCached(interaction.guildId!);

    const lines = PINGABLE.map(type => {
        const roleId = mentionRoleFor(settings, type);
        return `${label(type)} — ${roleId ? `<@&${roleId}>` : "*no ping*"}`;
    });

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle("Quest mention roles")
            .setColor(COLORS.info)
            .setDescription(lines.join("\n"))],
    });
};
