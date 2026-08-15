import { ChannelType } from "discord.js";
import { defineFeature } from "@typings/feature";
import { SHORTCUT_DELETE_MODES, SHORTCUT_DELETE_MODE_LABELS } from "@constants";

const TRIGGER_OPTION = {
    name: "trigger",
    description: "The trigger phrase",
    type: "string",
    required: true,
    autocomplete: true,
} as const;

/**
 * Custom message triggers: type a phrase, run a command.
 *
 * `default-on` because nothing happens until a guild adds one — the listener finds no triggers and
 * returns without a query.
 */
export const shortcutsFeature = defineFeature({
    key: "shortcuts",
    description: "Custom message triggers",
    activation: "default-on",
    commands: [
        {
            name: "shortcut",
            description: "Run any command from a custom phrase",
            scope: "guild",
            access: "admin",
            category: "Configuration",
            groups: [
                {
                    name: "restrict",
                    description: "Limit who may use a shortcut, and where",
                    subcommands: [
                        {
                            name: "role-add",
                            description: "Only these roles may use the trigger",
                            options: [TRIGGER_OPTION, { name: "role", description: "Role to allow", type: "role", required: true }],
                        },
                        {
                            name: "role-remove",
                            description: "Stop allowing a role",
                            options: [TRIGGER_OPTION, { name: "role", description: "Role to remove", type: "role", required: true }],
                        },
                        {
                            name: "channel-add",
                            description: "Only these channels accept the trigger",
                            options: [TRIGGER_OPTION, { name: "channel", description: "Channel to allow", type: "channel", required: true, channelTypes: [ChannelType.GuildText] }],
                        },
                        {
                            name: "channel-remove",
                            description: "Stop restricting to a channel",
                            options: [TRIGGER_OPTION, { name: "channel", description: "Channel to remove", type: "channel", required: true, channelTypes: [ChannelType.GuildText] }],
                        },
                        {
                            name: "clear",
                            description: "Remove every role and channel restriction",
                            options: [TRIGGER_OPTION],
                        },
                    ],
                },
            ],
            subcommands: [
                {
                    name: "add",
                    description: "Add or update a shortcut",
                    options: [
                        { name: "command", description: "Command to run, e.g. warn add", type: "string", required: true, autocomplete: true },
                        { name: "trigger", description: "The phrase that runs it", type: "string", required: true },
                        { name: "args", description: "Fixed arguments. Use {args} to place what the member types.", type: "string" },
                        {
                            name: "delete",
                            description: "What to clean up afterwards",
                            type: "string",
                            choices: SHORTCUT_DELETE_MODES.map(mode => ({ name: SHORTCUT_DELETE_MODE_LABELS[mode], value: mode })),
                        },
                    ],
                },
                { name: "remove", description: "Delete a shortcut", options: [TRIGGER_OPTION] },
                { name: "list", description: "List every shortcut in this server" },
                { name: "info", description: "Show one shortcut in full", options: [TRIGGER_OPTION] },
                {
                    name: "toggle",
                    description: "Pause or resume a shortcut without deleting it",
                    options: [TRIGGER_OPTION, { name: "enabled", description: "Whether it should fire", type: "boolean", required: true }],
                },
            ],
        },
    ],
    events: ["messageCreate", "clientReady"],
});
