import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    MessageFlags,
    EmbedBuilder,
    type ThreadChannel,
    type GuildMember,
    PermissionFlagsBits,
} from "discord.js";
import { ModMailRepository } from "@database/repositories";
import type { BotClient } from "@core/BotClient";
import { hasDepartmentAuthority } from "@shared/utils/access";
import { closeModMail } from "../utils/closeModMail";
import { Colors } from "@core/config";
import messages from "../utils/messages.json";

export default {
    data: new SlashCommandBuilder()
        .setName("thread")
        .setDescription("Manage modmail thread state")
        .addSubcommand(sub =>
            sub.setName("stop").setDescription("Pause the modmail conversation in this thread")
        )
        .addSubcommand(sub =>
            sub.setName("start").setDescription("Resume the paused modmail conversation in this thread")
        )
        .addSubcommand(sub =>
            sub.setName("reopen").setDescription("Reopen a closed modmail thread (managers only)")
        )
        .addSubcommand(sub =>
            sub.setName("close").setDescription("Close the current modmail thread")
        )
        .addSubcommand(sub =>
            sub.setName("status").setDescription("Display all active and closed modmail threads")
        ),

    async run(interaction: ChatInputCommandInteraction, client: BotClient) {
        const sub = interaction.options.getSubcommand();

        if (sub === "status") {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const guildId = process.env.MainGuild!;
            const [openThreads, closedThreads] = await Promise.all([
                ModMailRepository.findAllOpen(guildId),
                ModMailRepository.findAllClosed(guildId),
            ]);

            if (!openThreads.length && !closedThreads.length) {
                await interaction.editReply({ content: messages.errors.no_threads_found });
                return;
            }

            const typeLabels: Record<string, string> = {
                support: messages.embed.type_support,
                report: messages.embed.type_report,
                appeal: messages.embed.type_appeal,
            };

            const formatThread = (t: any) => {
                const type = typeLabels[t.requestType] || t.requestType;
                const claimed = t.claimedBy ? `<@${t.claimedBy}>` : messages.embed.status_unclaimed;
                const paused = t.paused ? " ⏸️" : "";
                return `<#${t.threadId}> — ${type} — User: <@${t.userId}> — Staff: ${claimed}${paused}`;
            };

            const embed = new EmbedBuilder()
                .setTitle(messages.embed.thread_status_title)
                .setColor(Colors.info)
                .setTimestamp();

            if (openThreads.length) {
                const lines = openThreads.slice(0, 15).map(formatThread);
                if (openThreads.length > 15) lines.push(`... and ${openThreads.length - 15} more`);
                embed.addFields({ name: `🟢 Active (${openThreads.length})`, value: lines.join("\n") });
            }

            if (closedThreads.length) {
                const lines = closedThreads.slice(0, 10).map(t => {
                    const type = typeLabels[t.requestType] || t.requestType;
                    const closedAt = t.closedAt ? `<t:${Math.floor(t.closedAt.getTime() / 1000)}:R>` : "Unknown";
                    return `<#${t.threadId}> — ${type} — User: <@${t.userId}> — Closed: ${closedAt}`;
                });
                if (closedThreads.length > 10) lines.push(`... and ${closedThreads.length - 10} more`);
                embed.addFields({ name: `🔴 Closed (${closedThreads.length})`, value: lines.join("\n") });
            }

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        if (!interaction.channel?.isThread()) {
            await interaction.reply({
                content: messages.errors.not_in_thread,
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (sub === "close") {
            const modmail = await ModMailRepository.findByThreadId(interaction.channel.id);
            if (!modmail || modmail.status !== "open") {
                await interaction.reply({
                    content: messages.errors.no_active_thread,
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            await interaction.deferReply();

            const thread = interaction.channel as ThreadChannel;
            await closeModMail(modmail, interaction.user.id, client, thread);

            await interaction.editReply({ content: messages.success.thread_closed });
            return;
        }

        if (sub === "stop") {
            const modmail = await ModMailRepository.findByThreadId(interaction.channel.id);
            if (!modmail || modmail.status !== "open") {
                await interaction.reply({
                    content: messages.errors.no_active_thread,
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            if (modmail.claimedBy !== interaction.user.id) {
                await interaction.reply({
                    content: messages.errors.only_claimer_can_pause,
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            if (modmail.paused) {
                await interaction.reply({
                    content: messages.success.chat_already_paused,
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            await ModMailRepository.setPaused(interaction.channel.id, true);
            await interaction.reply({ content: messages.success.chat_paused });
            return;
        }

        if (sub === "start") {
            const modmail = await ModMailRepository.findByThreadId(interaction.channel.id);
            if (!modmail || modmail.status !== "open") {
                await interaction.reply({
                    content: messages.errors.no_active_thread,
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            if (modmail.claimedBy !== interaction.user.id) {
                await interaction.reply({
                    content: messages.errors.only_claimer_can_resume,
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            if (!modmail.paused) {
                await interaction.reply({
                    content: messages.success.chat_already_active,
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            await ModMailRepository.setPaused(interaction.channel.id, false);
            await interaction.reply({ content: messages.success.chat_resumed });
            return;
        }

        if (sub === "reopen") {
            const modmail = await ModMailRepository.findByThreadId(interaction.channel.id);
            if (!modmail || modmail.status !== "closed") {
                await interaction.reply({
                    content: messages.errors.no_closed_thread,
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const member = interaction.member as GuildMember;
            if (!hasDepartmentAuthority(member, "Moderation")) {
                await interaction.reply({
                    content: messages.errors.only_manager_can_reopen,
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const reopened = await ModMailRepository.reopen(interaction.channel.id);
            if (!reopened) {
                await interaction.reply({
                    content: messages.errors.reopen_failed,
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const thread = interaction.channel as ThreadChannel;
            await thread.setArchived(false).catch(() => null);
            await thread.setLocked(false).catch(() => null);

            const staffGuild = client.guilds.cache.get(process.env.MainGuild!);
            if (staffGuild) {
                const parent = thread.parent;
                if (parent) {
                    await thread.send({
                        content: messages.success.thread_reopened.replace("{userId}", interaction.user.id),
                    });
                }
            }

            await interaction.reply({
                content: messages.success.thread_reopened.replace("{userId}", interaction.user.id),
            });
            return;
        }
    },
};
