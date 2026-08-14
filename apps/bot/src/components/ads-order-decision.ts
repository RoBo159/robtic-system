import {
    ButtonInteraction,
    MessageFlags,
    PermissionFlagsBits,
    type GuildMember,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import { AdOrderRepository, AdsConfigRepository, TicketRepository } from "@database/repositories";
import { isGuildOperator } from "@bot/utils/access";
import { Logger } from "@logger";
import { buildOrderReview } from "../utils/ads-order-review";
import { buildAdsTicketCard, createAdsTicketChannel } from "../utils/ads-ticket";

export default {
    customId: /^ads-order-(accept|reject)_/,

    async run(interaction: ButtonInteraction, client: BotClient) {
        const [, action, orderId] = interaction.customId.match(/^ads-order-(accept|reject)_(.+)$/) ?? [];

        const guildId = interaction.guildId!;

        await interaction.deferUpdate();

        const config = await AdsConfigRepository.get(guildId);
        const member = interaction.member as GuildMember;
        const isManager = Boolean(config.managerRoleId && member.roles.cache.has(config.managerRoleId));

        if (!member.permissions.has(PermissionFlagsBits.ManageGuild) && !isGuildOperator(member) && !isManager) {
            await interaction.followUp({ content: "❌ You don't have permission to decide on ad orders.", flags: MessageFlags.Ephemeral });
            return;
        }

        const order = await AdOrderRepository.get(guildId, orderId);
        if (!order) {
            await interaction.followUp({ content: "❌ This order no longer exists.", flags: MessageFlags.Ephemeral });
            return;
        }

        if (order.status !== "pending") {
            await interaction.followUp({ content: `⚠️ This order was already ${order.status}.`, flags: MessageFlags.Ephemeral });
            return;
        }

        const status = action === "accept" ? "approved" : "rejected";
        const decided = await AdOrderRepository.decide(orderId, status, interaction.user.id);

        let ticketChannelId: string | undefined;
        if (status === "approved") {
            try {
                const channel = await createAdsTicketChannel(interaction.guild!, decided!, config, interaction.user.id);
                await TicketRepository.create({
                    ticketId: orderId,
                    guildId,
                    channelId: channel.id,
                    userId: order.userId,
                    category: "ads-order",
                    subject: `Ad Order #${orderId}`,
                    status: "open",
                    priority: "medium",
                    messages: [],
                    assignedTo: null,
                    closedBy: null,
                    closedAt: null,
                    transcript: null,
                });
                await channel.send({
                    ...buildAdsTicketCard(decided!, config.exchangeRate, orderId),
                    flags: MessageFlags.IsComponentsV2,
                });
                ticketChannelId = channel.id;
            } catch (err) {
                Logger.error(`Failed to open ads ticket channel: ${err}`);
            }
        }

        await interaction.editReply({
            ...buildOrderReview(decided!, config.exchangeRate),
            flags: MessageFlags.IsComponentsV2,
        });

        try {
            const user = await client.users.fetch(order.userId);
            if (status === "approved") {
                await user.send(
                    ticketChannelId
                        ? `✅ تم **قبول** طلب إعلانك (الإجمالي $${order.totalUsd})! تم فتح تذكرة خاصة لمتابعة طلبك: <#${ticketChannelId}>`
                        : `✅ تم **قبول** طلب إعلانك (الإجمالي $${order.totalUsd})! سيتواصل معك أحد المسؤولين قريبًا.`
                );
            } else {
                await user.send(`❌ تم **رفض** طلب إعلانك (الإجمالي $${order.totalUsd}).`);
            }
        } catch {
            // User has DMs closed — ignore.
        }

        await interaction.followUp({
            content: `✅ | Order ${status}`,
            flags: MessageFlags.Ephemeral,
        });
    },
};
