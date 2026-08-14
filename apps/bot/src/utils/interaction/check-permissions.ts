import { MessageFlags, type ChatInputCommandInteraction, type GuildMember, type Interaction } from "discord.js";
import type { CommandConfig } from "@typings/command";
import { SUPER_ADMIN_ID, STAFF_TIER_THRESHOLDS, INTERACTION_MESSAGES } from "@constants";
import { errorEmbed } from "@utils";
import { SuperUserRepository } from "@database/repositories";
import { getMemberLevel, isGuildOperator } from "@bot/utils/access";
import { hasCommandAccessGrant } from "@bot/utils/command-access";
import { scheduleDeletion } from "./schedule-deletion";

export const checkPermissions = async (intract: Interaction, command: CommandConfig): Promise<boolean> => {
    let interaction = intract as ChatInputCommandInteraction;

    if (interaction.user.id === SUPER_ADMIN_ID) return true;

    const member = interaction.member as GuildMember | null;

    // Run concurrently — every ms here before the command's own deferReply() eats into Discord's
    // ~3s ack window. Precedence below is unchanged from the old sequential version.
    const [isWhitelisted, hasGrant] = await Promise.all([
        SuperUserRepository.isWhitelisted(interaction.user.id),
        member && interaction.guildId ? hasCommandAccessGrant(interaction.guildId, interaction.commandName, member) : Promise.resolve(false),
    ]);

    if (isWhitelisted) return true;

    if (!member) {
        await interaction.reply({
            embeds: [errorEmbed(INTERACTION_MESSAGES.guildOnlyCommand)],
            flags: MessageFlags.Ephemeral,
        });
        scheduleDeletion(() => interaction.deleteReply());
        return false;
    }

    if (isGuildOperator(member)) return true;

    // Per-guild /command-access grant — an additional way in, on top of the check below.
    if (hasGrant) return true;

    const { score } = await getMemberLevel(member);

    if (score >= STAFF_TIER_THRESHOLDS.lead) return true;

    if (command.requiredPermission && score < command.requiredPermission) {
        await interaction.reply({
            embeds: [errorEmbed(INTERACTION_MESSAGES.noPermission)],
            flags: MessageFlags.Ephemeral,
        });
        scheduleDeletion(() => interaction.deleteReply());
        return false;
    }

    return true;
};
