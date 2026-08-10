import type { Message, GuildMember, TextChannel } from "discord.js";
import { ModMailRepository } from "@database/repositories";
import { hasDepartmentAuthority } from "@bot/utils/access";
import { t } from "@bot/utils/lang";
import type { BotClient } from "@core/bot-client";
import type { IModMailThread } from "@database/models/ModMailThread";
import messages from "../../utils/modmail/messages.json";

export async function handleReplyCommand(message: Message, modmail: IModMailThread, client: BotClient) {
    const replyContent = message.content.slice(7).trim();
    if (!replyContent && message.attachments.size === 0) return;

    const staffGuild = client.guilds.cache.get(process.env.MainGuild!);
    const member = staffGuild
        ? await staffGuild.members.fetch(message.author.id).catch(() => null)
        : null;
    const isDeptAuthority = member ? await hasDepartmentAuthority(member as GuildMember, "Moderation") : false;

    if (modmail.claimedBy !== message.author.id && !isDeptAuthority) {
        await message.delete().catch(() => null);
        return;
    }

    const attachments = message.attachments.map(a => a.url);
    const user = await client.users.fetch(modmail.userId).catch(() => null);
    if (!user) return;

    const lang = modmail.language as "en" | "ar";
    const parts: string[] = [];
    if (replyContent) parts.push(`${t("modmail.moderator_prefix", lang)} ${replyContent}`);
    if (attachments.length) parts.push("📎 Attachment(s)");

    await user.send({ content: parts.join("\n"), files: attachments }).catch(() => null);
    await ModMailRepository.addMessage(modmail.threadId, message.author.id, "staff", replyContent, attachments);
    await message.delete().catch(() => null);
    await (message.channel as TextChannel).send({
        content: messages.success.reply_sent
            .replace("{userId}", message.author.id)
            .replace("{content}", replyContent),
    });
}
