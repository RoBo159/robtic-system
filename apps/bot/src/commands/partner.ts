import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    PermissionFlagsBits,
} from "discord.js";
import type { BotClient } from "@core/bot-client";

export default {
    category: "Partnership",
    data: new SlashCommandBuilder()
        .setName("partner")
        .setDescription("Manage Robtic partner servers")
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) => sub.setName("add").setDescription("Add a new partner server"))
        .addSubcommand((sub) => sub.setName("remove").setDescription("Remove a partner server"))
        .addSubcommand((sub) =>
            sub.setName("announce").setDescription("Send an announcement DM to every partner representative")
        ),

    requiredPermission: 80,
    modalOnly: true,

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        const sub = interaction.options.getSubcommand();

        if (sub === "add") {
            const modal = new ModalBuilder().setCustomId("partner_add_modal").setTitle("Add Partner");

            modal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("partner_server_id")
                        .setLabel("Partner Server ID")
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(32)
                ),
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("partner_server_name")
                        .setLabel("Partner Server Name")
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(100)
                ),
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("partner_rep_id")
                        .setLabel("Representative User ID")
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(32)
                ),
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("partner_description")
                        .setLabel("Description")
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                        .setMaxLength(500)
                ),
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("partner_invite")
                        .setLabel("Invite Link (optional)")
                        .setStyle(TextInputStyle.Short)
                        .setRequired(false)
                        .setMaxLength(200)
                )
            );

            await interaction.showModal(modal);
            return;
        }

        if (sub === "remove") {
            const modal = new ModalBuilder().setCustomId("partner_remove_modal").setTitle("Remove Partner");

            modal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("partner_server_id")
                        .setLabel("Partner Server ID")
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(32)
                )
            );

            await interaction.showModal(modal);
            return;
        }

        if (sub === "announce") {
            const modal = new ModalBuilder().setCustomId("partner_announce_modal").setTitle("Announce to Partners");

            modal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("announce_title")
                        .setLabel("Title")
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(100)
                ),
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder()
                        .setCustomId("announce_message")
                        .setLabel("Message")
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                        .setMaxLength(2000)
                )
            );

            await interaction.showModal(modal);
            return;
        }
    },
};
