import {
    ButtonInteraction,
    EmbedBuilder,
    TextChannel,
    MessageFlags,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    type GuildMember,
} from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { ComponentHandler } from "@typings/command";
import { COLORS } from "@constants";
import { ModMailRepository, ServerConfigRepository } from "@database/repositories";
import { getMemberLevel, isInDepartment } from "@bot/utils/access";
import messages from "../../utils/modmail/messages.json";

const reportAction: ComponentHandler<ButtonInteraction> = {
    customId: /^report_(approve|deny|investigate)_\d+_(en|ar)$/,

    async run(interaction: ButtonInteraction, client: BotClient) {
        const parts = interaction.customId.split("_");
        const action = parts[1];
        const reporterUserId = parts[2];
        const lang = parts[3] as "en" | "ar";

        const modMember = interaction.member as GuildMember;
        const modLevel = await getMemberLevel(modMember);

        if (modLevel.score < 60 || !(await isInDepartment(modMember, "Moderation"))) {
            await interaction.reply({
                embeds: [new EmbedBuilder().setDescription("❌ Only Expert+ moderators can handle reports.").setColor(COLORS.error)],
                flags: MessageFlags.Ephemeral,
            });
            return;
        }

        if (action === "approve") {
            const approvedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor(COLORS.success)
                .setFooter({ text: `✅ Approved by ${interaction.user.username}` });

            await interaction.update({ embeds: [approvedEmbed], components: [] });
            return;
        }

        if (action === "deny") {
            const deniedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor(COLORS.error)
                .setFooter({ text: `❌ Denied by ${interaction.user.username}` });

            await interaction.update({ embeds: [deniedEmbed], components: [] });
            return;
        }

        if (action === "investigate") {
            await interaction.deferUpdate();

            const staffGuild = client.guilds.cache.get(process.env.MainGuild!);
            const modmailChannelId = staffGuild ? await ServerConfigRepository.getModmailChannel(staffGuild.id) : null;
            const staffChannel = modmailChannelId ? staffGuild?.channels.cache.get(modmailChannelId) as TextChannel : null;

            if (!staffChannel) {
                await interaction.followUp({
                    content: messages.errors.staff_channel_not_found,
                    flags: MessageFlags.Ephemeral,
                });
                return;
            }

            const reporter = await client.users.fetch(reporterUserId).catch(() => null);
            const reporterName = reporter?.username ?? reporterUserId;

            const thread = await staffChannel.threads.create({
                name: `investigation-${reporterName}`,
                autoArchiveDuration: 1440,
                reason: `Investigation opened for report by ${reporterName}`,
            });

            await ModMailRepository.create({
                userId: reporterUserId,
                threadId: thread.id,
                guildId: staffGuild!.id,
                staffChannelId: staffChannel.id,
                language: lang,
                requestType: "report",
            });

            await ModMailRepository.claim(thread.id, interaction.user.id);

            const reportContent = interaction.message.embeds[0]?.fields?.find(f => f.name === "Reason")?.value ?? "N/A";
            const reportedUser = interaction.message.embeds[0]?.fields?.find(f => f.name === "Reported User")?.value ?? "Unknown";

            const infoEmbed = new EmbedBuilder()
                .setTitle("🔍 Investigation Thread")
                .setColor(COLORS.moderation)
                .addFields(
                    { name: "Reporter", value: `<@${reporterUserId}>`, inline: true },
                    { name: "Reported User", value: reportedUser, inline: true },
                    { name: "Investigator", value: `<@${interaction.user.id}>`, inline: true },
                    { name: "Report Reason", value: reportContent },
                    { name: "Language", value: lang === "ar" ? "🇸🇦 العربية" : "🇬🇧 English", inline: true },
                )
                .setTimestamp();

            const threadButtons = new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setCustomId(`modmail_notes_${reporterUserId}`)
                    .setLabel("Notes")
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji("📝"),
                new ButtonBuilder()
                    .setCustomId(`modmail_close_${thread.id}`)
                    .setLabel("Close")
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji("🔒"),
            );

            await thread.send({ embeds: [infoEmbed], components: [threadButtons] });

            const updatedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                .setColor(COLORS.info)
                .setFooter({ text: `🔍 Investigation opened by ${interaction.user.username}` });

            await interaction.editReply({ embeds: [updatedEmbed], components: [] });
        }
    },
};

export default reportAction;
