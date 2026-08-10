import { Events, type GuildMember } from "discord.js";
import { StreakRepository } from "@database/repositories";
import { applyStreakRole } from "../utils/streak-role";
import { handleError, BotError } from "@core/handlers";

export default {
    name: Events.GuildMemberUpdate,

    async execute(oldMember: GuildMember, newMember: GuildMember) {
        const wasTimedOut = (oldMember.communicationDisabledUntilTimestamp ?? 0) > Date.now();
        const isTimedOut = (newMember.communicationDisabledUntilTimestamp ?? 0) > Date.now();
        if (wasTimedOut || !isTimedOut) return;

        try {
            const record = await StreakRepository.find(newMember.id, newMember.guild.id);
            if (!record || !record.active) return;

            await StreakRepository.expire(newMember.id, newMember.guild.id);
            await applyStreakRole(newMember, 0);
        } catch (err) {
            handleError(new BotError(`Failed to reset streak on timeout: ${err}`, "EVENT"), "main/streak-timeout-reset");
        }
    },
};
