import {
    ChannelType,
    ContainerBuilder,
    MessageFlags,
    PermissionFlagsBits,
    SeparatorBuilder,
    TextDisplayBuilder,
    type ModalSubmitInteraction,
    type TextChannel,
} from "discord.js";
import type { ComponentHandler } from "@typings/command";
import { TicketRepository } from "@database/repositories";
import { Logger } from "@logger";
import { ticketCard } from "../../utils/moderation/ticket-card";
import { findCategory } from "../../utils/moderation/ticket-guard";
import { TICKET_CREATED_COLOR, TICKET_REPORT_CHANNEL_ID, TICKET_MANAGER_EMOJI } from "../../config/moderation/ticket";

function makeTicketId(a: string, b: string): string {
    const input = `${a}|${b}`;
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(36).padStart(16, "0").slice(0, 16);
}

export const ticketOpenModalHandler: ComponentHandler<ModalSubmitInteraction> = {
    customId: /^ticket_open_modal_/,

    async run(interaction: ModalSubmitInteraction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const categoryId = interaction.customId.replace("ticket_open_modal_", "");
        const category = findCategory(categoryId);
        if (!category) {
            await interaction.editReply({ content: "This category is no longer available." });
            return;
        }

        const subject = interaction.fields.getTextInputValue("ticket_subject");
        const guild = interaction.guild!;

        const existing = await TicketRepository.findOpenByUser(interaction.user.id, guild.id);
        if (existing.length > 0) {
            await interaction.editReply({ content: `You already have an open ticket: <#${existing[0].channelId}>` });
            return;
        }

        async function createChannel(name: string) {
            return guild.channels.create({
                name: `ticket-${name}`.toLowerCase(),
                type: ChannelType.GuildText,
                parent: category!.parentId,
                permissionOverwrites: [
                    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                    {
                        id: interaction.user.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                    },
                    {
                        id: category!.supportRoleId,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
                    },
                ],
            });
        }

        let channel: TextChannel;
        try {
            channel = await createChannel(interaction.user.username);
        } catch {
            try {
                channel = await createChannel("unnamed");
            } catch {
                Logger.error("There was an issue when creating a ticket channel!", "moderation:ticket");
                await interaction.editReply({ content: "Something went wrong while creating your ticket channel. Please try again." });
                return;
            }
        }

        const ticketId = makeTicketId(guild.id, channel.id);

        try {
            await TicketRepository.create({
                ticketId,
                guildId: guild.id,
                channelId: channel.id,
                userId: interaction.user.id,
                category: categoryId,
                subject,
                status: "open",
                priority: "medium",
                messages: [],
                assignedTo: null,
                closedBy: null,
                closedAt: null,
                transcript: null,
                openLock: true,
            });
        } catch (err) {
            if ((err as { code?: number }).code === 11000) {
                await channel.delete().catch(() => null);
                const stillOpen = await TicketRepository.findOpenByUser(interaction.user.id, guild.id);
                await interaction.editReply({
                    content: stillOpen.length
                        ? `You already have an open ticket: <#${stillOpen[0].channelId}>`
                        : "You already have an open ticket.",
                });
                return;
            }
            throw err;
        }

        const cardString = ticketCard(interaction.user.id, categoryId, subject);

        await channel.send({
            components: [
                new ContainerBuilder()
                    .setAccentColor(TICKET_CREATED_COLOR)
                    .addTextDisplayComponents(new TextDisplayBuilder().setContent(cardString))
                    .addSeparatorComponents(new SeparatorBuilder())
                    .addTextDisplayComponents(
                        new TextDisplayBuilder().setContent(
                            "Staff can use `/claim`, `/rename`, `/add`, `/remove`, `/escalate`, and `/close` in this channel."
                        )
                    ),
            ],
            flags: MessageFlags.IsComponentsV2,
        });

        await interaction.editReply({
            content: `## Ticket channel was created! → <#${channel.id}>\n### ${TICKET_MANAGER_EMOJI} Staff will be available ASAP!`,
        });

        try {
            const reportChannel = await guild.channels.fetch(TICKET_REPORT_CHANNEL_ID);
            if (reportChannel?.isTextBased()) {
                await reportChannel.send({
                    components: [
                        new ContainerBuilder()
                            .setAccentColor(TICKET_CREATED_COLOR)
                            .addTextDisplayComponents(
                                new TextDisplayBuilder().setContent(`### <@&${category.supportRoleId}> - New support request`)
                            )
                            .addSeparatorComponents(new SeparatorBuilder())
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent(cardString))
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`Channel : <#${channel.id}>`)),
                    ],
                    flags: [MessageFlags.IsComponentsV2],
                });
            }
        } catch (error) {
            Logger.error(`Failed to send support report message: ${error}`, "moderation:ticket");
        }
    },
};
