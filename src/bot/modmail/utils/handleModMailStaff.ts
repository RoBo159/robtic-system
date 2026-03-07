import { Message } from "discord.js";
import { ModMailRepository } from "@database/repositories";
import type { BotClient } from "@core/BotClient";
import { hasDepartmentAuthority } from "@shared/utils/access";
import type { GuildMember } from "discord.js";
import messages from "./messages.json";

export async function handleModMailStaff(message: Message, client: BotClient) {
    if (message.author.bot) return;
    if (!message.channel.isThread()) return;

    const thread = message.channel;
    const modmail = await ModMailRepository.findByThreadId(thread.id);

    if (!modmail) return;
    if (modmail.status !== "open") return;

    const staffGuild = client.guilds.cache.get(process.env.MainGuild!);
    const member = staffGuild
        ? await staffGuild.members.fetch(message.author.id).catch(() => null)
        : null;

    const isDeptAuthority = member
        ? hasDepartmentAuthority(member as GuildMember, "Moderation")
        : false;

    if (modmail.paused) {
        if (isDeptAuthority) return;

        await thread.send({
            content: messages.thread.chat_paused_notice,
        }).then(msg => setTimeout(() => msg.delete().catch(() => null), 5000));
        return;
    }

    if (!modmail.claimedBy) {
        if (isDeptAuthority) return;

        await message.delete().catch(() => null);
        await thread.send({
            content: messages.errors.thread_not_claimed,
        }).then(msg => setTimeout(() => msg.delete().catch(() => null), 5000));
        return;
    }

    if (isDeptAuthority && modmail.claimedBy !== message.author.id) {
        return;
    }

    if (modmail.claimedBy !== message.author.id) {
        await message.delete().catch(() => null);
        await thread.send({
            content: messages.errors.only_claimer_can_respond.replace("{userId}", modmail.claimedBy),
        }).then(msg => setTimeout(() => msg.delete().catch(() => null), 5000));
        return;
    }

    const attachments = message.attachments.map(a => a.url);

    await ModMailRepository.addMessage(
        thread.id,
        message.author.id,
        "staff",
        message.content,
        attachments,
    );

    const user = await client.users.fetch(modmail.userId).catch(() => null);
    if (!user) return;

    const parts: string[] = [];
    if (message.content) parts.push(`${messages.dm.moderator_prefix} ${message.content}`);
    if (attachments.length) parts.push("📎 Attachment(s)");

    await user.send({
        content: parts.join("\n"),
        files: attachments,
    }).catch(() => null);

    await message.react("✅").catch(() => null);
}
