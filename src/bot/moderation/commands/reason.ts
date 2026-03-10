import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    AutocompleteInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    EmbedBuilder,
    MessageFlags,
} from "discord.js";
import type { BotClient } from "@core/BotClient";
import { Colors } from "@core/config";
import { ReasonRepository } from "@database/repositories";
import { errorEmbed } from "@core/utils";

export default {
    data: new SlashCommandBuilder()
        .setName("reason")
        .setDescription("Manage punishment reasons")
        .addSubcommand(sub =>
            sub.setName("create")
                .setDescription("Create a new punishment reason")
                .addStringOption(opt =>
                    opt.setName("type")
                        .setDescription("Punishment type")
                        .setRequired(true)
                        .addChoices(
                            { name: "Warning", value: "warn" },
                            { name: "Mute", value: "mute" },
                            { name: "Ban", value: "ban" },
                        )
                )
        )
        .addSubcommand(sub =>
            sub.setName("remove")
                .setDescription("Remove a punishment reason")
                .addStringOption(opt =>
                    opt.setName("key")
                        .setDescription("The reason key to remove")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName("list")
                .setDescription("List all punishment reasons")
        ),

    requiredPermission: 80,
    department: "Moderation" as Department,

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        const sub = interaction.options.getSubcommand();

        if (sub === "create") {
            const type = interaction.options.getString("type", true);

            const modal = new ModalBuilder()
                .setCustomId(`reason_create_${type}`)
                .setTitle("Create Punishment Reason");

            const keyInput = new TextInputBuilder()
                .setCustomId("reason_key")
                .setLabel("Reason Key (unique identifier)")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("e.g. spam, toxicity, nsfw")
                .setRequired(true)
                .setMaxLength(50);

            const labelInput = new TextInputBuilder()
                .setCustomId("reason_label")
                .setLabel("Reason Label (English)")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("e.g. Spamming in channels")
                .setRequired(true)
                .setMaxLength(200);

            const labelArInput = new TextInputBuilder()
                .setCustomId("reason_label_ar")
                .setLabel("Reason Label (Arabic)")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("e.g. إرسال رسائل مزعجة في القنوات")
                .setRequired(true)
                .setMaxLength(200);

            modal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(keyInput),
                new ActionRowBuilder<TextInputBuilder>().addComponents(labelInput),
                new ActionRowBuilder<TextInputBuilder>().addComponents(labelArInput),
            );

            await interaction.showModal(modal);
            return;
        }

        if (sub === "remove") {
            const key = interaction.options.getString("key", true).toLowerCase();

            const deleted = await ReasonRepository.delete(key);
            if (!deleted) {
                await interaction.reply({ embeds: [errorEmbed(`Reason \`${key}\` not found.`)], flags: MessageFlags.Ephemeral });
                return;
            }

            const embed = new EmbedBuilder()
                .setTitle("✅ Reason Removed")
                .setDescription(`Punishment reason \`${key}\` has been deleted.`)
                .setColor(Colors.success)
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        if (sub === "list") {
            const reasons = await ReasonRepository.getAll();

            if (!reasons.length) {
                await interaction.reply({ embeds: [new EmbedBuilder().setDescription("No punishment reasons created yet.").setColor(Colors.info)], flags: MessageFlags.Ephemeral });
                return;
            }

            const grouped: Record<string, string[]> = { warn: [], mute: [], ban: [] };
            for (const r of reasons) {
                grouped[r.type]?.push(`\`${r.key}\` — ${r.label} / ${r.labelAr}`);
            }

            const fields = [];
            if (grouped.warn.length) fields.push({ name: "⚠️ Warnings", value: grouped.warn.join("\n") });
            if (grouped.mute.length) fields.push({ name: "🔇 Mutes", value: grouped.mute.join("\n") });
            if (grouped.ban.length) fields.push({ name: "🔨 Bans", value: grouped.ban.join("\n") });

            const embed = new EmbedBuilder()
                .setTitle("📋 Punishment Reasons")
                .addFields(fields)
                .setColor(Colors.info)
                .setFooter({ text: `Total: ${reasons.length} reason(s)` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        }
    },

    async autocomplete(interaction: AutocompleteInteraction, client: BotClient) {
        const focused = interaction.options.getFocused().toLowerCase();
        const keys = await ReasonRepository.getAllKeys();
        const filtered = keys
            .filter(k => k.includes(focused))
            .slice(0, 25);

        await interaction.respond(
            filtered.map(k => ({ name: k, value: k }))
        );
    },
};
