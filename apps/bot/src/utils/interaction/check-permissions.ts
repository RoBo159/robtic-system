import { MessageFlags, type ChatInputCommandInteraction, type GuildMember, type Interaction } from "discord.js";
import type { CommandConfig } from "@typings/command";
import { SUPER_ADMIN_ID, STAFF_TIER_THRESHOLDS, INTERACTION_MESSAGES } from "@constants";
import { errorEmbed } from "@utils";
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
        await interaction.reply({ embeds: [errorEmbed(reason)], flags: MessageFlags.Ephemeral });
        scheduleDeletion(() => interaction.deleteReply());
        return false;
    };

    if (interaction.user.id === SUPER_ADMIN_ID) return true;

    const member = interaction.member as GuildMember | null;

    // Run concurrently — every ms here before the command's own deferReply() eats into Discord's
    // ~3s ack window. Precedence below is unchanged from the old sequential version.
    const [isWhitelisted, hasGrant] = await Promise.all([
        SuperUserRepository.isWhitelisted(interaction.user.id),
        member && interaction.guildId ? hasCommandAccessGrant(interaction.guildId, interaction.commandName, member) : Promise.resolve(false),
    ]);

    // A hard gate, and the reason it sits above the whitelist short-circuit rather than beside it:
    // nothing below may grant an admin-scoped command. Not isGuildOperator, not a /command-access
    // grant, not a lead-tier score. Only the bot owner (above) and super users get through.
    // Above the guild-only branch too, so a super user can run these in DMs and everyone else is
    // told the real reason instead of a misleading "server only".
    if (command.scope === "admin") {
        return isWhitelisted ? true : deny(INTERACTION_MESSAGES.superUserOnly);
    }

    if (isWhitelisted) return true;

    if (!member) return deny(INTERACTION_MESSAGES.guildOnlyCommand);

    if (isGuildOperator(member)) return true;

    // Per-guild /command-access grant — an additional way in, on top of the checks below.
    if (hasGrant) return true;

    const { score } = await getMemberLevel(member);

    if (score >= STAFF_TIER_THRESHOLDS.lead) return true;

    if (command.requiredPermission && score < command.requiredPermission) {
        return deny(INTERACTION_MESSAGES.noPermission);
    }

    // Last, because everything above is a grant — reaching here means no grant matched. Under
    // `access: "admin"` that has to become a refusal rather than the permissive fallthrough an
    // untagged command still gets. isGuildOperator already admitted Administrators, so in practice
    // this only adds the per-guild botAdminRoles path.
    if (command.access === "admin") {
        return (await hasGuildBotAdmin(member)) ? true : deny(INTERACTION_MESSAGES.serverAdminOnly);
    }

    return true;
};
