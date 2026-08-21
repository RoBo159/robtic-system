import { EmbedBuilder } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS } from "@constants";
import { ReplyRepository } from "@database/repositories";

const MAX_SHOWN = 40;
const trim = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/**
 * Every reply in the server: its id, its trigger, the text, and who added it.
 *
 * It used to list bare trigger names, which answered none of the questions anyone actually has —
 * what does this trigger say, which of its replies is the one I want gone, and who put it there.
 * The id is the whole point: it is what `/reply remove` takes.
 */
export const list: FeatureSubcommandHandler = async (interaction, _client) => {
    const filter = interaction.options.getString("msg")?.trim().toLowerCase();
    const all = await ReplyRepository.listAll(interaction.guildId!);

    const rows = filter ? all.filter(row => row.trigger.toLowerCase() === filter) : all;

    if (rows.length === 0) {
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle("Auto-replies")
                .setColor(COLORS.info)
                .setDescription(filter
                    ? `Nothing configured for **${filter}**.`
                    : "No replies configured yet. `/reply add` creates one.")],
        });
        return;
    }

    const grouped = new Map<string, typeof rows>();
    for (const row of rows) grouped.set(row.trigger, [...(grouped.get(row.trigger) ?? []), row]);

    const embed = new EmbedBuilder()
        .setTitle("Auto-replies")
        .setColor(COLORS.info)
        .setFooter({ text: `${rows.length} repl${rows.length === 1 ? "y" : "ies"} · remove one with /reply remove <id>` });

    let shown = 0;

    for (const [trigger, entries] of grouped) {
        if (shown >= MAX_SHOWN || embed.data.fields?.length === 25) break;

        const lines = entries.slice(0, MAX_SHOWN - shown).map(entry => {
            const author = entry.createdBy ? `<@${entry.createdBy}>` : "*unknown*";
            return `\`${entry.id}\` ${trim(entry.text, 120)}\n╰ added by ${author}`;
        });

        shown += lines.length;

        embed.addFields({
            name: `💬 ${trim(trigger, 80)} — ${entries.length} repl${entries.length === 1 ? "y" : "ies"}`,
            value: lines.join("\n").slice(0, 1024),
        });
    }

    if (rows.length > shown) {
        embed.addFields({ name: "​", value: `…and ${rows.length - shown} more — narrow it down with \`/reply list msg:<trigger>\`.` });
    }

    await interaction.editReply({ embeds: [embed] });
};
