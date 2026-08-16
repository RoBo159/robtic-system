import { EmbedBuilder, type GuildMember } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { COLORS, QUEST_TIERS, TIER_SLOT, type QuestTier } from "@constants";
import { QuestRepository, QuestClaimRepository } from "@database/repositories";
import { isVipMember } from "../functions/is-vip";
import { tierTitle } from "../utils/quest-lines";

/** Everything claimable in this guild right now, annotated with what this member can do about it. */
export const board: FeatureSubcommandHandler = async (interaction, _client) => {
    const guildId = interaction.guildId!;
    const member = interaction.member as GuildMember | null;

    const [quests, claims] = await Promise.all([
        QuestRepository.findOpen(guildId),
        QuestClaimRepository.findActiveForMember(guildId, interaction.user.id),
    ]);

    if (quests.length === 0) {
        await interaction.editReply({
            embeds: [new EmbedBuilder()
                .setTitle("Quest board")
                .setColor(COLORS.info)
                .setDescription(
                    "Nothing is open at the moment.\n\n" +
                    "Quests appear at unannounced times inside the server's generation windows — " +
                    "check back later, or watch the quest channel."
                )],
        });
        return;
    }

    const isVip = member ? await isVipMember(member) : false;
    const heldQuestIds = new Set(claims.map(claim => String(claim.questId)));
    const busySlots = new Set(claims.map(claim => claim.slot));

    // Display order is tier order, not generation order: a member scanning the board wants the
    // rare ones to sit where they expect them, not wherever the scheduler happened to fire.
    const ordered = [...quests].sort(
        (a, b) => QUEST_TIERS.indexOf(a.tier as QuestTier) - QUEST_TIERS.indexOf(b.tier as QuestTier)
    );

    const embed = new EmbedBuilder()
        .setTitle("Quest board")
        .setColor(COLORS.activity)
        .setFooter({ text: "Claim from the quest's own message — progress then tracks itself." });

    for (const quest of ordered.slice(0, 20)) {
        const tier = quest.tier as QuestTier;

        const status = heldQuestIds.has(String(quest._id))
            ? "✅ Claimed"
            : tier === "vip" && !isVip
                ? "🔒 VIP members only"
                : quest.slotsRemaining <= 0
                    ? "❌ Full"
                    : busySlots.has(TIER_SLOT[tier])
                        ? "⏳ Finish your current quest of this kind first"
                        : "🟩 Open to you";

        const slots = quest.slotsTotal === null
            ? "unlimited slots"
            : `${quest.slotsRemaining}/${quest.slotsTotal} slots left`;

        const link = quest.channelId && quest.messageId
            ? ` · [go to it](https://discord.com/channels/${guildId}/${quest.channelId}/${quest.messageId})`
            : "";

        embed.addFields({
            name: `${tierTitle(tier)} — ${quest.reward.toLocaleString()} points`,
            value:
                `${quest.missions.map(mission => `• ${mission.label}`).join("\n")}\n` +
                `${status} · ${slots} · ends <t:${Math.floor(quest.endsAt.getTime() / 1000)}:R>${link}`,
        });
    }

    await interaction.editReply({ embeds: [embed] });
};
