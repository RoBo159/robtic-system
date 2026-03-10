import { EmbedBuilder } from "discord.js";
import { Colors } from "@core/config";

export function modmailHelpEmbed(): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle("📖 ModMail Command Reference")
        .setColor(Colors.info)
        .addFields(
            {
                name: "Thread Management",
                value: [
                    "`/thread close` — Close the current modmail thread",
                    "`/thread stop` — Pause the conversation (claimer only)",
                    "`/thread start` — Resume a paused conversation (claimer only)",
                    "`/thread reopen` — Reopen a closed thread (managers only)",
                    "`/thread status` — Display all active and closed threads",
                ].join("\n"),
            },
            {
                name: "Communication",
                value: [
                    "`!reply <message>` — Send a message to the user",
                    "`/transfer @staff` — Transfer the thread to another staff member",
                ].join("\n"),
            },
            {
                name: "Tags",
                value: [
                    "`!tag` — List all available tags",
                    "`!tag <key>` — Send a tag message to the user",
                    "`/tag create` — Create a new tag",
                    "`/tag delete` — Delete an existing tag",
                    "`/tag help` — Show tag usage and template variables",
                ].join("\n"),
            },
            {
                name: "Notes",
                value: [
                    "`!note` — View notes for the thread user",
                    "📝 **Notes** button — View notes from the info embed",
                ].join("\n"),
            },
            {
                name: "Info",
                value: [
                    "✋ **Claim** button — Claim the thread to handle it",
                    "🔒 **Close** button — Close the thread from the info embed",
                ].join("\n"),
            },
        )
        .setTimestamp();
}

export function tagHelpEmbed(tagList: string, variablesList: string): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle("📋 Tag System Guide")
        .setColor(Colors.info)
        .addFields(
            { name: "Usage", value: "`!tag` — List all tags\n`!tag <key>` — Send a tag to the user\n`/tag create` — Create a new tag\n`/tag delete` — Delete a tag" },
            { name: "Available Tags", value: tagList },
            { name: "Template Variables", value: variablesList },
        )
        .setTimestamp();
}

export function moderationHelpEmbed(): EmbedBuilder {
    return new EmbedBuilder()
        .setTitle("🛡️ Moderation Command Reference")
        .setColor(Colors.moderation)
        .addFields(
            {
                name: "Warnings",
                value: [
                    "`/warn add @user <reason>` — Issue a warning (reason from dropdown)",
                    "`/warn appeal @user <case>` — Appeal a warning (removes level points)",
                    "`/warn list @user` — List all warnings",
                ].join("\n"),
            },
            {
                name: "Mutes",
                value: [
                    "`/mute add @user <reason> [duration]` — Mute a user",
                    "`/mute remove @user <case>` — Unmute (keeps level)",
                    "`/mute appeal @user <case>` — Appeal (removes level points)",
                    "`/mute list @user` — List all mutes",
                ].join("\n"),
            },
            {
                name: "Bans",
                value: [
                    "`/ban add @user <reason> [permanent] [duration]` — Ban a user",
                    "`/ban remove @user <case>` — Unban (keeps level)",
                    "`/ban appeal @user <case>` — Appeal (removes level points)",
                    "`/ban list @user` — List all bans",
                ].join("\n"),
            },
            {
                name: "Reason Management",
                value: [
                    "`/reason create <type>` — Create a new punishment reason (Manager+)",
                    "`/reason remove <key>` — Remove a punishment reason (Manager+)",
                    "`/reason list` — List all punishment reasons",
                ].join("\n"),
            },
            {
                name: "Punishment System",
                value: [
                    "Each punishment adds points to a user's level:",
                    "• **Warn**: +5 points | **Mute**: +10 points | **Ban**: +20 points",
                    "",
                    "**Level Thresholds:**",
                    "• `20` — Warning role",
                    "• `40` — Final Warning role",
                    "• `60` — Temporary Mute (auto-mute)",
                    "• `80` — Temporary Ban",
                    "• `100` — Permanent Ban (role assigned)",
                    "",
                    "**Escalation:** Associate-level mods' punishments are sent for Expert+ approval.",
                ].join("\n"),
            },
        )
        .setTimestamp();
}