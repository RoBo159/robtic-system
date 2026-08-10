import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    ChannelType,
    MessageFlags,
    ContainerBuilder,
    TextDisplayBuilder,
    SeparatorBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder,
    type TextChannel,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { TICKET_CATEGORIES, TICKET_PANEL_COLOR, TICKET_MANAGER_EMOJI } from "../../config/moderation/ticket";

export function buildTicketPanel(): ContainerBuilder {
    const select = new StringSelectMenuBuilder()
        .setCustomId("ticket_panel_select")
        .setPlaceholder("Choose a ticket category")
        .setOptions(
            TICKET_CATEGORIES.map(c => {
                const option = new StringSelectMenuOptionBuilder()
                    .setLabel(c.label)
                    .setValue(c.id)
                    .setDescription(c.description);
                return c.emoji ? option.setEmoji(c.emoji) : option;
            })
        );

    return new ContainerBuilder()
        .setAccentColor(TICKET_PANEL_COLOR)
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`### ${TICKET_MANAGER_EMOJI} Open a Support Ticket`)
        )
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(
            new TextDisplayBuilder().setContent(
                "Pick a category below and describe your issue — a private channel will be created for you and staff will be with you as soon as possible."
            )
        )
        .addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
}

export default {
    category: "Tickets",
    data: new SlashCommandBuilder()
        .setName("ticket-panel")
        .setDescription("Send the ticket-opening panel to a channel")
        .addChannelOption(opt =>
            opt.setName("channel").setDescription("Channel to send the panel to").addChannelTypes(ChannelType.GuildText).setRequired(true)
        ),

    requiredPermission: 80,

    async run(interaction: ChatInputCommandInteraction, _client: BotClient) {
        const channel = interaction.options.getChannel("channel", true) as TextChannel;

        await channel.send({
            components: [buildTicketPanel()],
            flags: MessageFlags.IsComponentsV2,
        });

        await interaction.reply({ content: `✅ Ticket panel sent to <#${channel.id}>.`, flags: MessageFlags.Ephemeral });
    },
};
