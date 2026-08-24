import { STAFF_ACTION_SEVERITY, type DiscordLogRequest, type StaffAction } from "@sdk";
import { COLORS } from "@constants";
import { MinecraftConfigRepository } from "@database/repositories";
import { Logger } from "@logger";
import { TtlCache } from "../lib/ttl-cache";
import { mainBotToken } from "../lib/bot-token";

const CTX = "minecraft-api";
const DISCORD_API = "https://discord.com/api/v10";

/** Embed accent per severity band, so a jail and a freeze are distinguishable at a glance. */
const SEVERITY_COLOR: Record<"info" | "success" | "warning" | "danger", number> = {
    info: COLORS.info,
    success: COLORS.success,
    warning: COLORS.warning,
    danger: COLORS.moderation,
};

/** Human titles for the embed. Nothing here is hardcoded in the plugin, which sends only an action. */
const ACTION_TITLE: Record<StaffAction, string> = {
    report_claimed: "Report Claimed",
    report_accepted: "Report Accepted",
    report_refused: "Report Refused",
    report_closed: "Report Closed",
    report_dismissed: "Report Dismissed",
    staff_added: "Staff Member Added",
    staff_promoted: "Staff Promoted",
    staff_demoted: "Staff Demoted",
    staff_role_changed: "Staff Role Changed",
    staff_fired: "Staff Member Removed",
    staff_enabled: "Staff Mode Enabled",
    staff_disabled: "Staff Mode Disabled",
    freeze: "Player Frozen",
    unfreeze: "Player Unfrozen",
    jail: "Player Jailed",
    release: "Player Released",
    teleport: "Staff Teleport",
    inventory_inspect: "Inventory Inspected",
    enderchest_inspect: "Ender Chest Inspected",
    player_report: "Player Report",
    warning_added: "Warning Issued",
    warning_removed: "Warning Removed",
    note_added: "Staff Note Added",
    role_sync: "Roles Synchronised",
    player_linked: "Account Linked",
    player_unlinked: "Account Unlinked",
    coins_sold: "Items Sold",
    server_started: "Server Started",
    server_stopped: "Server Stopped",
    plugin_loaded: "Plugin Loaded",
    plugin_error: "Plugin Error",
    api_error: "API Error",
    auth_failure: "Authentication Failure",
};

/** Config is read on every log write; caching it keeps a busy server off Mongo for that lookup. */
const configCache = new TtlCache<{ targets: Map<string, { channelId?: string; webhookUrl?: string }>; fallback?: string }>(
    30_000,
);

function botToken(): string | null {
    return mainBotToken();
}

/**
 * Renders and delivers the Discord audit embeds.
 *
 * The plugin names an *action*, never a channel: the destination is resolved here from the guild's
 * configuration. That is what keeps every Discord id out of the plugin's config files, and it means
 * re-pointing a log stream is a Discord-side edit rather than a server restart.
 */
export class DiscordLogService {
    private static async targets(guildId: string) {
        return configCache.resolve(guildId, async () => {
            const config = await MinecraftConfigRepository.get(guildId);
            const targets = new Map<string, { channelId?: string; webhookUrl?: string }>();

            for (const target of config?.logTargets ?? []) {
                if (!target.enabled) continue;
                targets.set(target.action, { channelId: target.channelId, webhookUrl: target.webhookUrl });
            }

            return { targets, fallback: config?.defaultLogChannelId };
        });
    }

    static invalidate(guildId: string): void {
        configCache.invalidate(guildId);
    }

    /**
     * Delivers one embed. Never throws into the caller: a Discord outage must not fail the
     * moderation action that produced the log, which is already committed to Mongo by this point.
     */
    static async publish(input: DiscordLogRequest): Promise<void> {
        try {
            const { targets, fallback } = await this.targets(input.guildId);
            const target = targets.get(input.action);

            const embed = this.buildEmbed(input);

            if (target?.webhookUrl) {
                await this.sendWebhook(target.webhookUrl, embed);
                return;
            }

            const channelId = target?.channelId ?? fallback;
            if (!channelId) return;

            await this.sendChannel(channelId, embed);
        } catch (error) {
            Logger.warn(`Failed to publish "${input.action}" log embed: ${error}`, CTX);
        }
    }

    private static buildEmbed(input: DiscordLogRequest): Record<string, unknown> {
        const fields: Array<{ name: string; value: string; inline: boolean }> = [];

        const push = (name: string, value: string | undefined | null, inline = true): void => {
            if (value) fields.push({ name, value, inline });
        };

        push("Server", input.serverName || input.serverId);

        if (input.moderatorUsername || input.moderatorDiscordId) {
            push(
                "Moderator",
                [input.moderatorUsername, input.moderatorDiscordId ? `<@${input.moderatorDiscordId}>` : null]
                    .filter(Boolean)
                    .join(" · "),
            );
        }

        if (input.targetUsername || input.targetDiscordId) {
            push(
                "Player",
                [input.targetUsername, input.targetDiscordId ? `<@${input.targetDiscordId}>` : null]
                    .filter(Boolean)
                    .join(" · "),
            );
        }

        push("Reason", input.reason, false);
        push("Duration", input.duration);
        push("UUID", input.targetUuid ? `\`${input.targetUuid}\`` : null, false);

        for (const [name, value] of Object.entries(input.fields ?? {})) {
            push(name, String(value));
        }

        return {
            title: ACTION_TITLE[input.action] ?? input.action,
            color: SEVERITY_COLOR[STAFF_ACTION_SEVERITY[input.action] ?? "info"],
            fields,
            timestamp: input.occurredAt,
            footer: { text: `${input.serverId}${input.pluginVersion ? ` · v${input.pluginVersion}` : ""}` },
        };
    }

    private static async sendChannel(channelId: string, embed: Record<string, unknown>): Promise<void> {
        const token = botToken();
        if (!token) {
            Logger.warn("No bot token configured — log embeds cannot be delivered to a channel", CTX);
            return;
        }

        await fetch(`${DISCORD_API}/channels/${channelId}/messages`, {
            method: "POST",
            headers: { Authorization: `Bot ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }),
        });
    }

    private static async sendWebhook(webhookUrl: string, embed: Record<string, unknown>): Promise<void> {
        await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ embeds: [embed], allowed_mentions: { parse: [] } }),
        });
    }
}
