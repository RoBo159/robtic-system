import {
    ChannelType,
    ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
    SlashCommandBuilder,
    type GuildMember,
} from "discord.js";
import { Colors } from "@core/config";
import { errorEmbed } from "@core/utils";
import { getMemberLevel, isManagerOf } from "@shared/utils/access";
import {
    formatWindow,
    parseWindowToMs,
    type AuditChannelKey,
    type SecurityActionType,
    type SecurityEventType,
    type SecurityRule,
} from "../utils/config";
import {
    getModerationSecurityConfig,
    saveModerationSecurityConfig,
} from "../utils/security";

const auditChannelChoices: Array<{ name: string; value: AuditChannelKey }> = [
    { name: "member_join", value: "member_join" },
    { name: "member_leave", value: "member_leave" },
    { name: "member_kick", value: "member_kick" },
    { name: "member_ban", value: "member_ban" },
    { name: "message_delete", value: "message_delete" },
    { name: "channel_create", value: "channel_create" },
    { name: "channel_delete", value: "channel_delete" },
    { name: "role_update", value: "role_update" },
    {name : "generic", value: "generic" },
];

const securityEventChoices: Array<{ name: string; value: SecurityEventType }> = [
    { name: "kick", value: "kick" },
    { name: "ban", value: "ban" },
    { name: "role_grant", value: "role_grant" },
    { name: "role_remove", value: "role_remove" },
    { name: "channel_create", value: "channel_create" },
    { name: "channel_delete", value: "channel_delete" },
];

function parseActions(raw: string): SecurityActionType[] {
    const parts = raw
        .split(",")
        .map((item) => item.trim().toLowerCase().replace(/-/g, "_"))
        .filter(Boolean);

    const valid = new Set<SecurityActionType>(["kick", "ban", "remove_role", "send_alert"]);
    const actions = parts.filter((item): item is SecurityActionType => valid.has(item as SecurityActionType));

    return actions.length > 0 ? Array.from(new Set(actions)) : ["send_alert"];
}

function managerOnly(member: GuildMember): boolean {
    const { score } = getMemberLevel(member);
    if (score >= 90) return true;
    return isManagerOf(member, "Moderation");
}

function describeRule(rule: SecurityRule, index: number): string {
    return `#${index + 1} event=${rule.event} limit=${rule.limit} window=${formatWindow(rule.windowMs)} actions=[${rule.actions.join(", ")}]`;
}

export default {
    data: new SlashCommandBuilder()
        .setName("security")
        .setDescription("Configure moderation audit and security guard")
        .addSubcommand((sub) =>
            sub
                .setName("status")
                .setDescription("Show current security config")
        )
        .addSubcommand((sub) =>
            sub
                .setName("toggle")
                .setDescription("Enable/disable moderation security")
                .addBooleanOption((opt) =>
                    opt
                        .setName("enabled")
                        .setDescription("Enable security system")
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("channel-set")
                .setDescription("Set audit/security channel")
                .addStringOption((opt) =>
                    opt
                        .setName("type")
                        .setDescription("Audit log type")
                        .setRequired(true)
                        .addChoices(...auditChannelChoices)
                )
                .addChannelOption((opt) =>
                    opt
                        .setName("channel")
                        .setDescription("Target text channel")
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("channel-security")
                .setDescription("Set security alerts channel")
                .addChannelOption((opt) =>
                    opt
                        .setName("channel")
                        .setDescription("Security alert channel")
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("rule-add")
                .setDescription("Add threshold rule")
                .addStringOption((opt) =>
                    opt
                        .setName("event")
                        .setDescription("Security event")
                        .setRequired(true)
                        .addChoices(...securityEventChoices)
                )
                .addIntegerOption((opt) =>
                    opt
                        .setName("limit")
                        .setDescription("How many actions before trigger")
                        .setRequired(true)
                        .setMinValue(1)
                )
                .addStringOption((opt) =>
                    opt
                        .setName("window")
                        .setDescription("Window like 30s, 1m, 2h")
                        .setRequired(true)
                )
                .addStringOption((opt) =>
                    opt
                        .setName("actions")
                        .setDescription("Comma actions: send_alert,remove_role,kick,ban")
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("rule-remove")
                .setDescription("Remove threshold rule by index")
                .addStringOption((opt) =>
                    opt
                        .setName("event")
                        .setDescription("Rule event")
                        .setRequired(true)
                        .addChoices(...securityEventChoices)
                )
                .addIntegerOption((opt) =>
                    opt
                        .setName("index")
                        .setDescription("1-based index inside that event")
                        .setRequired(true)
                        .setMinValue(1)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("rule-list")
                .setDescription("List threshold rules")
        )
        .addSubcommand((sub) =>
            sub
                .setName("whitelist-add")
                .setDescription("Whitelist user or role")
                .addUserOption((opt) =>
                    opt
                        .setName("user")
                        .setDescription("User to whitelist")
                        .setRequired(false)
                )
                .addRoleOption((opt) =>
                    opt
                        .setName("role")
                        .setDescription("Role to whitelist")
                        .setRequired(false)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("whitelist-remove")
                .setDescription("Remove user or role from whitelist")
                .addUserOption((opt) =>
                    opt
                        .setName("user")
                        .setDescription("User to remove")
                        .setRequired(false)
                )
                .addRoleOption((opt) =>
                    opt
                        .setName("role")
                        .setDescription("Role to remove")
                        .setRequired(false)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("whitelist-list")
                .setDescription("List whitelisted users/roles")
        )
        .addSubcommand((sub) =>
            sub
                .setName("rolestrip-add")
                .setDescription("Add role to strip list")
                .addRoleOption((opt) =>
                    opt
                        .setName("role")
                        .setDescription("Role to remove on trigger")
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("rolestrip-remove")
                .setDescription("Remove role from strip list")
                .addRoleOption((opt) =>
                    opt
                        .setName("role")
                        .setDescription("Role to remove from list")
                        .setRequired(true)
                )
        )
        .addSubcommand((sub) =>
            sub
                .setName("rolestrip-list")
                .setDescription("List strip roles")
        ),

    requiredPermission: 80,
    department: "Moderation" as Department,

    async run(interaction: ChatInputCommandInteraction) {
        if (!interaction.guildId || !interaction.guild) return;

        const member = interaction.member as GuildMember;
        if (!managerOnly(member)) {
            await interaction.reply({
                embeds: [errorEmbed("Only Moderation Department Managers can use this command.")],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        const sub = interaction.options.getSubcommand();
        const config = await getModerationSecurityConfig(interaction.guildId);

        if (sub === "status") {
            const embed = new EmbedBuilder()
                .setTitle("🛡️ Moderation Security Status")
                .setColor(Colors.info)
                .addFields(
                    { name: "Enabled", value: String(config.enabled), inline: true },
                    { name: "Rules", value: String(config.rules.length), inline: true },
                    { name: "Whitelist Users", value: String(config.whitelistUserIds.length), inline: true },
                    { name: "Whitelist Roles", value: String(config.whitelistRoleIds.length), inline: true },
                    { name: "Security Log Channel", value: config.settings.securityLogChannelId ? `<#${config.settings.securityLogChannelId}>` : "Not set" },
                    { name: "Role Strip List", value: config.settings.rolesToStrip.length > 0 ? config.settings.rolesToStrip.map((id) => `<@&${id}>`).join(", ") : "Not set" },
                    {
                        name: "Rules Detail",
                        value: config.rules.length > 0
                            ? config.rules.map((rule, index) => describeRule(rule, index)).join("\n")
                            : "No rules configured",
                    },
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        if (sub === "toggle") {
            const enabled = interaction.options.getBoolean("enabled", true);
            config.enabled = enabled;
            const saved = await saveModerationSecurityConfig(interaction.guildId, config, interaction.user.id);
            await interaction.reply({
                embeds: [new EmbedBuilder().setColor(Colors.success).setDescription(`Security system is now **${saved.enabled ? "ENABLED" : "DISABLED"}**.`)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (sub === "channel-set") {
            const type = interaction.options.getString("type", true) as AuditChannelKey;
            const channel = interaction.options.getChannel("channel", true);
            config.settings.auditChannels[type] = channel.id;
            await saveModerationSecurityConfig(interaction.guildId, config, interaction.user.id);

            await interaction.reply({
                embeds: [new EmbedBuilder().setColor(Colors.success).setDescription(`Audit log channel for **${type}** set to <#${channel.id}>.`)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (sub === "channel-security") {
            const channel = interaction.options.getChannel("channel", true);
            config.settings.securityLogChannelId = channel.id;
            await saveModerationSecurityConfig(interaction.guildId, config, interaction.user.id);

            await interaction.reply({
                embeds: [new EmbedBuilder().setColor(Colors.success).setDescription(`Security alert channel set to <#${channel.id}>.`)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (sub === "rule-add") {
            const event = interaction.options.getString("event", true) as SecurityEventType;
            const limit = interaction.options.getInteger("limit", true);
            const windowRaw = interaction.options.getString("window", true);
            const actionsRaw = interaction.options.getString("actions", true);

            const rule: SecurityRule = {
                event,
                limit,
                windowMs: parseWindowToMs(windowRaw),
                actions: parseActions(actionsRaw),
            };

            config.rules.push(rule);
            await saveModerationSecurityConfig(interaction.guildId, config, interaction.user.id);

            await interaction.reply({
                embeds: [new EmbedBuilder().setColor(Colors.success).setDescription(`Rule added: ${describeRule(rule, config.rules.length - 1)}`)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (sub === "rule-remove") {
            const event = interaction.options.getString("event", true) as SecurityEventType;
            const index = interaction.options.getInteger("index", true) - 1;
            const list = config.rules.filter((rule) => rule.event === event);

            if (index < 0 || index >= list.length) {
                await interaction.reply({ embeds: [errorEmbed("Invalid index for this event.")], flags: MessageFlags.Ephemeral });
                return;
            }

            const selected = list[index];
            const globalIndex = config.rules.findIndex((rule) =>
                rule.event === selected.event &&
                rule.limit === selected.limit &&
                rule.windowMs === selected.windowMs &&
                rule.actions.join(",") === selected.actions.join(",")
            );

            if (globalIndex >= 0) config.rules.splice(globalIndex, 1);
            await saveModerationSecurityConfig(interaction.guildId, config, interaction.user.id);

            await interaction.reply({
                embeds: [new EmbedBuilder().setColor(Colors.success).setDescription(`Removed rule: ${describeRule(selected, index)}`)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (sub === "rule-list") {
            const byEvent = securityEventChoices.map((choice) => {
                const eventRules = config.rules.filter((rule) => rule.event === choice.value);
                if (eventRules.length === 0) return `**${choice.value}**\n- none`;
                return `**${choice.value}**\n${eventRules.map((rule, i) => `- ${describeRule(rule, i)}`).join("\n")}`;
            });

            const embed = new EmbedBuilder()
                .setTitle("Security Rules")
                .setColor(Colors.info)
                .setDescription(byEvent.join("\n\n"))
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        if (sub === "whitelist-add" || sub === "whitelist-remove") {
            const user = interaction.options.getUser("user", false);
            const role = interaction.options.getRole("role", false);

            if (!user && !role) {
                await interaction.reply({ embeds: [errorEmbed("Provide at least one of user or role.")], flags: MessageFlags.Ephemeral });
                return;
            }

            if (sub === "whitelist-add") {
                if (user && !config.whitelistUserIds.includes(user.id)) config.whitelistUserIds.push(user.id);
                if (role && !config.whitelistRoleIds.includes(role.id)) config.whitelistRoleIds.push(role.id);
            } else {
                if (user) config.whitelistUserIds = config.whitelistUserIds.filter((id) => id !== user.id);
                if (role) config.whitelistRoleIds = config.whitelistRoleIds.filter((id) => id !== role.id);
            }

            await saveModerationSecurityConfig(interaction.guildId, config, interaction.user.id);

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.success)
                        .setDescription(
                            `${sub === "whitelist-add" ? "Added to" : "Removed from"} whitelist: ${user ? `<@${user.id}>` : ""} ${role ? `<@&${role.id}>` : ""}`.trim()
                        ),
                ],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (sub === "whitelist-list") {
            const embed = new EmbedBuilder()
                .setTitle("Security Whitelist")
                .setColor(Colors.info)
                .addFields(
                    {
                        name: "Users",
                        value: config.whitelistUserIds.length > 0
                            ? config.whitelistUserIds.map((id) => `<@${id}>`).join("\n")
                            : "none",
                    },
                    {
                        name: "Roles",
                        value: config.whitelistRoleIds.length > 0
                            ? config.whitelistRoleIds.map((id) => `<@&${id}>`).join("\n")
                            : "none",
                    },
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
            return;
        }

        if (sub === "rolestrip-add") {
            const role = interaction.options.getRole("role", true);
            if (!config.settings.rolesToStrip.includes(role.id)) {
                config.settings.rolesToStrip.push(role.id);
            }
            await saveModerationSecurityConfig(interaction.guildId, config, interaction.user.id);

            await interaction.reply({
                embeds: [new EmbedBuilder().setColor(Colors.success).setDescription(`Added <@&${role.id}> to role strip list.`)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (sub === "rolestrip-remove") {
            const role = interaction.options.getRole("role", true);
            config.settings.rolesToStrip = config.settings.rolesToStrip.filter((id) => id !== role.id);
            await saveModerationSecurityConfig(interaction.guildId, config, interaction.user.id);

            await interaction.reply({
                embeds: [new EmbedBuilder().setColor(Colors.success).setDescription(`Removed <@&${role.id}> from role strip list.`)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (sub === "rolestrip-list") {
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor(Colors.info)
                        .setTitle("Role Strip List")
                        .setDescription(
                            config.settings.rolesToStrip.length > 0
                                ? config.settings.rolesToStrip.map((id) => `<@&${id}>`).join("\n")
                                : "No roles configured."
                        ),
                ],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }
    },
};
