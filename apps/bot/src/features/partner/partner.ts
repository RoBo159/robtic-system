import { defineFeature } from "@typings/feature";

/**
 * Partner servers: a directory of allied servers, their representatives, and the announcement
 * channel to reach them.
 *
 * `scope: "global"` — the Partner collection carries no guildId, so the directory is one list
 * shared by every server the bot is in, not a per-guild one.
 */
export const partnerFeature = defineFeature({
    key: "partner",
    description: "Partner server directory",
    activation: "opt-in",
    commands: [
        {
            name: "partner",
            description: "Manage Robtic partner servers",
            scope: "global",
            category: "Partnership",
            requiredPermission: 80,
            modalOnly: true,
            subcommands: [
                { name: "add", description: "Add a new partner server" },
                { name: "remove", description: "Remove a partner server" },
                { name: "announce", description: "Send an announcement DM to every partner representative" },
            ],
        },
    ],
    events: ["guildMemberAdd"],
    components: ["partner"],
});
