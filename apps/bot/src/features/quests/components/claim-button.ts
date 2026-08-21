import { MessageFlags, type ButtonInteraction, type GuildMember } from "discord.js";
import type { ComponentHandler } from "@typings/command";
import type { BotClient } from "@core/bot-client";
import { QUEST_MESSAGES } from "@constants";
import { QuestRepository } from "@database/repositories";
import { claimQuest } from "@core/quests";
import { Logger } from "@logger";
import { isVipMember } from "../functions/is-vip";
import { refreshQuestMessage } from "../functions/post-quest";

const CTX = "quests";

const TEXT = QUEST_MESSAGES.claim;
const FAILURE_TEXT = TEXT.failure;

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
            await interaction.followUp({ content: TEXT.guildOnly, flags: MessageFlags.Ephemeral });
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
                ? TEXT.full(result.slotsTotal)
                : FAILURE_TEXT[result.reason ?? "error"] ?? FAILURE_TEXT.error!;

            await interaction.followUp({ content: text, flags: MessageFlags.Ephemeral });
            refreshQuestMessage(client, questId);
            return;
        }

        const objectives = quest.missions.map(mission => TEXT.objective(mission.label)).join("\n");

        await interaction.followUp({
            content: TEXT.claimed(objectives, quest.reward, quest.endsAt),
            flags: MessageFlags.Ephemeral,
        });

        refreshQuestMessage(client, questId);
        Logger.debug(`${member.id} claimed ${quest.tier} quest ${questId}`, CTX);
    },
};

export default handler;
