import { MessageFlags, type ButtonInteraction, type GuildMember } from "discord.js";
import type { ComponentHandler } from "@typings/command";
import type { BotClient } from "@core/bot-client";
import { QuestRepository } from "@database/repositories";
import { claimQuest } from "@core/quests";
import { Logger } from "@logger";
import { isVipMember } from "../functions/is-vip";
import { refreshQuestMessage } from "../functions/post-quest";

const CTX = "quests";

const FAILURE_TEXT: Record<string, string> = {
    "not-found": "That quest no longer exists.",
    ended: "This quest has already ended.",
    "already-holding": "You are already on a quest of this kind. Finish it, or wait for it to expire.",
    "not-vip": "VIP quests are for members with a VIP role.",
    error: "Something went wrong claiming that. Try again in a moment.",
};

/**
 * Takes a slot on the quest this button belongs to.
 *
 * `deferUpdate` rather than `deferReply`: the button lives on a shared public message, so the reply
 * has to be an ephemeral follow-up while the public message is left for the throttled redraw. The
 * member must never see an optimistic "claimed!" — the reservation happens before any reply text is
 * chosen.
 */
const handler: ComponentHandler<ButtonInteraction> = {
    customId: /^quest:claim:[a-f0-9]{24}$/,
    feature: "quests",

    async run(interaction: ButtonInteraction, client: BotClient) {
        await interaction.deferUpdate();

        const questId = interaction.customId.split(":")[2]!;
        const member = interaction.member as GuildMember | null;

        if (!member) {
            await interaction.followUp({ content: "Quests only work in a server.", flags: MessageFlags.Ephemeral });
            return;
        }

        const quest = await QuestRepository.findById(questId);
        if (!quest) {
            await interaction.followUp({ content: FAILURE_TEXT["not-found"]!, flags: MessageFlags.Ephemeral });
            return;
        }

        if (quest.tier === "vip" && !(await isVipMember(member))) {
            await interaction.followUp({ content: FAILURE_TEXT["not-vip"]!, flags: MessageFlags.Ephemeral });
            return;
        }

        const result = await claimQuest(quest, member.id, member.user.username);

        if (!result.ok) {
            const text = result.reason === "full"
                ? `Every slot was taken${result.slotsTotal ? ` — all ${result.slotsTotal} of them` : ""}.`
                : FAILURE_TEXT[result.reason ?? "error"] ?? FAILURE_TEXT.error!;

            await interaction.followUp({ content: text, flags: MessageFlags.Ephemeral });
            // Redraw anyway: if it filled up, the public message is now wrong.
            refreshQuestMessage(client, questId);
            return;
        }

        const objectives = quest.missions.map(mission => `• ${mission.label}`).join("\n");

        await interaction.followUp({
            content:
                `**Claimed.** Progress tracks automatically — there is nothing else to run.\n\n${objectives}\n\n` +
                `Reward: **${quest.reward.toLocaleString()}** points · ends <t:${Math.floor(quest.endsAt.getTime() / 1000)}:R>`,
            flags: MessageFlags.Ephemeral,
        });

        refreshQuestMessage(client, questId);
        Logger.debug(`${member.id} claimed ${quest.tier} quest ${questId}`, CTX);
    },
};

export default handler;
