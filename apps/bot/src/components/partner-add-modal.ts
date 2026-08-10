import { ModalSubmitInteraction, EmbedBuilder, MessageFlags } from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { ComponentHandler } from "@typings/command";
import { COLORS } from "@constants";
import { PartnerRepository } from "@database/repositories";
import { errorEmbed } from "@utils";
import { ensurePartnerRole } from "../utils/partner-role";

const SNOWFLAKE_RE = /^\d{15,25}$/;

const partnerAddModal: ComponentHandler<ModalSubmitInteraction> = {
    customId: "partner_add_modal",

    async run(interaction: ModalSubmitInteraction, client: BotClient) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const partnerServerId = interaction.fields.getTextInputValue("partner_server_id").trim();
        const partnerServerName = interaction.fields.getTextInputValue("partner_server_name").trim();
        const repUserId = interaction.fields.getTextInputValue("partner_rep_id").trim();
        const description = interaction.fields.getTextInputValue("partner_description").trim();
        const inviteLink = interaction.fields.getTextInputValue("partner_invite")?.trim() || undefined;

        if (!SNOWFLAKE_RE.test(partnerServerId) || !SNOWFLAKE_RE.test(repUserId)) {
            await interaction.editReply({
                embeds: [errorEmbed("Server ID and Representative User ID must both be valid Discord IDs.")],
            });
            return;
        }

        const existing = await PartnerRepository.findByServerId(partnerServerId);
        if (existing) {
            await interaction.editReply({
                embeds: [errorEmbed("A partner with this server ID already exists. Remove it first to update.")],
            });
            return;
        }

        await PartnerRepository.create({
            partnerServerId,
            partnerServerName,
            description,
            inviteLink,
            repUserId,
            addedBy: interaction.user.id,
        });

        if (interaction.guild) {
            const member = await interaction.guild.members.fetch(repUserId).catch(() => null);
            if (member) {
                const role = await ensurePartnerRole(interaction.guild);
                await member.roles.add(role).catch(() => null);
            }
        }

        const embed = new EmbedBuilder()
            .setTitle("✅ Partner Added")
            .setColor(COLORS.success)
            .addFields(
                { name: "Server", value: partnerServerName, inline: true },
                { name: "Server ID", value: partnerServerId, inline: true },
                { name: "Representative", value: `<@${repUserId}>`, inline: true },
                { name: "Description", value: description }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    },
};

export default partnerAddModal;
