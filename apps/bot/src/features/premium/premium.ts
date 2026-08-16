import { defineFeature } from "@typings/feature";
import { PREMIUM_CONFIG } from "@constants";

const TIER_OPTION = {
    name: "tier",
    description: "Which tier",
    type: "string",
    required: true,
    autocomplete: true,
} as const;

/**
 * Premium memberships — one ladder for the whole bot.
 *
 * The split across three commands is the architecture in miniature:
 *
 * - `/premium` — anyone: what do I hold, and what does each tier give.
 * - `/premium-config` — a server's admins: which of *our* roles grant a tier, and whether perks
 *   apply here at all. Nothing else, because nothing else is theirs to decide.
 * - `/premium-admin` — bot operators (`scope: admin`): the tiers themselves, what each perk is
 *   worth, and memberships that follow a member into every server.
 *
 * `default-on` and inert: with no tiers, no mappings and no memberships every member resolves to
 * the baselines and every consumer multiplies by 1, so a server that ignores premium behaves
 * exactly as it did before the engine existed.
 */
export const premiumFeature = defineFeature({
    key: "premium",
    description: "Premium tiers and every perk they grant",
    activation: "default-on",
    events: ["clientReady", "guildMemberUpdate", "guildDelete"],
    commands: [
        {
            name: "premium",
            description: "Your membership and what it gives you",
            scope: "guild",
            access: "general",
            category: "Profile",
            subcommands: [
                {
                    name: "view",
                    description: "The tier you hold and every perk it grants",
                    options: [{ name: "user", description: "Member to check (defaults to yourself)", type: "user" }],
                },
                { name: "tiers", description: "Every tier and what each one gives" },
            ],
        },
        {
            name: "premium-config",
            description: "Connect this server's roles to premium tiers",
            scope: "guild",
            access: "admin",
            category: "Configuration",
            groups: [
                {
                    name: "role",
                    description: "Which of this server's roles grant a tier",
                    subcommands: [
                        {
                            name: "add",
                            description: "Make a role grant a tier here",
                            options: [TIER_OPTION, { name: "role", description: "Role that grants it", type: "role", required: true }],
                        },
                        {
                            name: "remove",
                            description: "Stop a role granting anything",
                            options: [{ name: "role", description: "Role to unmap", type: "role", required: true }],
                        },
                        { name: "list", description: "Every premium role in this server" },
                    ],
                },
            ],
            subcommands: [
                {
                    name: "toggle",
                    description: "Whether premium perks apply in this server at all",
                    options: [{ name: "enabled", description: "Whether perks apply here", type: "boolean", required: true }],
                },
                { name: "status", description: "The tiers, this server's mappings, and anything misconfigured" },
            ],
        },
        {
            name: "premium-admin",
            description: "The global premium ladder, its perks and memberships",
            scope: "admin",
            category: "Admin",
            groups: [
                {
                    name: "tier",
                    description: "The global ladder",
                    subcommands: [
                        {
                            name: "create",
                            description: "Add a tier, in every server",
                            options: [
                                { name: "name", description: "Display name, e.g. Prime+", type: "string", required: true },
                                { name: "rank", description: "Higher wins when a member holds several", type: "integer", required: true, minValue: 0, maxValue: 1000 },
                                { name: "emoji", description: "Shown beside the tier", type: "string" },
                                { name: "color", description: "Hex colour, e.g. #f5c518", type: "string" },
                            ],
                        },
                        { name: "delete", description: "Remove a tier, its perks, mappings and memberships", options: [TIER_OPTION] },
                        {
                            name: "edit",
                            description: "Rename a tier, change its rank, or disable it",
                            options: [
                                TIER_OPTION,
                                { name: "name", description: "New display name", type: "string" },
                                { name: "rank", description: "New rank", type: "integer", minValue: 0, maxValue: 1000 },
                                { name: "emoji", description: "New emoji", type: "string" },
                                { name: "color", description: "New hex colour", type: "string" },
                                { name: "enabled", description: "Whether it grants anything", type: "boolean" },
                            ],
                        },
                        { name: "list", description: "Every tier and what it is worth" },
                    ],
                },
                {
                    name: "feature",
                    description: "What each tier is worth",
                    subcommands: [
                        {
                            name: "set",
                            description: "Set a perk's value for a tier",
                            options: [
                                TIER_OPTION,
                                { name: "feature", description: "Which perk", type: "string", required: true, autocomplete: true },
                                {
                                    name: "value",
                                    description: "Percent, count, hours — or 1/0 for an on-off perk",
                                    type: "number",
                                    required: true,
                                    minValue: PREMIUM_CONFIG.percentRange.min,
                                    maxValue: PREMIUM_CONFIG.percentRange.max,
                                },
                            ],
                        },
                        {
                            name: "clear",
                            description: "Drop a perk back to its default for a tier",
                            options: [TIER_OPTION, { name: "feature", description: "Which perk", type: "string", required: true, autocomplete: true }],
                        },
                        {
                            name: "list",
                            description: "Every perk that can be configured, and what it does",
                            options: [{ name: "module", description: "Only perks for one system, e.g. quests", type: "string", autocomplete: true }],
                        },
                    ],
                },
                {
                    name: "membership",
                    description: "Memberships that follow a member into every server",
                    subcommands: [
                        {
                            name: "grant",
                            description: "Give a member a tier everywhere",
                            options: [
                                { name: "user", description: "Who gets it", type: "user", required: true },
                                TIER_OPTION,
                                { name: "days", description: "How long it lasts. Omit for permanent.", type: "integer", minValue: 1, maxValue: 3650 },
                                { name: "reason", description: "Why, for the record", type: "string" },
                            ],
                        },
                        {
                            name: "revoke",
                            description: "Take a membership away",
                            options: [{ name: "user", description: "Who loses it", type: "user", required: true }, TIER_OPTION],
                        },
                        {
                            name: "view",
                            description: "One member's memberships, expired ones included",
                            options: [{ name: "user", description: "Who to look up", type: "user", required: true }],
                        },
                        {
                            name: "holders",
                            description: "Who currently holds a membership",
                            options: [{ name: "tier", description: "Only this tier", type: "string", autocomplete: true }],
                        },
                    ],
                },
            ],
        },
    ],
});
