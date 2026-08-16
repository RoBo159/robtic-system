import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import type { IQuest } from "@database/models";
import { COLORS, QUEST_TIER_SPECS, type QuestTier } from "@constants";

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
    hard: 0x8b5cf6,
    golden: 0xf5c518,
    vip: 0x9b8cff,
};

/** How the tier is announced above the title. Rarity is the whole appeal of the top two. */
const TIER_BADGE: Record<QuestTier, string> = {
    easy: "DAILY QUEST",
    normal: "DAILY QUEST",
    hard: "RARE QUEST",
    golden: "LEGENDARY QUEST",
    vip: "VIP QUEST",
};

const SLOT_BAR_WIDTH = 10;

export const claimButtonId = (questId: string): string => `quest:claim:${questId}`;

const tierName = (tier: QuestTier): string =>
    tier === "vip" ? "VIP" : tier.charAt(0).toUpperCase() + tier.slice(1);

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
    if (quest.slotsTotal === null) return "♾️ Unlimited — every VIP may claim";

    const left = Math.max(0, quest.slotsRemaining);
    if (left === 0) return `🚫 **Full** — all ${quest.slotsTotal} taken`;

    return `**${left}** of ${quest.slotsTotal} left\n\`${slotBar(quest.slotsTaken, quest.slotsTotal)}\``;
}

/**
 * The posted quest card. Re-rendered on every claim, through the edit throttle.
 *
 * Objectives are numbered lines in the description rather than fields: fields wrap into columns at
 * unpredictable widths, and a four-objective Hard quest ends up reading as a grid of fragments.
 */
export function buildQuestEmbed(quest: IQuest): EmbedBuilder {
    const tier = quest.tier as QuestTier;
    const closed = quest.status !== "open" || quest.endsAt.getTime() <= Date.now();

    const objectives = quest.missions
        .map((mission, index) => `\`${index + 1}\`  ${mission.label}`)
        .join("\n");

    const embed = new EmbedBuilder()
        .setAuthor({ name: `${TIER_EMOJI[tier]}  ${TIER_BADGE[tier]}` })
        .setTitle(`${tierName(tier)} Quest`)
        .setColor(TIER_COLOR[tier])
        .setDescription(
            `${objectives || "No objectives."}\n` +
            `​`
        )
        .addFields(
            { name: "Reward", value: `🎯 **${quest.reward.toLocaleString()}** points`, inline: true },
            { name: "Places", value: slotsValue(quest), inline: true },
            {
                name: closed ? "Ended" : "Ends",
                // Client-rendered, so the countdown stays right without ever costing an edit.
                value: `<t:${Math.floor(quest.endsAt.getTime() / 1000)}:R>`,
                inline: true,
            },
        );

    const objectiveCount = QUEST_TIER_SPECS[tier].missions === 1 ? "One objective" : `${quest.missions.length} objectives`;

    embed.setFooter({
        text: tier === "vip"
            ? `${objectiveCount} · VIP members only · progress tracks itself once claimed`
            : `${objectiveCount} · progress tracks itself once claimed · /quest to see yours`,
    });

    return embed;
}

/**
 * The claim row.
 *
 * The label carries the remaining count so the button itself answers "is it worth clicking" — the
 * embed and the button are edited together, so they cannot disagree.
 */
export function buildQuestButtons(quest: IQuest): ActionRowBuilder<ButtonBuilder> {
    const closed = quest.status !== "open"
        || quest.endsAt.getTime() <= Date.now()
        || quest.slotsRemaining <= 0;

    const label = closed
        ? quest.slotsRemaining <= 0 && quest.status === "open" ? "Full" : "Closed"
        : quest.slotsTotal === null
            ? "Claim"
            : `Claim · ${quest.slotsRemaining} left`;

    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(claimButtonId(String(quest._id)))
            .setLabel(label)
            .setEmoji(closed ? "🔒" : "⚔️")
            .setStyle(closed ? ButtonStyle.Secondary : ButtonStyle.Success)
            .setDisabled(closed),
    );
}
