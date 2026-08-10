import {
    SlashCommandBuilder,
    type ChatInputCommandInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
} from "discord.js";
import type { BotClient } from "@core/bot-client";

const ROLE_LABELS: Record<string, string> = {
    en: "English Role",
    ar: "Arabic Role",
    members: "Members Role",
    bots: "Bots Role",
};

export default {
    category: "Configuration",
    data: new SlashCommandBuilder()
        .setName("set-role")
        .setDescription("Configure a role for this server")
        .addStringOption(opt =>
            opt.setName("type")
                .setDescription("The role type to configure")
                .setRequired(true)
                .addChoices(
                    { name: "English Role", value: "en" },
                    { name: "Arabic Role", value: "ar" },
                    { name: "Members Role", value: "members" },
                    { name: "Bots Role", value: "bots" },
                )
        ),

    requiredPermission: 100,
    department: "Management" as Department,
    modalOnly: true,

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        const type = interaction.options.getString("type", true);
        const label = ROLE_LABELS[type] ?? type;

        const modal = new ModalBuilder()
            .setCustomId(`set_role_modal_${type}`)
            .setTitle(`Set ${label}`);

        modal.addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId("role_id")
                    .setLabel("Role ID")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder("Enter the role ID (numbers only)")
                    .setMinLength(17)
                    .setMaxLength(20)
            ),
        );

        await interaction.showModal(modal);
    },
};
