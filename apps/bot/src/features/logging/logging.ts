import { defineFeature } from "@typings/feature";

/**
 * Chooses which channel each kind of bot log goes to.
 *
 * Only the configuration surface lives here — writing to a log channel is shared infrastructure in
 * `utils/server-log`, used by moderation audits, punishments and streak rewards alike, so it stays
 * outside any one feature.
 *
 * `default-on`: with nothing configured the bot simply writes no logs, so there is nothing to
 * consent to and no reason to make an admin enable it before they can point a channel at it.
 */
export const loggingFeature = defineFeature({
    key: "logging",
    description: "Log channel routing",
    activation: "default-on",
    commands: [
        {
            name: "setup-log",
            description: "Configure a global log channel",
            scope: "guild",
            category: "Configuration",
            requiredPermission: 100,
        },
    ],
    components: ["logging"],
});
