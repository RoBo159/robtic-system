import type { Guild } from "discord.js";
import { SECURITY_MESSAGES } from "@constants";
import type { SecurityActionType } from "../config";
import { getModerationSecurityConfig } from "./get-moderation-security-config";

/** Runs one configured response to a tripped rule, returning an `ok:`/`skip:`/`failed:` outcome string for the alert embed. */
export async function applyAction(
    action: SecurityActionType,
    guild: Guild,
    executorId: string,
): Promise<string> {
    const member = guild.members.cache.get(executorId) ?? await guild.members.fetch(executorId).catch(() => null);
    if (!member) return `failed:${action}:member_not_found`;

    if (action === "send_alert") return "ok:send_alert";

    if (action === "remove_role") {
        const config = await getModerationSecurityConfig(guild.id);
        const configuredRoles = config.settings.rolesToStrip;

        let targetRoles = member.roles.cache.filter((role) => !role.managed && role.id !== guild.id);
        if (configuredRoles.length > 0) {
            targetRoles = targetRoles.filter((role) => configuredRoles.includes(role.id));
        }

        if (targetRoles.size === 0) return "skip:remove_role:none";

        await member.roles.remove(targetRoles).catch(() => null);
        return `ok:remove_role:${targetRoles.size}`;
    }

    if (action === "kick") {
        if (!member.kickable) return "failed:kick:not_kickable";
        await member.kick(SECURITY_MESSAGES.thresholdReason).catch(() => null);
        return "ok:kick";
    }

    if (!guild.members.me?.permissions.has("BanMembers")) {
        return "failed:ban:no_permission";
    }

    await guild.members.ban(executorId, { reason: SECURITY_MESSAGES.thresholdReason }).catch(() => null);
    return "ok:ban";
}
