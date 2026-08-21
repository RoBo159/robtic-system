import type { FeatureSubcommandHandler } from "@typings/feature";
import { QUEST_CONFIG_MESSAGES } from "@constants";
import { QuestSettingsRepository } from "@database/repositories";

/**
 * The clock the generation windows are read against.
 *
 * Minutes east of UTC rather than a timezone name: +05:30 and +05:45 exist, and nothing else in the
 * bot models timezones. A fixed offset drifts by an hour across DST for observing servers — the
 * cost of not taking on a full IANA dependency for a feature that only needs "roughly evening".
 */
export const offset: FeatureSubcommandHandler = async (interaction, _client) => {
    const minutes = interaction.options.getInteger("minutes", true);
    await QuestSettingsRepository.setUtcOffset(interaction.guildId!, minutes);

    const localNow = new Date(Date.now() + minutes * 60_000).toISOString().slice(11, 16);

    await interaction.editReply({
        content: QUEST_CONFIG_MESSAGES.offset.saved(QUEST_CONFIG_MESSAGES.utcClock(minutes), localNow),
    });
};
