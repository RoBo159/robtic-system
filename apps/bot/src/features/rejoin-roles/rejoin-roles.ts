import { defineFeature } from "@typings/feature";
import { REJOIN_ROLES_LIMITS } from "@constants";

/**
 * Gives a returning member their roles back.
 *
 * `opt-in`, and deliberately so: handing roles back automatically is a permission decision, and a
 * server that has not asked for it should not start doing it because the bot was invited. It is
 * also why staff roles get their own, shorter window — see the two `timers` options.
 */
export const rejoinRolesFeature = defineFeature({
    key: "rejoin-roles",
    description: "Restore roles when a member returns",
    activation: "opt-in",
    commands: [
        {
            name: "rejoin-roles",
            description: "Configure which roles come back when a member returns, and for how long",
            scope: "guild",
            access: "admin",
            category: "Configuration",
            groups: [
                {
                    name: "exclude",
                    description: "Roles that are never saved and never restored",
                    subcommands: [
                        {
                            name: "add",
                            description: "Stop a role from ever being restored",
                            options: [{ name: "role", description: "Role to exclude", type: "role", required: true }],
                        },
                        {
                            name: "remove",
                            description: "Allow a role to be restored again",
                            options: [{ name: "role", description: "Role to stop excluding", type: "role", required: true }],
                        },
                    ],
                },
                {
                    name: "staff",
                    description: "Roles that expire on the shorter staff window",
                    subcommands: [
                        {
                            name: "add",
                            description: "Treat a role as a staff role",
                            options: [{ name: "role", description: "Role to treat as staff", type: "role", required: true }],
                        },
                        {
                            name: "remove",
                            description: "Stop treating a role as a staff role",
                            options: [{ name: "role", description: "Role to stop treating as staff", type: "role", required: true }],
                        },
                    ],
                },
            ],
            subcommands: [
                { name: "status", description: "Show the current configuration" },
                {
                    name: "timers",
                    description: "Set how long roles survive after a member leaves",
                    options: [
                        {
                            name: "member-hours",
                            description: "Hours ordinary roles are kept",
                            type: "integer",
                            required: true,
                            minValue: REJOIN_ROLES_LIMITS.minHours,
                            maxValue: REJOIN_ROLES_LIMITS.maxHours,
                        },
                        {
                            name: "staff-hours",
                            description: "Hours staff roles are kept — must be less than member-hours",
                            type: "integer",
                            required: true,
                            minValue: REJOIN_ROLES_LIMITS.minHours,
                            maxValue: REJOIN_ROLES_LIMITS.maxHours,
                        },
                    ],
                },
            ],
        },
    ],
    events: ["guildMemberRemove", "guildMemberAdd", "clientReady"],
});
