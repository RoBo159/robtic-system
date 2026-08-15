import type { GuildMember } from "discord.js";
import type { FeatureSubcommandHandler } from "@typings/feature";
import { POINT_MESSAGES } from "@constants";
import { hasGuildBotAdmin } from "@bot/utils/access";
import { PointsRepository } from "@database/repositories";
import { resolveTarget } from "../utils/resolve-target";

/**
 * Grant or deduct by hand.
 *
 * Gated in the handler rather than by `access: "admin"` on the command, because Discord gates whole
 * commands and `/points balance` has to stay open to everyone.
 *
 * A deduction is clamped at the member's balance instead of being refused — an admin clearing
 * someone out should not have to look the number up first, and a negative balance has no meaning
 * anywhere else in the economy.
 */
const adjust = (direction: 1 | -1): FeatureSubcommandHandler =>
    async (interaction, _client) => {
        const member = interaction.member as GuildMember | null;
        if (!member) {
            await interaction.editReply({ content: POINT_MESSAGES.guildOnly });
            return;
        }

        if (!(await hasGuildBotAdmin(member))) {
            await interaction.editReply({ content: POINT_MESSAGES.adminOnly });
            return;
        }

        const guildId = interaction.guildId!;
        const target = await resolveTarget(interaction, true);
        const requested = interaction.options.getInteger("amount", true);
        const reason = interaction.options.getString("reason") ?? "";

        const wallet = await PointsRepository.findOrCreate(guildId, target.user.id, target.user.username);
        const applied = direction === -1 ? -Math.min(wallet.points, requested) : requested;

        if (applied === 0) {
            await interaction.editReply({ content: POINT_MESSAGES.nothingToDeduct(target.displayName) });
            return;
        }

        const updated = await PointsRepository.move({
            guildId,
            discordId: target.user.id,
            username: target.user.username,
            amount: applied,
            source: "admin",
            detail: reason,
            actorId: interaction.user.id,
        });

        await interaction.editReply({
            content: applied > 0
                ? POINT_MESSAGES.granted(target.displayName, applied, updated.points)
                : POINT_MESSAGES.deducted(target.displayName, -applied, updated.points),
        });
    };

export const add = adjust(1);
export const remove = adjust(-1);
