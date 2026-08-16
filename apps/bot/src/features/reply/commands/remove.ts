import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
import { ReplyRepository } from "@database/repositories";

const trim = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Removes one reply, named by its id.
 *
 * Removal used to take the *trigger*, which could only ever delete the whole set — a trigger with
 * four replies had no way to lose just the bad one. `/reply delete` still takes the trigger for
 * when the whole thing should go.
 */
export const remove: FeatureSubcommandHandler = async (interaction, _client) => {
    const id = interaction.options.getString("id", true).trim();
    const removed = await ReplyRepository.deleteReplyById(interaction.guildId!, id);

    if (!removed) {
        await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription(
                `No reply with id \`${id}\`. \`/reply list\` shows every id.`
            )],
        });
        return;
    }

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setColor(COLORS.success)
            .setDescription(
                `Removed \`${id}\` from **${trim(removed.trigger, 80)}**:\n> ${trim(removed.entry.text, 200)}` +
                (removed.triggerRemoved
                    ? `\n\nThat was its last reply, so the trigger is gone too.`
                    : "")
            )],
    });
};

/** Deletes a trigger and everything on it. */
export const deleteTrigger: FeatureSubcommandHandler = async (interaction, _client) => {
    const trigger = interaction.options.getString("msg", true).trim();
    const deleted = await ReplyRepository.deleteTrigger(interaction.guildId!, trigger);

    await interaction.editReply({
        content: deleted
            ? `Deleted **${trigger}** and its ${deleted.replies.length} repl${deleted.replies.length === 1 ? "y" : "ies"}.`
            : `No trigger called **${trigger}**.`,
    });
};
