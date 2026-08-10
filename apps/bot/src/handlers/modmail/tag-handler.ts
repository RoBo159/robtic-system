import { EmbedBuilder, type Message, type GuildMember, type TextChannel } from "discord.js";
import { ModMailRepository } from "@database/repositories";
import { TagRepository } from "@database/repositories/TagRepository";
import { hasDepartmentAuthority } from "@bot/utils/access";
import { resolveTagVariables, TAG_VARIABLES_LIST } from "../../utils/modmail/tag-variables";
import { t } from "@bot/utils/lang";
import { COLORS } from "@constants";
import type { BotClient } from "@core/bot-client";
import type { IModMailThread } from "@database/models/ModMailThread";
import messages from "../../utils/modmail/messages.json";

export async function handleTagCommand(message: Message, modmail: IModMailThread, client: BotClient) {
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
            .setColor(COLORS.info)
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
    const isDeptAuthority = member ? await hasDepartmentAuthority(member as GuildMember, "Moderation") : false;

    if (modmail.claimedBy !== message.author.id && !isDeptAuthority) {
        await message.delete().catch(() => null);
        return;
    }

    const user = await client.users.fetch(modmail.userId).catch(() => null);
    if (!user) return;

    const lang = modmail.language as "en" | "ar";
    const resolved = await resolveTagVariables(tag.content[lang], {
        userId: modmail.userId,
        staffId: message.author.id,
        client,
        guildId: process.env.MainGuild,
    });

    await user.send({ content: `${t("modmail.moderator_prefix", lang)} ${resolved}` }).catch(() => null);
    await ModMailRepository.addMessage(modmail.threadId, message.author.id, "staff", `[tag:${key}] ${resolved}`);
    await message.delete().catch(() => null);
    await (message.channel as TextChannel).send({ content: messages.success.tag_sent.replace("{key}", key) });
}
