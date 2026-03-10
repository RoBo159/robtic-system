import type { BotClient } from "@core/BotClient";
import { EmbedBuilder, Events, Message, type GuildMember } from "discord.js";
import { ModMailRepository } from "@database/repositories";
import { TagRepository } from "@database/repositories/TagRepository";
import { NoteRepository } from "@database/repositories/NoteRepository";
import { handleModMailDM } from "../utils/handleModMailDM";
import { handleModMailStaff } from "../utils/handleModMailStaff";
import { hasDepartmentAuthority } from "@shared/utils/access";
import { Colors } from "@core/config";
import messages from "../utils/messages.json";
import { resolveTagVariables, TAG_VARIABLES_LIST } from "../utils/tagVariables";
import { t } from "@shared/utils/lang";

export default {
    name: Events.MessageCreate,
    async execute(message: Message, client: BotClient) {
        if (message.author.bot) return;

        if (!message.guild) {
            handleModMailDM(message, client);
            return;
        }

        if (message.channel.isThread()) {
            const modmail = await ModMailRepository.findByThreadId(message.channel.id);
            if (!modmail || modmail.status !== "open") return;

            if (message.content.startsWith("!reply ")) {
                const replyContent = message.content.slice(7).trim();
                if (!replyContent && message.attachments.size === 0) return;

                const staffGuild = client.guilds.cache.get(process.env.MainGuild!);
                const member = staffGuild
                    ? await staffGuild.members.fetch(message.author.id).catch(() => null)
                    : null;

                const isDeptAuthority = member
                    ? hasDepartmentAuthority(member as GuildMember, "Moderation")
                    : false;

                if (modmail.claimedBy !== message.author.id && !isDeptAuthority) {
                    await message.delete().catch(() => null);
                    return;
                }

                const attachments = message.attachments.map(a => a.url);
                const user = await client.users.fetch(modmail.userId).catch(() => null);
                if (!user) return;

                const parts: string[] = [];
                if (replyContent) parts.push(`${t("modmail.moderator_prefix", modmail.language as "en" | "ar")} ${replyContent}`);
                if (attachments.length) parts.push("📎 Attachment(s)");

                await user.send({
                    content: parts.join("\n"),
                    files: attachments,
                }).catch(() => null);

                await ModMailRepository.addMessage(
                    modmail.threadId,
                    message.author.id,
                    "staff",
                    replyContent,
                    attachments,
                );

                await message.delete().catch(() => null);
                await message.channel.send({
                    content: messages.success.reply_sent.replace("{userId}", message.author.id).replace("{content}", replyContent),
                });
                return;
            }

            if (message.content === "!tag" || message.content.startsWith("!tag ")) {
                const key = message.content.slice(4).trim().toLowerCase();

                if (!key) {
                    const allTags = await TagRepository.getAll();
                    if (!allTags.length) {
                        await message.reply({ content: messages.errors.no_tags_available });
                        return;
                    }

                    const tagList = allTags.map(t => `\`${t.key}\` — ${t.description}`).join("\n");
                    const embed = new EmbedBuilder()
                        .setTitle(messages.embed.tags_list_title)
                        .setDescription(tagList + "\n\n**Variables:**\n" + TAG_VARIABLES_LIST)
                        .setColor(Colors.info)
                        .setFooter({ text: messages.embed.tags_list_footer })
                        .setTimestamp();

                    await message.reply({ embeds: [embed] });
                    return;
                }

                const tag = await TagRepository.findByKey(key);
                if (!tag) {
                    await message.reply({ content: messages.errors.tag_not_found.replace("{key}", key) });
                    return;
                }

                const staffGuild = client.guilds.cache.get(process.env.MainGuild!);
                const member = staffGuild
                    ? await staffGuild.members.fetch(message.author.id).catch(() => null)
                    : null;

                const isDeptAuthority = member
                    ? hasDepartmentAuthority(member as GuildMember, "Moderation")
                    : false;

                if (modmail.claimedBy !== message.author.id && !isDeptAuthority) {
                    await message.delete().catch(() => null);
                    return;
                }

                const user = await client.users.fetch(modmail.userId).catch(() => null);
                if (!user) return;

                const resolved = await resolveTagVariables(tag.content[modmail.language], {
                    userId: modmail.userId,
                    staffId: message.author.id,
                    client,
                    guildId: process.env.MainGuild,
                });

                await user.send({ content: `${t("modmail.moderator_prefix", modmail.language as "en" | "ar")} ${resolved}` }).catch(() => null);

                await ModMailRepository.addMessage(
                    modmail.threadId,
                    message.author.id,
                    "staff",
                    `[tag:${key}] ${resolved}`,
                );

                await message.delete().catch(() => null);
                await message.channel.send({ content: messages.success.tag_sent.replace("{key}", key) });
                return;
            }

            if (message.content === "!note") {
                const notes = await NoteRepository.findByUser(modmail.userId);

                if (!notes.length) {
                    await message.reply({ content: messages.errors.no_notes_found });
                    return;
                }

                const noteLines = notes.map((n, i) =>
                    `**${i + 1}.** ${n.content}\n   — <@${n.createdBy}> • <t:${Math.floor(n.createdAt.getTime() / 1000)}:R>`
                ).join("\n\n");

                const embed = new EmbedBuilder()
                    .setTitle(messages.embed.notes_title.replace("{userId}", modmail.userId))
                    .setDescription(noteLines)
                    .setColor(Colors.warning)
                    .setTimestamp();

                await message.reply({ embeds: [embed] });
                return;
            }

            handleModMailStaff(message, client);
            return;
        }
    },
}