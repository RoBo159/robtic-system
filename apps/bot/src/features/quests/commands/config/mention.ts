import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS, QUEST_CONFIG_MESSAGES, QUEST_TIERS, type QuestTier } from "@constants";
import { mentionRoleFor } from "@database/models";
import { QuestSettingsRepository } from "@database/repositories";
import { tierTitle } from "../../utils/quest-lines";

const TEXT = QUEST_CONFIG_MESSAGES.mention;

/** Tier order, with the community challenge last — it is not a tier, but it does get pinged. */
const PINGABLE = [...QUEST_TIERS, "community"] as const;

const label = (type: typeof PINGABLE[number]): string =>
    type === "community" ? TEXT.communityLabel : tierTitle(type as QuestTier);

/** Sets — or with no role, clears — the role pinged when one kind of quest is posted. */
export const mentionSet: FeatureSubcommandHandler = async (interaction, _client) => {
    const type = interaction.options.getString("type", true) as typeof PINGABLE[number];
    const role = interaction.options.getRole("role");

    await QuestSettingsRepository.setMentionRole(interaction.guildId!, type, role?.id ?? null);

    await interaction.editReply({
        content: role ? TEXT.set(label(type), role.id) : TEXT.cleared(label(type)),
    });
};

export const mentionList: FeatureSubcommandHandler = async (interaction, _client) => {
    const settings = await QuestSettingsRepository.getCached(interaction.guildId!);

    const lines = PINGABLE.map(type => TEXT.listRow(label(type), mentionRoleFor(settings, type)));

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle(TEXT.listTitle)
            .setColor(COLORS.info)
            .setDescription(lines.join("\n"))],
    });
};
