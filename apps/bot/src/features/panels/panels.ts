import { defineFeature } from "@typings/feature";

/**
 * Reusable message panels — rules, activity-system pickers, project boards — defined in
 * `definitions/` and posted into a channel with `/panels send`.
 *
 * `default-on`: the command does nothing until someone sends a panel, and the definitions are
 * static, so there is nothing to consent to.
 */
export const panelsFeature = defineFeature({
    key: "panels",
    description: "Reusable message panels",
    activation: "default-on",
    commands: [
        {
            name: "panels",
            description: "Send, list, or delete server panels",
            scope: "guild",
            access: "admin",
            category: "Configuration",
            subcommands: [
                { name: "list", description: "List every available panel" },
                {
                    name: "send",
                    description: "Send a panel to this channel",
                    options: [{ name: "panel", description: "Panel to send", type: "string", required: true, autocomplete: true }],
                },
                {
                    name: "delete",
                    description: "Delete a previously sent panel",
                    options: [{ name: "panel_message", description: "Panel message to delete", type: "string", required: true, autocomplete: true }],
                },
            ],
        },
    ],
    components: ["panel"],
});
