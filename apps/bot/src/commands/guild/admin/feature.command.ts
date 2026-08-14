import {
    SlashCommandBuilder,
    EmbedBuilder,
    MessageFlags,
    type AutocompleteInteraction,
    type ChatInputCommandInteraction,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { CommandConfig } from "@typings/command";
import { COLORS } from "@constants";
import { listFeatureManifests, getFeatureManifest, isFeatureEnabled } from "@core/features";
import { GuildFeatureRepository } from "@database/repositories";

async function setEnabled(interaction: ChatInputCommandInteraction, enabled: boolean): Promise<void> {
    const key = interaction.options.getString("feature", true).trim().toLowerCase();
    const manifest = getFeatureManifest(key);

    if (!manifest) {
        await interaction.editReply({
            embeds: [new EmbedBuilder().setColor(COLORS.error).setDescription(
                `❌ No feature called \`${key}\`. Run \`/feature list\` to see them.`
            )],
        });
        return;
    }

    await GuildFeatureRepository.set(interaction.guildId!, key, enabled, interaction.user.id);

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setColor(COLORS.success)
            .setDescription(`**${manifest.description}** is now **${enabled ? "enabled" : "disabled"}** in this server.`)],
    });
}

export default {
    category: "Configuration",
    scope: "guild",
    access: "admin",
    data: new SlashCommandBuilder()
        .setName("feature")
        .setDescription("Turn bot features on or off in this server")
        .addSubcommand(sub =>
            sub.setName("enable")
                .setDescription("Turn a feature on")
                .addStringOption(opt => opt.setName("feature").setDescription("Feature key").setRequired(true).setAutocomplete(true))
        )
        .addSubcommand(sub =>
            sub.setName("disable")
                .setDescription("Turn a feature off")
                .addStringOption(opt => opt.setName("feature").setDescription("Feature key").setRequired(true).setAutocomplete(true))
        )
        .addSubcommand(sub => sub.setName("list").setDescription("Show every feature and whether it is on here")),

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        if (!interaction.guildId) return;
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const sub = interaction.options.getSubcommand();
        if (sub === "enable") return setEnabled(interaction, true);
        if (sub === "disable") return setEnabled(interaction, false);

        const manifests = listFeatureManifests();

        if (!manifests.length) {
            await interaction.editReply({
                embeds: [new EmbedBuilder().setColor(COLORS.info).setDescription("No features are installed.")],
            });
            return;
        }

        const lines = await Promise.all(manifests.map(async manifest => {
            const on = await isFeatureEnabled(interaction.guildId!, manifest.key);
            const source = manifest.activation === "default-on" ? "on by default" : "opt-in";
            return `${on ? "🟢" : "⚪"} \`${manifest.key}\` — ${manifest.description} *(${source})*`;
        }));

        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setColor(COLORS.info)
                .setTitle("Features")
                .setDescription(lines.join("\n"))],
        });
    },

    async autocomplete(interaction: AutocompleteInteraction) {
        const focused = interaction.options.getFocused(true);
        if (focused.name !== "feature") return;

        const matches = listFeatureManifests()
            .filter(manifest => manifest.key.includes(focused.value.toLowerCase()))
            .slice(0, 25);

        await interaction.respond(matches.map(manifest => ({ name: `${manifest.key} — ${manifest.description}`, value: manifest.key })));
    },
} satisfies CommandConfig;
