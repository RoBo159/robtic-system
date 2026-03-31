import {
    ChatInputCommandInteraction,
    EmbedBuilder,
    MessageFlags,
    SlashCommandBuilder,
    type GuildMember,
} from "discord.js";
import { Colors } from "@core/config";
import { errorEmbed } from "@core/utils";
import type { BotClient } from "@core/BotClient";
import { recordSecurityEvent, sendAuditLog } from "../utils/security";

export default {
    data: new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Kick a member from the server")
        .addUserOption((opt) =>
            opt
                .setName("target")
                .setDescription("User to kick")
                .setRequired(true)
        )
        .addStringOption((opt) =>
            opt
                .setName("reason")
                .setDescription("Kick reason")
                .setRequired(false)
        ),

    requiredPermission: 60,
    department: "Moderation" as Department,

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        if (!interaction.guild || !interaction.guildId) return;

        const target = interaction.options.getUser("target", true);
        const reason = interaction.options.getString("reason") ?? "No reason provided";

        if (target.id === interaction.user.id) {
            await interaction.reply({ embeds: [errorEmbed("You cannot kick yourself.")], flags: MessageFlags.Ephemeral });
            return;
        }

        const member = interaction.guild.members.cache.get(target.id) ?? await interaction.guild.members.fetch(target.id).catch(() => null);
        if (!member) {
            await interaction.reply({ embeds: [errorEmbed("Target member not found in guild.")], flags: MessageFlags.Ephemeral });
            return;
        }

        if (!member.kickable) {
            await interaction.reply({ embeds: [errorEmbed("I cannot kick this member due to role hierarchy or permissions.")], flags: MessageFlags.Ephemeral });
            return;
        }

        await member.kick(reason).catch(() => null);

        const embed = new EmbedBuilder()
            .setTitle("👢 Member Kicked")
            .setColor(Colors.moderation)
            .addFields(
                { name: "Target", value: `<@${target.id}> (${target.id})` },
                { name: "Moderator", value: `<@${interaction.user.id}> (${interaction.user.id})` },
                { name: "Reason", value: reason },
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });

        await sendAuditLog(
            interaction.guild,
            "member_kick",
            new EmbedBuilder()
                .setTitle("📘 Audit: Member Kick")
                .setColor(Colors.warning)
                .addFields(
                    { name: "Target", value: `<@${target.id}> (${target.id})` },
                    { name: "Executor", value: `<@${interaction.user.id}> (${interaction.user.id})` },
                    { name: "Reason", value: reason },
                    { name: "Source", value: "/kick", inline: true },
                )
                .setTimestamp(),
        );

        await recordSecurityEvent({
            client,
            guild: interaction.guild,
            event: "kick",
            executorId: interaction.user.id,
            targetId: target.id,
            source: "command:/kick",
            details: reason,
        });
    },
};
