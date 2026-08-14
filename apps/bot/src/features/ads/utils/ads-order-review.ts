import { ButtonBuilder, ButtonStyle, ContainerBuilder, type BaseMessageOptions } from "discord.js";
import type { IAdOrder } from "@database/models/AdOrder";
import { formatPrice } from "./pricing";

export function buildOrderReview(order: IAdOrder, rate: number): BaseMessageOptions {
    const lines = order.items.map(i => `• **${i.name}** — ${formatPrice(i.priceUsd, rate)}`).join("\n");

    const container = new ContainerBuilder()
        .setAccentColor(order.status === "approved" ? 0x4caf50 : order.status === "rejected" ? 0xff4c4c : 0xf39c12)
        .addTextDisplayComponents(td => td.setContent("## 🆕 New Ad Order"))
        .addSeparatorComponents(sep => sep)
        .addTextDisplayComponents(td => td.setContent(`**Submitted by:** <@${order.userId}>\n\n${lines}`))
        .addSeparatorComponents(sep => sep)
        .addTextDisplayComponents(td => td.setContent(`**Total:** ${formatPrice(order.totalUsd, rate)}`));

    if (order.status === "pending") {
        container.addActionRowComponents(row =>
            row.setComponents(
                new ButtonBuilder().setCustomId(`ads-order-accept_${order._id}`).setLabel("Accept").setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`ads-order-reject_${order._id}`).setLabel("Reject").setStyle(ButtonStyle.Danger)
            )
        );
    } else {
        const decidedLabel = order.status === "approved" ? "✅ Accepted" : "❌ Rejected";
        container.addTextDisplayComponents(td =>
            td.setContent(`-# ${decidedLabel} by <@${order.decidedBy}>`)
        );
    }

    return { components: [container] };
}
