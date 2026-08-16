import type { Client, TextChannel } from "discord.js";
import type { IQuest } from "@database/models";
import { mentionRoleFor } from "@database/models";
import { QuestRepository, QuestSettingsRepository } from "@database/repositories";
import { COMMUNITY_CONFIG, type QuestTier } from "@constants";
import { Logger } from "@logger";
import { buildQuestEmbed, buildQuestButtons } from "../utils/quest-embed";
import { scheduleEdit } from "../utils/edit-throttle";

const CTX = "quests";

/** Where a tier is announced. VIP falls back to the daily channel, as specified. */
async function resolveChannel(client: Client, quest: IQuest): Promise<TextChannel | null> {
    const settings = await QuestSettingsRepository.getCached(quest.guildId);

    const channelId = quest.tier === "vip"
        ? settings.vipChannelId ?? settings.dailyChannelId
        : settings.dailyChannelId;

    if (!channelId) return null;

    const channel = await client.channels.fetch(channelId).catch(() => null);
    return channel?.isTextBased() && !channel.isDMBased() ? channel as TextChannel : null;
}

/** Posts a freshly generated quest and remembers the message so it can be kept up to date. */
export async function postQuest(client: Client, quest: IQuest): Promise<void> {
    const channel = await resolveChannel(client, quest);
    if (!channel) {
        Logger.debug(`No quest channel configured for ${quest.guildId}; ${quest.tier} quest posted nowhere`, CTX);
        return;
    }

    const settings = await QuestSettingsRepository.getCached(quest.guildId);
    const roleId = mentionRoleFor(settings, quest.tier as QuestTier);

    const message = await channel.send({
        content: roleId ? `<@&${roleId}>` : undefined,
        embeds: [buildQuestEmbed(quest)],
        components: [buildQuestButtons(quest)],
        allowedMentions: roleId ? { roles: [roleId] } : { parse: [] },
    });

    await QuestRepository.setMessage(quest._id, channel.id, message.id);
}

/**
 * Redraws a posted quest after a claim.
 *
 * Through the throttle, because the slot counter changes on every claim and ten members claiming in
 * five seconds should cost one edit rather than ten.
 */
export function refreshQuestMessage(client: Client, questId: string): void {
    void (async () => {
        const quest = await QuestRepository.findById(questId);
        if (!quest?.channelId || !quest.messageId) return;

        const messageId = quest.messageId;

        scheduleEdit(messageId, COMMUNITY_CONFIG.editMinMs, async () => {
            const fresh = await QuestRepository.findById(questId);
            if (!fresh?.channelId || !fresh.messageId) return;

            const channel = await client.channels.fetch(fresh.channelId).catch(() => null);
            if (!channel?.isTextBased() || channel.isDMBased()) return;

            const message = await (channel as TextChannel).messages.fetch(fresh.messageId);
            await message.edit({
                embeds: [buildQuestEmbed(fresh)],
                components: [buildQuestButtons(fresh)],
            });
        });
    })();
}
