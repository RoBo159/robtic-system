import {
    ButtonBuilder,
    ButtonStyle,
    ChannelType,
    ContainerBuilder,
    PermissionFlagsBits,
    type BaseMessageOptions,
    type Guild,
    type OverwriteResolvable,
    type TextChannel,
} from "discord.js";
import type { IAdOrder } from "@database/models/AdOrder";
import type { IAdsConfig } from "@database/models/AdsConfig";
import { formatPrice } from "./pricing";

/** Ticket card posted in the private ads channel — order details, claim and close buttons. */
export function buildAdsTicketCard(order: IAdOrder, rate: number, ticketId: string, claimedBy?: string | null): BaseMessageOptions {
    const lines = order.items.map(i => `• **${i.name}** — ${formatPrice(i.priceUsd, rate)}`).join("\n");

    const container = new ContainerBuilder()
        .setAccentColor(0x5865F2)
        .addTextDisplayComponents(td => td.setContent("## 📦 تفاصيل طلب الإعلان"))
        .addSeparatorComponents(sep => sep)
        .addTextDisplayComponents(td => td.setContent(`**العميل:** <@${order.userId}>\n\n${lines}`))
        .addSeparatorComponents(sep => sep)
        .addTextDisplayComponents(td => td.setContent(`**الإجمالي:** ${formatPrice(order.totalUsd, rate)}`));

    if (claimedBy) {
        container.addTextDisplayComponents(td => td.setContent(`-# 🙋 تم الاستلام بواسطة <@${claimedBy}>`));
    }

    const buttons: ButtonBuilder[] = [];
    if (!claimedBy) {
        buttons.push(
            new ButtonBuilder().setCustomId(`ads-ticket-claim_${ticketId}`).setLabel("🙋 استلام").setStyle(ButtonStyle.Success)
        );
    }
    buttons.push(
        new ButtonBuilder().setCustomId(`ads-ticket-close_${ticketId}`).setLabel("🔒 إغلاق التذكرة").setStyle(ButtonStyle.Danger)
    );
    container.addActionRowComponents(row => row.setComponents(buttons));

    return { components: [container] };
}

/** Creates the private channel between the customer and the ads managers for an accepted order. */
export async function createAdsTicketChannel(guild: Guild, order: IAdOrder, config: IAdsConfig, acceptedBy: string): Promise<TextChannel> {
    let username = "customer";
    try {
        const member = await guild.members.fetch(order.userId);
        username = member.user.username;
    } catch {
        // Member left the guild — fall back to the generic name below.
    }

    const overwrites: OverwriteResolvable[] = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        {
            id: order.userId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        },
        {
            id: acceptedBy,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        },
    ];
    if (config.managerRoleId) {
        overwrites.push({
            id: config.managerRoleId,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
        });
    }

    const approvalChannel = config.approvalChannelId ? guild.channels.cache.get(config.approvalChannelId) : undefined;
    const parent = (approvalChannel as TextChannel | undefined)?.parentId ?? undefined;

    const create = (name: string) =>
        guild.channels.create({
            name,
            type: ChannelType.GuildText,
            parent,
            permissionOverwrites: overwrites,
        });

    try {
        return await create(`ads-${username}`.toLowerCase());
    } catch {
        return await create(`ads-order-${Date.now()}`);
    }
}
