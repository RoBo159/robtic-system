import type { Guild, TextChannel, ThreadChannel } from "discord.js";
import { ModMailRepository } from "@database/repositories";
import type { BotClient } from "@core/bot-client";
import type { Lang } from "@bot/utils/lang";

interface CreateThreadOptions {
    name: string;
    userId: string;
    language: Lang;
    requestType: "support" | "report" | "appeal";
    claimedBy?: string;
    reason?: string;
}

export async function createModmailThread(
    _client: BotClient,
    staffGuild: Guild,
    staffChannel: TextChannel,
    options: CreateThreadOptions,
): Promise<ThreadChannel> {
    const thread = await staffChannel.threads.create({
        name: options.name,
        autoArchiveDuration: 1440,
        reason: options.reason,
    });

    await ModMailRepository.create({
        userId: options.userId,
        threadId: thread.id,
        guildId: staffGuild.id,
        staffChannelId: staffChannel.id,
        language: options.language,
        requestType: options.requestType,
    });

    if (options.claimedBy) {
        await ModMailRepository.claim(thread.id, options.claimedBy);
    }

    return thread;
}
