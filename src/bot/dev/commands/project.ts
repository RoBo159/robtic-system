import type { BotClient } from "@core/BotClient";
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { shareProject } from "@bot/dev/lib/share";
import { Logger } from "@core/libs";

export default {
    data: new SlashCommandBuilder()
        .setName("project")
        .setDescription("Manage your projects")
        .addSubcommand(subcommand =>
            subcommand
                .setName("share")
                .setDescription("Share a project with the community")
        ),
    requiredPermission: 0,
    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        const subcommand = interaction.options.getSubcommand();
        Logger.debug(`Received /project ${subcommand} command from ${interaction.user.tag}`, client.botName);

        if(subcommand === "share") {
            await shareProject(interaction);
        }
    }
}