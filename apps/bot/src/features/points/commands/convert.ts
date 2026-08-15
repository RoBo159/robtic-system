import type { FeatureSubcommandHandler } from "@typings/feature";
import { POINT_MESSAGES } from "@constants";
import { convertPointsToRc } from "@core/points";

export const convert: FeatureSubcommandHandler = async (interaction, _client) => {
    const amount = interaction.options.getInteger("points", true);

    const result = await convertPointsToRc(
        interaction.guildId!,
        interaction.user.id,
        interaction.user.username,
        amount,
    );

    if (!result.ok) {
        const message =
            result.reason === "disabled" ? POINT_MESSAGES.conversionDisabled
            : result.reason === "below-minimum" ? POINT_MESSAGES.belowMinimum(result.detail!)
            : result.reason === "not-a-multiple" ? POINT_MESSAGES.notAMultiple(result.detail!)
            : POINT_MESSAGES.insufficient(result.detail!);

        await interaction.editReply({ content: message });
        return;
    }

    await interaction.editReply({
        content: POINT_MESSAGES.converted(result.pointsSpent!, result.rcGranted!, result.pointsAfter!, result.rcAfter!),
    });
};
