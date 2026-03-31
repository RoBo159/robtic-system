import {
    ContextMenuCommandBuilder,
    ApplicationCommandType,
    UserContextMenuCommandInteraction,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder,
    MessageFlags
} from "discord.js";
import type { BotClient } from "@core/BotClient";

export default {
    data: new ContextMenuCommandBuilder()
        .setName("Warn User")
        .setType(ApplicationCommandType.User),

    requiredPermission: 20,
    department: "Moderation" as Department,

    async run(interaction: UserContextMenuCommandInteraction, client: BotClient) {
        if (interaction.user.id === interaction.targetId) {
            await interaction.reply({ content: "You cannot warn yourself.", flags: MessageFlags.Ephemeral });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId(`punish_modal_warn_${interaction.targetId}`)
            .setTitle(`Warn ${interaction.targetUser.username}`);

        const reasonInput = new TextInputBuilder()
            .setCustomId("reason")
            .setLabel("Reason for Warning")
            .setPlaceholder("Enter the reason or reason key...")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true)
            .setMaxLength(500);

        const actionRow = new ActionRowBuilder<TextInputBuilder>().addComponents(reasonInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
    }
};
