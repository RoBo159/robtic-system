import type { GuildMember } from "discord.js";
import type { BotClient } from "@core/bot-client";
import type { CommandConfig } from "@typings/command";
import { DEFAULT_PREFIX, STAFF_TIER_THRESHOLDS } from "@constants";
import {
    ServerConfigRepository,
    SuperUserRepository,
    CommandAccessRepository,
    ShortcutRepository,
    StaffTierRepository,
} from "@database/repositories";
import { listFeatureManifests, isFeatureEnabled } from "@core/features";
import { getMemberLevel, isGuildOperator, hasGuildBotAdmin } from "@bot/utils/access";
import { isChatInputCommand } from "./command-usage";

export interface HelpContext {
    prefix: string;
    guildId: string | null;
    /** Admin-scoped commands are only listed for people who can actually run them. */
    isSuperUser: boolean;
    /** Feature key → whether it is switched on in this guild. */
    featureState: Map<string, boolean>;
    /**
     * Command target (`warn add`, or a channel-utility key like `clear`) → the triggers this viewer
     * may use for it. Restricted triggers they cannot use are left out, since listing them only
     * teaches a member a phrase that will silently do nothing.
     */
    shortcutsByTarget: Map<string, string[]>;
    /**
     * Whether this viewer may actually run the command.
     *
     * Help used to hide only admin-scoped commands, so every moderation command was advertised to
     * every member — a list of things they will be refused. Synchronous because the category
     * dropdown redraws on every selection; everything it needs is resolved once, up front.
     */
    canRun: (command: CommandConfig) => boolean;
}

/**
 * Everything the help views need about *this* viewer in *this* guild.
 *
 * Resolved once per invocation and threaded through, rather than re-read by each builder: the
 * dropdown redraws on every selection, and re-querying the prefix and every feature's state on
 * each redraw would turn browsing help into a stream of database round trips.
 */
export async function buildHelpContext(
    client: BotClient,
    guildId: string | null,
    userId: string,
    member: GuildMember | null = null,
): Promise<HelpContext> {
    const [prefix, isSuperUser, grants, shortcuts] = await Promise.all([
        guildId ? ServerConfigRepository.getPrefix(guildId) : Promise.resolve(null),
        SuperUserRepository.isWhitelisted(userId),
        guildId ? CommandAccessRepository.getCached(guildId) : Promise.resolve([]),
        guildId ? ShortcutRepository.listCached(guildId) : Promise.resolve([]),
    ]);

    const featureState = new Map<string, boolean>();
    if (guildId) {
        for (const manifest of listFeatureManifests()) {
            featureState.set(manifest.key, await isFeatureEnabled(guildId, manifest.key));
        }
    }

    // The three viewer facts checkPermissions derives per invocation, read once here instead.
    const isOperator = member ? isGuildOperator(member) : false;
    const score = member ? (await getMemberLevel(member)).score : 0;
    const isBotAdmin = member ? await hasGuildBotAdmin(member) : false;

    const tiers = guildId ? await StaffTierRepository.getCached(guildId) : [];
    const grantedCommands = new Set<string>();
    if (member) {
        for (const grant of grants) {
            const byRole = grant.allowedRoleIds.some(id => member.roles.cache.has(id));
            const byTier = grant.allowedCategoryKeys.length
                ? tiers.some(tier =>
                    grant.allowedCategoryKeys.includes(tier.key) && tier.roleIds.some(id => member.roles.cache.has(id)))
                : false;
            if (byRole || byTier) grantedCommands.add(grant.commandName);
        }
    }

    // Mirrors checkPermissions' grant order exactly. Kept in step deliberately: a command listed
    // here that then refuses the reader is worse than one that was never listed.
    const canRun = (command: CommandConfig): boolean => {
        if (isSuperUser) return true;
        if (command.scope === "admin") return false;
        if (isOperator) return true;
        if (grantedCommands.has((command.data as { name: string }).name)) return true;
        if (score >= STAFF_TIER_THRESHOLDS.lead) return true;
        if (command.requiredPermission && score < command.requiredPermission) return false;
        if (command.access === "admin") return isBotAdmin;
        return true;
    };

    const shortcutsByTarget = new Map<string, string[]>();
    for (const shortcut of shortcuts) {
        if (!shortcut.enabled) continue;
        if (shortcut.allowedRoleIds.length && !member) continue;
        if (shortcut.allowedRoleIds.length && !shortcut.allowedRoleIds.some(id => member!.roles.cache.has(id))) continue;

        const bucket = shortcutsByTarget.get(shortcut.command) ?? [];
        bucket.push(shortcut.trigger);
        shortcutsByTarget.set(shortcut.command, bucket);
    }

    return { prefix: prefix ?? DEFAULT_PREFIX, guildId, isSuperUser, featureState, shortcutsByTarget, canRun };
}

/** True when this command's owning feature is switched off here. */
export function isFromDisabledFeature(command: CommandConfig, context: HelpContext): boolean {
    if (!command.feature) return false;
    return context.featureState.get(command.feature) === false;
}

/**
 * The commands worth showing this viewer.
 *
 * Context-menu entries are dropped because they have no typed form to document, and anything the
 * reader would be refused is dropped too — an admin-scoped command is registered only to the admin
 * guild, and a moderation command listed to a member is a menu of refusals.
 *
 * Commands from a disabled feature are kept, and marked. Hiding them would leave an admin no way to
 * discover what turning the feature on would give them.
 */
export function visibleCommands(client: BotClient, context: HelpContext): CommandConfig[] {
    return [...client.commands.values()].filter(command => {
        if (!isChatInputCommand(command)) return false;
        return context.canRun(command);
    });
}
