import { ChannelType, ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { ClientManager } from "@core/client-manager";
import { systemStatus } from "../utils/system";
import { systemReload } from "../utils/system";

/**
 * `enable` and `disable` used to take a bot name — there were six processes to bring up and take
 * down independently. One bot cannot disable itself and leave anything running, so both are gone;
 * `reload` no longer takes a name either, and re-reads commands and components from disk.
 */
export default {
    category: "Admin",
    data: new SlashCommandBuilder()
        .setName("system")
        .setDescription("System management commands")
        .addSubcommand((sub) =>
            sub
                .setName("status")
                .setDescription("View status or configure the live status panel")
                .addChannelOption((opt) =>
                    opt
                        .setName("channel")
                        .setDescription("Channel where the status panel should be posted")
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                )
        )
        .addSubcommand((sub) =>
            sub.setName("reload").setDescription("Reload commands and components from disk")
        ),
    requiredPermission: 100,
    cooldown: 10,
    async run(interaction: ChatInputCommandInteraction) {
        const manager = ClientManager.getInstance();

        switch (interaction.options.getSubcommand()) {
            case "status":
                await systemStatus(interaction, manager);
                break;
            case "reload":
                await systemReload(interaction, manager);
                break;
        }
    },
};
