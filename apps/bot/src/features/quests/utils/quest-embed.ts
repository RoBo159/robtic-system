import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import type { IQuest } from "@database/models";
import { COLORS } from "@constants";
import { QUEST_TIER_SPECS, type QuestTier } from "@constants";

export const TIER_EMOJI: Record<QuestTier, string> = {
    easy: "🟢",
    normal: "🔵",
    hard: "🟣",
    golden: "🌟",
    vip: "💎",
};

const TIER_COLOR: Record<QuestTier, number> = {
    easy: COLORS.success,
    normal: COLORS.info,
    hard: COLORS.warning,
    golden: 0xf5c518,
    vip: 0x9b8cff,
};

export const claimButtonId = (questId: string): string => `quest:claim:${questId}`;

/** The posted quest board entry. Re-rendered on every claim, through the edit throttle. */
export function buildQuestEmbed(quest: IQuest): EmbedBuilder {
    const tier = quest.tier as QuestTier;
    const slots = quest.slotsTotal === null
        ? "Unlimited"
        : `${quest.slotsRemaining} of ${quest.slotsTotal} left`;

    const missions = quest.missions
        .map((mission, index) => `\`${index + 1}.\` ${mission.label}`)
        .join("\n");

    return new EmbedBuilder()
        .setTitle(`${TIER_EMOJI[tier]} ${tier.charAt(0).toUpperCase() + tier.slice(1)} Quest`)
        .setColor(TIER_COLOR[tier])
        .setDescription(missions || "No objectives.")
        .addFields(
            { name: "Reward", value: `🎯 ${quest.reward.toLocaleString()} points`, inline: true },
            { name: "Slots", value: slots, inline: true },
            // Rendered client-side, so the countdown never costs an edit.
            { name: "Ends", value: `<t:${Math.floor(quest.endsAt.getTime() / 1000)}:R>`, inline: true },
        )
        .setFooter({
            text: tier === "vip"
                ? "VIP members only — claim to start tracking"
                : `${QUEST_TIER_SPECS[tier].missions === 1 ? "One objective" : `${quest.missions.length} objectives`} · progress is automatic once claimed`,
        })
        .setTimestamp(quest.endsAt);
}

/** The claim row. Disabled once the quest is full or over, so a stale message reads honestly. */
export function buildQuestButtons(quest: IQuest): ActionRowBuilder<ButtonBuilder> {
    const closed = quest.status !== "open"
        || quest.endsAt.getTime() <= Date.now()
        || quest.slotsRemaining <= 0;

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(claimButtonId(String(quest._id)))
            .setLabel(closed ? "Closed" : "Claim")
            .setStyle(closed ? ButtonStyle.Secondary : ButtonStyle.Success)
            .setDisabled(closed),
    );
}
