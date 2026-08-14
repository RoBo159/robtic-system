import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS, REJOIN_ROLES_LIMITS } from "@constants";
import { RejoinRolesConfigRepository } from "@database/repositories";
import { buildConfigEmbed } from "../utils/build-config-embed";

/**
 * Both windows are set together, because they are only meaningful relative to each other. The
 * repository rejects a staff window that is not shorter; this catches it first so the caller gets
 * an explanation rather than a thrown error.
 */
export const timers: FeatureSubcommandHandler = async (interaction, _client) => {
    const memberHours = interaction.options.getInteger("member-hours", true);
    const staffHours = interaction.options.getInteger("staff-hours", true);

    if (staffHours >= memberHours) {
        await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription(
                `❌ The staff window (**${staffHours}h**) must be shorter than the member window (**${memberHours}h**).\n` +
                "Staff roles hand back powers, so they should expire first."
            )],
        });
        return;
    }

    const { minHours, maxHours } = REJOIN_ROLES_LIMITS;
    if (memberHours < minHours || memberHours > maxHours || staffHours < minHours) {
        await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription(
                `❌ Windows must be between **${minHours}** and **${maxHours}** hours.`
            )],
        });
        return;
    }

    const config = await RejoinRolesConfigRepository.setWindows(interaction.guildId!, memberHours, staffHours);
    await interaction.editReply({ embeds: [buildConfigEmbed(config)] });
};
