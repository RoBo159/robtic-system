import type { FeatureSubcommandHandler } from "@typings/feature";
import { StreakSettingsRepository } from "@database/repositories";

/**
 * Sets where streak milestones are announced. Omitting the channel clears it, which puts the
 * announcement back in whichever channel earned the streak.
 */
export const channelAnnounce: FeatureSubcommandHandler = async (interaction, _client) => {
    const channel = interaction.options.getChannel("channel");
    await StreakSettingsRepository.setAnnounceChannel(interaction.guildId!, channel?.id ?? null);

    await interaction.editReply({
        content: channel
            ? `سيتم إعلان التتابعات في <#${channel.id}>.`
            : "تم إلغاء قناة الإعلان — سيتم الرد في نفس القناة التي تم فيها التتابع.",
    });
};
