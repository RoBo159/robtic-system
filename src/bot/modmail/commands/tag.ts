import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    MessageFlags,
    AutocompleteInteraction,
    EmbedBuilder,
} from "discord.js";
import { TagRepository } from "@database/repositories/TagRepository";
import type { BotClient } from "@core/BotClient";
import { Colors } from "@core/config";
import { TAG_VARIABLES_LIST } from "../utils/tagVariables";
import messages from "../utils/messages.json";

export default {
    data: new SlashCommandBuilder()
        .setName("tag")
        .setDescription("Manage reusable tags")
        .addSubcommand(sub =>
            sub
                .setName("create")
                .setDescription("Create a new tag")
        )
        .addSubcommand(sub =>
            sub
                .setName("delete")
                .setDescription("Delete an existing tag")
                .addStringOption(opt =>
                    opt
                        .setName("key")
                        .setDescription("Tag key to delete")
                        .setRequired(true)
                        .setAutocomplete(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName("help").setDescription("Show tag usage and available variables")
        ),

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        const sub = interaction.options.getSubcommand();

        if (sub === "help") {
            const allTags = await TagRepository.getAll();
            const tagList = allTags.length
                ? allTags.map(t => `\`${t.key}\` — ${t.description}`).join("\n")
                : "No tags created yet.";

            const embed = new EmbedBuilder()
                .setTitle(messages.embed.tag_help_title)
                .setColor(Colors.info)
                .addFields(
                    { name: "Usage", value: "`!tag` — List all tags\n`!tag <key>` — Send a tag to the user\n`/tag create` — Create a new tag\n`/tag delete` — Delete a tag" },
                    { name: "Available Tags", value: tagList },
                    { name: "Template Variables", value: TAG_VARIABLES_LIST },
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        if (sub === "create") {
            const modal = new ModalBuilder()
                .setCustomId("tag_create")
                .setTitle("Create Tag");

            const keyInput = new TextInputBuilder()
                .setCustomId("tag_key")
                .setLabel("Tag Key")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("e.g. rules, welcome, faq")
                .setRequired(true)
                .setMaxLength(50);

            const descInput = new TextInputBuilder()
                .setCustomId("tag_description")
                .setLabel("Tag Description")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("Short description of what this tag is for")
                .setRequired(true)
                .setMaxLength(100);

            const contentInputEn = new TextInputBuilder()
                .setCustomId("tag_content")
                .setLabel("Tag Message")
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder("{user} {username} {staff} {server} {date} {nl}")
                .setRequired(true)
                .setMaxLength(2000);

            const contentInputAr = new TextInputBuilder()
                .setCustomId("tag_content_ar")
                .setLabel("Tag Message (Arabic)")
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder("{user} {username} {staff} {server} {date} {nl}")
                .setRequired(true)
                .setMaxLength(2000);

            modal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(keyInput),
                new ActionRowBuilder<TextInputBuilder>().addComponents(descInput),
                new ActionRowBuilder<TextInputBuilder>().addComponents(contentInputEn),
                new ActionRowBuilder<TextInputBuilder>().addComponents(contentInputAr),
            );

            await interaction.showModal(modal);
        }

        if (sub === "delete") {
            const key = interaction.options.getString("key", true).toLowerCase();

            const deleted = await TagRepository.delete(key);
            if (!deleted) {
                await interaction.reply({
                    content: messages.errors.tag_not_found.replace("{key}", key),
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            await interaction.reply({
                content: messages.success.tag_deleted.replace("{key}", key),
                flags: MessageFlags.Ephemeral,
            });
        }
    },

    async autocomplete(interaction: AutocompleteInteraction, client: BotClient) {
        const focused = interaction.options.getFocused().toLowerCase();
        const keys = await TagRepository.getAllKeys();
        const filtered = keys
            .filter(k => k.includes(focused))
            .slice(0, 25);

        await interaction.respond(
            filtered.map(k => ({ name: k, value: k }))
        );
    },
};
