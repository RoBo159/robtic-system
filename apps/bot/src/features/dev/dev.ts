import { defineFeature } from "@typings/feature";

/**
 * Community project sharing: members submit a project, staff review it, and published projects get
 * a browsable panel with reactions.
 *
 * `scope: "global"` — the Project collection carries no guildId, so a published project is visible
 * from every server the bot is in.
 */
export const devFeature = defineFeature({
    key: "dev",
    description: "Project sharing and review",
    activation: "opt-in",
    commands: [
        {
            name: "project",
            description: "Manage your projects",
            scope: "global",
            category: "Projects",
            requiredPermission: 0,
            modalOnly: true,
            subcommands: [
                { name: "share", description: "Share a project with the community" },
            ],
        },
    ],
    components: ["dev"],
});
