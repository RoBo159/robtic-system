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
        .setName("Mute User")
        .setType(ApplicationCommandType.User),

    requiredPermission: 20,
    department: "Moderation" as Department,

    async run(interaction: UserContextMenuCommandInteraction, client: BotClient) {
        if (interaction.user.id === interaction.targetId) {
            await interaction.reply({ content: "You cannot mute yourself.", flags: MessageFlags.Ephemeral });
            return;
        }

        const modal = new ModalBuilder()
            .setCustomId(`punish_modal_mute_${interaction.targetId}`)
            .setTitle(`Mute ${interaction.targetUser.username}`);

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

        await interaction.showModal(modal);
    }
};
