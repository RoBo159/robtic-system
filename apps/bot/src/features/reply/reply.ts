import { defineFeature } from "@typings/feature";

/**
 * Auto-replies: a trigger phrase, one or more canned answers, one picked at random.
 *
 * `opt-in` — the bot answering messages unprompted is the kind of thing a server should ask for.
 */
export const replyFeature = defineFeature({
    key: "reply",
    description: "Auto-replies to trigger phrases",
    activation: "opt-in",
    commands: [
        {
            name: "reply",
            description: "Manage auto-replies for messages",
            scope: "guild",
            access: "admin",
            category: "Configuration",
            subcommands: [
                {
                    name: "add",
                    description: "Add a reply for a trigger (repeat to add more; one is picked at random)",
                    options: [
                        { name: "msg", description: "The message that triggers the reply", type: "string", required: true },
                        { name: "reply", description: "A reply to add", type: "string", required: true },
                    ],
                },
                {
                    name: "remove",
                    description: "Remove one reply by its id",
                    options: [
                        { name: "id", description: "The reply id shown by /reply list", type: "string", required: true, autocomplete: true },
                    ],
                },
                {
                    name: "delete",
                    description: "Delete a trigger and every reply on it",
                    options: [
                        { name: "msg", description: "The trigger to delete", type: "string", required: true, autocomplete: true },
                    ],
                },
                {
                    name: "list",
                    description: "Every reply, with its id, its trigger and who added it",
                    options: [
                        { name: "msg", description: "Only replies for this trigger", type: "string", autocomplete: true },
                    ],
                },
                {
                    name: "show",
                    description: "Show the replies configured for one trigger",
                    options: [
                        { name: "msg", description: "The trigger to inspect", type: "string", required: true, autocomplete: true },
                    ],
                },
            ],
        },
    ],
    events: ["messageCreate"],
});
