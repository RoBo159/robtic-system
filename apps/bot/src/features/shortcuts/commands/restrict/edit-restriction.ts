import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
import { ShortcutRepository } from "@database/repositories";
import { buildShortcutInfoEmbed } from "../../utils/build-shortcut-embed";

type Field = "allowedRoleIds" | "channelIds";

/**
 * One handler behind all four restriction subcommands — the only differences are which list is
 * edited and in which direction. Each replies with the whole shortcut so the caller sees both
 * restriction lists after the change rather than just the one they touched.
 */
const editRestriction = (field: Field, action: "add" | "remove", option: "role" | "channel"): FeatureSubcommandHandler =>
    async (interaction, _client) => {
        const trigger = interaction.options.getString("trigger", true).trim();
        const target = option === "role"
            ? interaction.options.getRole("role", true)
            : interaction.options.getChannel("channel", true);

        const shortcut = await ShortcutRepository.editRestriction(interaction.guildId!, trigger, field, target.id, action);

        if (!shortcut) {
            await interaction.editReply({
                embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription(`No shortcut called **${trigger}**.`)],
            });
            return;
        }

        await interaction.editReply({ embeds: [buildShortcutInfoEmbed(shortcut)] });
    };

export const roleAdd = editRestriction("allowedRoleIds", "add", "role");
export const roleRemove = editRestriction("allowedRoleIds", "remove", "role");
export const channelAdd = editRestriction("channelIds", "add", "channel");
export const channelRemove = editRestriction("channelIds", "remove", "channel");

export const clearRestrictions: FeatureSubcommandHandler = async (interaction, _client) => {
    const trigger = interaction.options.getString("trigger", true).trim();
    const shortcut = await ShortcutRepository.clearRestrictions(interaction.guildId!, trigger);

    if (!shortcut) {
        await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription(`No shortcut called **${trigger}**.`)],
        });
        return;
    }

    await interaction.editReply({ embeds: [buildShortcutInfoEmbed(shortcut)] });
};
