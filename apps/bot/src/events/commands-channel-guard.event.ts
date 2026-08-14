import { Events, type Message, type GuildMember } from "discord.js";
import { ServerConfigRepository } from "@database/repositories";
import { looksLikeCommand } from "@utils";
import { STREAK_CONFIG } from "@constants";
import { getUserLang, t } from "@bot/utils/lang";
import { handleError, BotError } from "@core/handlers";

export default {
    name: Events.MessageCreate,

    async execute(message: Message) {
        if (message.author.bot || message.webhookId) return;
        if (!message.guild) return;

        try {
            const commandsChannelId = await ServerConfigRepository.getCommandsChannel(message.guild.id);
            if (!commandsChannelId || message.channel.id !== commandsChannelId) return;
            if (looksLikeCommand(message.content)) return;

            await message.delete().catch(() => null);
            if (!message.channel.isSendable()) return;

            const lang = await getUserLang(message.member as GuildMember | null);
            const notice = await message.channel.send({ content: t("commandsChannel.deleted_notice", lang, { user: `<@${message.author.id}>` }) }).catch(() => null);
            if (!notice) return;

            setTimeout(() => {
                notice.delete().catch(() => null);
            }, STREAK_CONFIG.autoDeleteMs);
        } catch (err) {
            handleError(new BotError(`Failed to process commands-channel guard: ${err}`, "EVENT"), "main/commands-channel-guard");
        }
    },
};
