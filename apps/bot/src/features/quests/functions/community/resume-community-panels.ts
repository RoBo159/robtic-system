import type { Client, TextChannel } from "discord.js";
import { CommunityChallengeRepository } from "@database/repositories";
import { Logger } from "@logger";
import { buildCommunityEmbed } from "../../utils/community-embed";
import { postCommunityPanel } from "./render-community-panel";

const CTX = "quests";

/**
 * Re-attaches to live challenge embeds after a restart.
 *
 * Run before the first cycle so a bot restarted mid-week keeps editing the message it already
 * posted. A challenge whose message is genuinely gone gets a fresh one; anything else — a channel
 * the bot temporarily cannot see, a transient error — is left alone and retried next boot, because
 * reposting on a blip would leave two embeds competing for the same week.
 */
export async function resumeCommunityPanels(client: Client): Promise<number> {
    const active = await CommunityChallengeRepository.findAllActive();
    let resumed = 0;

    for (const challenge of active) {
        if (!challenge.channelId || !challenge.messageId) {
            await postCommunityPanel(client, challenge).catch(() => null);
            continue;
        }

        const channel = await client.channels.fetch(challenge.channelId).catch(() => null);
        if (!channel?.isTextBased() || channel.isDMBased()) continue;

        const message = await (channel as TextChannel).messages
            .fetch(challenge.messageId)
            .catch((err: { code?: number }) => (err.code === 10008 ? null : undefined));

        if (message === undefined) continue;

        if (message === null) {
            Logger.info(`Community embed for ${challenge.guildId} is gone; reposting`, CTX);
            await postCommunityPanel(client, challenge).catch(() => null);
            continue;
        }

        await message.edit({ embeds: [buildCommunityEmbed({ challenge })] }).catch(() => null);
        resumed++;
    }

    return resumed;
}
