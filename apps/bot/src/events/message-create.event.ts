import { Events, type Message, AttachmentBuilder } from "discord.js";
import path from "path";
import { existsSync } from "fs";
import { ServerConfigRepository } from "@database/repositories";
import { BRANCH_EMOJIS as emojis } from "@config";
import type { BotClient } from "@core/bot-client";

const LINE_IMAGE_PATH = path.join(process.cwd(), "images", "line.png");

export default {
    name: Events.MessageCreate,

    async execute(message: Message, _client: BotClient) {
        if (message.author.bot) return;
        if (!message.guild) return;

        const lineChannelIds = await ServerConfigRepository.getLineChannels(message.guild.id);
        if (!lineChannelIds.includes(message.channel.id)) return;

        if (message.channel.isSendable() && existsSync(LINE_IMAGE_PATH)) {
            const attachment = new AttachmentBuilder(LINE_IMAGE_PATH, { name: "line.png" });
            await message.channel.send({ files: [attachment] }).catch(() => null);
        }

        await message.react(emojis.add).catch(() => null);
    },
};
