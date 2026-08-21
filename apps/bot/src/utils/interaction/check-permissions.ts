import { MessageFlags, type ChatInputCommandInteraction, type GuildMember, type Interaction } from "discord.js";
import type { CommandConfig } from "@typings/command";
import { SUPER_ADMIN_ID, STAFF_TIER_THRESHOLDS, INTERACTION_MESSAGES } from "@constants";
import { errorText } from "@utils";
import { SuperUserRepository } from "@database/repositories";
import { getMemberLevel, isGuildOperator, hasGuildBotAdmin } from "@bot/utils/access";
import { hasCommandAccessGrant } from "@bot/utils/command-access";
import { scheduleDeletion } from "./schedule-deletion";

/**
 * Both entry points reach this: a real interaction, and the duck-typed stand-in
 * build-fake-interaction.ts builds for `!command`. So every check here must read from `member`,
 * never from interaction-only fields like `memberPermissions`, `appPermissions` or `locale` —
 * the stand-in has none of them.
 */
export const checkPermissions = async (
    intract: Interaction,
    command: CommandConfig,
    /**
     * `silent` refuses without replying. Only the bare-shortcut entry point sets it: a one-letter
     * trigger matches ordinary sentences too, so telling every member who starts a message with
     * "l " that they lack permission is noise about a command they never named.
     */
    options?: { silent?: boolean },
): Promise<boolean> => {
    let interaction = intract as ChatInputCommandInteraction;

    const deny = async (reason: string): Promise<false> => {
        if (options?.silent) return false;
        await interaction.reply({ content: errorText(reason), flags: MessageFlags.Ephemeral });
        scheduleDeletion(() => interaction.deleteReply());
        return false;
    };

    if (interaction.user.id === SUPER_ADMIN_ID) return true;

    const member = interaction.member as GuildMember | null;

    const [isWhitelisted, hasGrant] = await Promise.all([
        SuperUserRepository.isWhitelisted(interaction.user.id),
        member && interaction.guildId ? hasCommandAccessGrant(interaction.guildId, interaction.commandName, member) : Promise.resolve(false),
    ]);

    if (command.scope === "admin") {
        return isWhitelisted ? true : deny(INTERACTION_MESSAGES.superUserOnly);
    }

    if (isWhitelisted) return true;

    if (!member) return deny(INTERACTION_MESSAGES.guildOnlyCommand);

    if (isGuildOperator(member)) return true;

    if (hasGrant) return true;

    const { score } = await getMemberLevel(member);

    if (score >= STAFF_TIER_THRESHOLDS.lead) return true;

    if (command.requiredPermission && score < command.requiredPermission) {
        return deny(INTERACTION_MESSAGES.noPermission);
    }

    if (command.access === "admin") {
        return (await hasGuildBotAdmin(member)) ? true : deny(INTERACTION_MESSAGES.serverAdminOnly);
    }

    return true;
};
