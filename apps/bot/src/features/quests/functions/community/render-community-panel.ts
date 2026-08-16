import type { Client, TextChannel } from "discord.js";
import type { ICommunityChallenge } from "@database/models";
import { mentionRoleFor } from "@database/models";
import { CommunityChallengeRepository, QuestSettingsRepository } from "@database/repositories";
import { COMMUNITY_CONFIG } from "@constants";
import { pendingTotal } from "@core/quests";
import { Logger } from "@logger";
import { buildCommunityEmbed } from "../../utils/community-embed";
import { scheduleEdit, bypassThrottle, forgetThrottle, UNKNOWN_MESSAGE } from "../../utils/edit-throttle";

const CTX = "quests";

async function resolveChannel(client: Client, challenge: ICommunityChallenge): Promise<TextChannel | null> {
    const settings = await QuestSettingsRepository.getCached(challenge.guildId);
    const channelId = challenge.channelId ?? settings.communityChannelId;
    if (!channelId) return null;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    return channel?.isTextBased() && !channel.isDMBased() ? channel as TextChannel : null;
}

/** Posts the challenge embed for the first time and records where it lives. */
export async function postCommunityPanel(client: Client, challenge: ICommunityChallenge): Promise<void> {
    const channel = await resolveChannel(client, challenge);
    if (!channel) return;

    const settings = await QuestSettingsRepository.getCached(challenge.guildId);
    const roleId = mentionRoleFor(settings, "community");

    const message = await channel.send({
        content: roleId ? `<@&${roleId}>` : undefined,
        embeds: [buildCommunityEmbed({ challenge })],
        allowedMentions: roleId ? { roles: [roleId] } : { parse: [] },
    });

    await CommunityChallengeRepository.setMessage(challenge._id, channel.id, message.id);
}

/**
 * Redraws the live challenge embed.
 *
 * Always through the throttle: a whole server feeds one counter, so without it this would try to
 * edit on every message. Milestones bypass the interval, because reaching 50% is exactly the moment
 * people look.
 */
export function refreshCommunityPanel(client: Client, challengeId: string, milestone = false): void {
    void (async () => {
        const challenge = await CommunityChallengeRepository.findById(challengeId);
        if (!challenge?.messageId) return;

        if (milestone) bypassThrottle(challenge.messageId, COMMUNITY_CONFIG.milestoneFloorMs);

        scheduleEdit(challenge.messageId, COMMUNITY_CONFIG.editMinMs, async () => {
            const fresh = await CommunityChallengeRepository.findById(challengeId);
            if (!fresh?.channelId || !fresh.messageId) return;

            const channel = await client.channels.fetch(fresh.channelId).catch(() => null);
            if (!channel?.isTextBased() || channel.isDMBased()) return;

            try {
                const message = await (channel as TextChannel).messages.fetch(fresh.messageId);
                await message.edit({
                    embeds: [buildCommunityEmbed({ challenge: fresh, pending: pendingTotal(fresh.guildId) })],
                });
            } catch (err) {
                // Only a positive "this message does not exist" justifies reposting. A transient 500
                // must not spawn a second challenge embed halfway through the week.
                if ((err as { code?: number }).code !== UNKNOWN_MESSAGE) throw err;

                forgetThrottle(fresh.messageId);
                Logger.info(`Community embed for ${fresh.guildId} was deleted; reposting`, CTX);
                await postCommunityPanel(client, fresh);
            }
        });
    })();
}

/** The final render: completion state and the top five, then no further edits. */
export async function finalizeCommunityPanel(client: Client, challenge: ICommunityChallenge): Promise<void> {
    if (!challenge.channelId || !challenge.messageId) return;

    forgetThrottle(challenge.messageId);

    const channel = await client.channels.fetch(challenge.channelId).catch(() => null);
    if (!channel?.isTextBased() || channel.isDMBased()) return;

    const top = await CommunityChallengeRepository.topContributors(challenge.guildId, challenge.weekKey, 5);

    const message = await (channel as TextChannel).messages.fetch(challenge.messageId).catch(() => null);
    if (!message) return;

    await message.edit({ embeds: [buildCommunityEmbed({ challenge, top })] }).catch(err =>
        Logger.warn(`Could not finalize community embed for ${challenge.guildId}: ${err}`, CTX)
    );
}
