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
        .setName("Mute User")
        .setType(ApplicationCommandType.User),

    requiredPermission: 20,

    async run(interaction: UserContextMenuCommandInteraction, client: BotClient) {
        if (interaction.user.id === interaction.targetId) {
            await interaction.reply({ content: "You cannot mute yourself.", flags: MessageFlags.Ephemeral });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId(`punish_modal_mute_${interaction.targetId}`)
            .setTitle(`Mute ${interaction.targetUser.username}`);

        const requireProof = await needsProof(interaction.member as GuildMember);

        if (requireProof) {
            const reasonLabel = new LabelBuilder()
                .setLabel("Reason for Mute")
                .setDescription("Enter the reason or reason key")
                .setTextInputComponent(
                    new TextInputBuilder().setCustomId("reason").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)
                );

            const durationLabel = new LabelBuilder()
                .setLabel("Duration (in hours)")
                .setDescription("e.g. 24")
                .setTextInputComponent(
                    new TextInputBuilder().setCustomId("duration").setStyle(TextInputStyle.Short).setRequired(false).setValue("24")
                );

            const proofLabel = new LabelBuilder()
                .setLabel("Proof image")
                .setDescription("Attach a screenshot/image showing the reason for this action")
                .setFileUploadComponent(
                    new FileUploadBuilder().setCustomId("proof").setMinValues(1).setMaxValues(1).setRequired(true)
                );

            modal.addLabelComponents(reasonLabel, durationLabel, proofLabel);
        } else {
            const reasonInput = new TextInputBuilder()
                .setCustomId("reason")
                .setLabel("Reason for Mute")
                .setPlaceholder("Enter the reason or reason key...")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(500);

            const durationInput = new TextInputBuilder()
                .setCustomId("duration")
                .setLabel("Duration (in hours)")
                .setPlaceholder("e.g. 24")
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
                .setValue("24");

            const act1 = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
            const act2 = new ActionRowBuilder<TextInputBuilder>().addComponents(durationInput);

            modal.addComponents(act1, act2);
        }

        await interaction.showModal(modal);
    }
};
