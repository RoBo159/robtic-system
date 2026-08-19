import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import type { IQuest } from "@database/models";
import { COLORS, QUEST_MESSAGES, type QuestTier } from "@constants";

const TIER_COLOR: Record<QuestTier, number> = {
    easy: COLORS.success,
    normal: COLORS.info,
    hard: 0x8b5cf6,
    golden: 0xf5c518,
    vip: 0x9b8cff,
    special: 0xff5f9e,
};

const SLOT_BAR_WIDTH = 10;

export const claimButtonId = (questId: string): string => `quest:claim:${questId}`;

/** `▰▰▰▱▱▱▱▱▱▱` — how full the quest is, so scarcity is visible at a glance rather than as a number. */
function slotBar(taken: number, total: number): string {
    if (total <= 0) return "";
    const filled = Math.max(0, Math.min(SLOT_BAR_WIDTH, Math.round((taken / total) * SLOT_BAR_WIDTH)));
    return `${"▰".repeat(filled)}${"▱".repeat(SLOT_BAR_WIDTH - filled)}`;
}

/**
 * How many places are left, in the words a member reads first.
 *
 * The remaining count leads, because that is the number that decides whether to click. The bar and
 * the total follow it.
 */
function slotsValue(quest: IQuest): string {
    const card = QUEST_MESSAGES.card;
    if (quest.slotsTotal === null) return card.placesUnlimited;

    const left = Math.max(0, quest.slotsRemaining);
    if (left === 0) return card.placesFull(quest.slotsTotal);

    return card.placesLeft(left, quest.slotsTotal, slotBar(quest.slotsTaken, quest.slotsTotal));
}

/**
 * The posted quest card. Re-rendered on every claim, through the edit throttle.
 *
 * Objectives are numbered lines in the description rather than fields: fields wrap into columns at
 * unpredictable widths, and a four-objective Hard quest ends up reading as a grid of fragments.
 */
export function buildQuestEmbed(quest: IQuest): EmbedBuilder {
    const card = QUEST_MESSAGES.card;
    const tier = quest.tier as QuestTier;
    const closed = quest.status !== "open" || quest.endsAt.getTime() <= Date.now();

    const objectives = quest.missions
        .map((mission, index) => card.objective(index, mission.label))
        .join("\n");

    const embed = new EmbedBuilder()
        .setAuthor({ name: card.author(tier) })
        .setTitle(card.title(tier))
        .setColor(TIER_COLOR[tier])
        .setDescription(
            `${objectives || card.noObjectives}\n` +
            `​`
        )
        .addFields(
            { name: card.rewardField, value: card.rewardValue(quest.reward), inline: true },
            { name: card.placesField, value: slotsValue(quest), inline: true },
            {
                name: card.endsField(closed),
                // Client-rendered, so the countdown stays right without ever costing an edit.
                value: card.endsValue(quest.endsAt),
                inline: true,
            },
        );

    embed.setFooter({ text: card.footer(card.objectiveCount(quest.missions.length), tier) });

    return embed;
}

/**
 * The claim row.
 *
 * The label carries the remaining count so the button itself answers "is it worth clicking" — the
 * embed and the button are edited together, so they cannot disagree.
 */
export function buildQuestButtons(quest: IQuest): ActionRowBuilder<ButtonBuilder> {
    const button = QUEST_MESSAGES.button;

    const closed = quest.status !== "open"
        || quest.endsAt.getTime() <= Date.now()
        || quest.slotsRemaining <= 0;

    const label = closed
        ? quest.slotsRemaining <= 0 && quest.status === "open" ? button.full : button.closed
        : quest.slotsTotal === null
            ? button.claim
            : button.claimWithSlots(quest.slotsRemaining);

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(claimButtonId(String(quest._id)))
            .setLabel(label)
            .setEmoji(closed ? button.closedEmoji : button.openEmoji)
            .setStyle(closed ? ButtonStyle.Secondary : ButtonStyle.Success)
            .setDisabled(closed),
    );
}
