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
        .setName("Jail User")
        .setType(ApplicationCommandType.User),

    requiredPermission: 20,
    department: "Moderation" as Department,

    async run(interaction: UserContextMenuCommandInteraction, client: BotClient) {
        if (interaction.user.id === interaction.targetId) {
            await interaction.reply({ content: "You cannot jail yourself.", flags: MessageFlags.Ephemeral });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId(`punish_modal_ban_${interaction.targetId}`)
            .setTitle(`Jail ${interaction.targetUser.username}`);

        const requireProof = await needsProof(interaction.member as GuildMember);

        if (requireProof) {
            // Below Manager+ — fully Label-based rather than mixing with the legacy ActionRow style.
            const reasonLabel = new LabelBuilder()
                .setLabel("Reason for Jail")
                .setDescription("Enter the reason or reason key")
                .setTextInputComponent(
                    new TextInputBuilder().setCustomId("reason").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500)
                );

            const durationLabel = new LabelBuilder()
                .setLabel("Duration ('perm' or days)")
                .setDescription("e.g. perm or 7")
                .setTextInputComponent(
                    new TextInputBuilder().setCustomId("duration").setStyle(TextInputStyle.Short).setRequired(true).setValue("perm")
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
                .setLabel("Reason for Jail")
                .setPlaceholder("Enter the reason or reason key...")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(500);

            const durationInput = new TextInputBuilder()
                .setCustomId("duration")
                .setLabel("Duration ('perm' or days)")
                .setPlaceholder("e.g. perm or 7")
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
                .setValue("perm");

            const act1 = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
            const act2 = new ActionRowBuilder<TextInputBuilder>().addComponents(durationInput);

            modal.addComponents(act1, act2);
        }

        await interaction.showModal(modal);
    }
};
