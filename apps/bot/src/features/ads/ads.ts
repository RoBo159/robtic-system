import { ChannelType } from "discord.js";
import { defineFeature } from "@typings/feature";

/**
 * Paid advertisement ordering: a public panel members build a cart in, an approval queue for
 * managers, and a ticket per accepted order.
 *
 * `opt-in` — it posts a storefront and takes orders, which no server should acquire by accident.
 */
export const adsFeature = defineFeature({
    key: "ads",
    description: "Advertisement ordering",
    activation: "opt-in",
    commands: [
        {
            name: "setup-ads",
            description: "Configure the advertisement system",
            scope: "guild",
            access: "admin",
            category: "Configuration",
            subcommands: [
                {
                    name: "channel",
                    description: "Set the channel where ad orders are sent for approval",
                    options: [{ name: "channel", description: "The approval channel", type: "channel", required: true, channelTypes: [ChannelType.GuildText] }],
                },
                { name: "panel", description: "Post the advertisement ordering panel in this channel" },
                { name: "config", description: "Open the ads configuration panel (prices, details, exchange rate)" },
                {
                    name: "manager",
                    description: "Set the role that manages ad orders",
                    options: [{ name: "role", description: "The ads manager role", type: "role", required: true }],
                },
            ],
        },
    ],
    components: ["ads"],
});
