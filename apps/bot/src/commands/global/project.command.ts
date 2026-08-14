import type { BotClient } from "@core/bot-client";
import { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { Logger } from "@logger";
import { showShareProjectModal } from "@bot/utils/dev/share-modal";

export default {
    scope: "global",
    data: new SlashCommandBuilder()
        .setName("project")
        .setDescription("Manage your projects")
        .addSubcommand(subcommand =>
            subcommand
                .setName("share")
                .setDescription("Share a project with the community")
        ),
    requiredPermission: 0,
    category: "Projects",
    // Its only action opens a modal (share) — no text-command equivalent, so the prefix router points to /project.
    modalOnly: true,
    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        const subcommand = interaction.options.getSubcommand();
        Logger.debug(`Received /project ${subcommand} command from ${interaction.user.tag}`, client.botName);

        if (subcommand === "share") {
            await showShareProjectModal(interaction);
        }
    }
};
