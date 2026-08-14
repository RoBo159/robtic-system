import {
    ContextMenuCommandBuilder,
    ApplicationCommandType,
    UserContextMenuCommandInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    LabelBuilder,
    FileUploadBuilder,
    MessageFlags,
    type GuildMember,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { needsProof } from "../../utils/moderation/punish-flow";

export default {
    category: "Moderation",
    data: new ContextMenuCommandBuilder()
        .setName("Warn User")
        .setType(ApplicationCommandType.User),

    requiredPermission: 20,

    async run(interaction: UserContextMenuCommandInteraction, client: BotClient) {
        if (interaction.user.id === interaction.targetId) {
            await interaction.reply({ content: "You cannot warn yourself.", flags: MessageFlags.Ephemeral });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId(`punish_modal_warn_${interaction.targetId}`)
            .setTitle(`Warn ${interaction.targetUser.username}`);

        const requireProof = await needsProof(interaction.member as GuildMember);

        if (requireProof) {
            const reasonLabel = new LabelBuilder()
                .setLabel("Reason for Warning")
                .setDescription("Enter the reason or reason key")
                .setTextInputComponent(
                    new TextInputBuilder().setCustomId("reason").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)
                );

            const proofLabel = new LabelBuilder()
                .setLabel("Proof image")
                .setDescription("Attach a screenshot/image showing the reason for this action")
                .setFileUploadComponent(
                    new FileUploadBuilder().setCustomId("proof").setMinValues(1).setMaxValues(1).setRequired(true)
                );

            modal.addLabelComponents(reasonLabel, proofLabel);
        } else {
            const reasonInput = new TextInputBuilder()
                .setCustomId("reason")
                .setLabel("Reason for Warning")
                .setPlaceholder("Enter the reason or reason key...")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(500);

            const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
            modal.addComponents(actionRow);
        }

        await interaction.showModal(modal);
    }
};
