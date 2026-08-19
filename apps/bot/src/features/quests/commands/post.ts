import { EmbedBuilder, type GuildMember } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS, QUEST_MESSAGES, QUEST_TIER_SPECS, questRangeBounds } from "@constants";
import { buildQuest } from "@core/quests";
import { hasGuildBotAdmin } from "@bot/utils/access";
import { Logger } from "@logger";
import { postQuest } from "../functions/post-quest";

const CTX = "quests";

/**
 * Posts a Special quest, now.
 *
 * Admin-gated **inside** the handler rather than by the command's `access`, because access is set
 * per command and `/quest` is a member command. The same pattern `/points migrate-coins` uses.
 *
 * Everything about the quest is rolled at this moment — objectives, how many, the reward, the
 * places, the lifetime — so two Specials posted an hour apart are genuinely different quests.
 */
export const post: FeatureSubcommandHandler = async (interaction, client) => {
    const text = QUEST_MESSAGES.post;
    const member = interaction.member as GuildMember | null;

    if (!member || !(await hasGuildBotAdmin(member))) {
        await interaction.editReply({ content: text.adminOnly });
        return;
    }

    const guildId = interaction.guildId!;

    // The cycle key is what makes a quest unique per occasion. A Special has no occasion, so the
    // timestamp is it — two posted in the same minute are still distinct rows.
    const cycleKey = `special#${Date.now()}`;

    const quest = await buildQuest(guildId, "special", cycleKey);

    if (!quest) {
        await interaction.editReply({ content: text.buildFailed });
        return;
    }

    try {
        await postQuest(client, quest);
    } catch (err) {
        Logger.warn(`Posted a special quest for ${guildId} but could not announce it: ${err}`, CTX);
    }

    const spec = QUEST_TIER_SPECS.special;
    const rewardBounds = questRangeBounds(spec.reward);
    const slotBounds = spec.slots === null ? null : questRangeBounds(spec.slots);

    await interaction.editReply({
        embeds: [new EmbedBuilder()
            .setTitle(text.title)
            .setColor(COLORS.success)
            .setDescription(quest.missions.map((mission, index) => text.objective(index, mission.label)).join("\n"))
            .addFields(
                { name: text.rewardField, value: text.rewardValue(quest.reward), inline: true },
                { name: text.placesField, value: text.placesValue(quest.slotsTotal), inline: true },
                { name: text.endsField, value: text.endsValue(quest.endsAt), inline: true },
            )
            .setFooter({ text: text.footer(rewardBounds, slotBounds) })],
    });

    Logger.info(`${member.id} posted a special quest in ${guildId} (${quest.missions.length} missions, ${quest.reward} points)`, CTX);
};
