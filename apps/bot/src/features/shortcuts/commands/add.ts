import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS, SHORTCUT_DELETE_MODE_LABELS, isShortcutDeleteMode, SHORTCUT_DELETE_MODES } from "@constants";
import { ShortcutRepository } from "@database/repositories";
import { isReachableTarget } from "../functions/report-orphan-shortcuts";
import { targetLabel } from "../utils/build-shortcut-embed";

export const add: FeatureSubcommandHandler = async (interaction, client) => {
    const command = interaction.options.getString("command", true).trim().replace(/\s+/g, " ");
    const trigger = interaction.options.getString("trigger", true).trim();
    const argsTemplate = interaction.options.getString("args")?.trim() ?? "";
    const deleteMode = interaction.options.getString("delete") ?? "none";

    if (!isReachableTarget(client, command)) {
        await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription(
                `❌ \`${command}\` is not a runnable command.\n` +
                "Pick a suggestion from autocomplete — commands built from subcommands need the whole path, e.g. `warn add`."
            )],
        });
        return;
    }

    // Slash usage can only send a valid choice, but the prefix parser passes through whatever word
    // sits in that position without checking it against the list.
    if (!isShortcutDeleteMode(deleteMode)) {
        await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription(
                `❌ Unknown cleanup mode \`${deleteMode}\` — use one of: ${SHORTCUT_DELETE_MODES.map(m => `\`${m}\``).join(", ")}.`
            )],
        });
        return;
    }

    if (!trigger) {
        await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription("❌ The trigger cannot be empty.")],
        });
        return;
    }

    await ShortcutRepository.upsert(interaction.guildId!, {
        trigger,
        command,
        argsTemplate,
        deleteMode,
        createdBy: interaction.user.id,
    });

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setColor(COLORS.success)
            .setDescription(
                `Typing **${trigger}** now runs \`${targetLabel(command)}\`` +
                (argsTemplate ? ` with \`${argsTemplate}\`` : "") + ".\n" +
                `Afterwards: ${SHORTCUT_DELETE_MODE_LABELS[deleteMode].toLowerCase()}.`
            )],
    });
};
