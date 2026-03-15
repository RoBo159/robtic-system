import { BOT_DEFINITIONS } from "@core/config";
import { Logger } from "@core/libs";
import { ServerConfigRepository } from "@database/repositories";
import { EmbedBuilder, type Channel, type Client, type Message } from "discord.js";
import mongoose from "mongoose";
import os from "os";
import { BOT_STATUSES } from "./botStatus";

const PANEL_KEY = "system_status";
const SERVER_TARGET = "core.robtic.org";
const PANEL_REFRESH_MS = 30_000;
const CORE_REACHABILITY_CHECK_MS = 20_000;

const COLORS: Record<StatusType, number> = {
    STARTING: 0xf39c12,
    HEALTHY: 0x2ecc71,
    DEGRADED: 0xf1c40f,
    OFFLINE: 0xe74c3c,
};

const ICONS: Record<StatusType, string> = {
    STARTING: "🟠",
    HEALTHY: "🟢",
    DEGRADED: "🟡",
    OFFLINE: "🔴",
};

const BOT_LAST_UPDATED = new Map<BotName, number>();

type ServiceStatus = {
    key: string;
    label: string;
    status: StatusType;
    message?: string;
    details?: string[];
    updatedAt: number;
};

const SERVICE_STATUSES = new Map<string, ServiceStatus>([
    [
        "crash-monitor",
        {
            key: "crash-monitor",
            label: "Crash Monitor (monitor/crash-monitor.ts)",
            status: "STARTING",
            message: "Waiting for first heartbeat",
            updatedAt: Date.now(),
        },
    ],
    [
        "memory-monitor",
        {
            key: "memory-monitor",
            label: "Memory Monitor (monitor/memory-monitor.ts)",
            status: "STARTING",
            message: "Waiting for memory checks",
            updatedAt: Date.now(),
        },
    ],
]);

let statusClient: Client | null = null;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let refreshHandle: ReturnType<typeof setTimeout> | null = null;
let refreshInFlight = false;
let coreReachabilityHandle: ReturnType<typeof setInterval> | null = null;

type CoreSnapshot = {
    status: StatusType;
    line: string;
    details: string[];
    checkedAt: number;
};

let latestCoreSnapshot: CoreSnapshot = {
    status: "STARTING",
    line: `${ICONS.STARTING} **Core Server**: waiting for local probe`,
    details: ["Target: https://core.robtic.org"],
    checkedAt: Date.now(),
};

function statusWeight(status: StatusType): number {
    switch (status) {
        case "OFFLINE":
            return 4;
        case "DEGRADED":
            return 3;
        case "STARTING":
            return 2;
        default:
            return 1;
    }
}

function pickOverallStatus(statuses: StatusType[]): StatusType {
    if (statuses.length === 0) {
        return "HEALTHY";
    }

    return statuses.reduce((worst, current) => {
        return statusWeight(current) > statusWeight(worst) ? current : worst;
    }, "HEALTHY" as StatusType);
}

function relativeTime(ms?: number): string {
    if (!ms) {
        return "unknown";
    }
    return `<t:${Math.floor(ms / 1000)}:R>`;
}

function formatMegabytes(bytes: number): string {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function mapDbReadyState(readyState: number): StatusType {
    switch (readyState) {
        case 1:
            return "HEALTHY";
        case 0:
            return "OFFLINE";
        case 2:
        case 3:
            return "STARTING";
        default:
            return "DEGRADED";
    }
}

function isMessageChannel(
    channel: Channel | null
): channel is Channel & { messages: { fetch: (id: string) => Promise<Message> }; send: (payload: { embeds: EmbedBuilder[] }) => Promise<Message> } {
    return Boolean(channel && channel.isTextBased() && "messages" in channel && "send" in channel);
}

function ensurePanelLoop(): void {
    if (!intervalHandle) {
        intervalHandle = setInterval(() => {
            void refreshStatusPanels("interval refresh");
        }, PANEL_REFRESH_MS);
    }
}

function schedulePanelRefresh(reason: string): void {
    ensurePanelLoop();

    if (refreshHandle) {
        clearTimeout(refreshHandle);
    }

    refreshHandle = setTimeout(() => {
        refreshHandle = null;
        void refreshStatusPanels(reason);
    }, 1000);
}

export function registerStatusClient(client: Client): void {
    statusClient = client;
    ensurePanelLoop();
}

export async function buildSystemStatusEmbed(): Promise<EmbedBuilder> {
    const db = mongoose.connection;
    const dbStatus = mapDbReadyState(db.readyState);
    const dbState = db.readyState === 1 ? "connected" : "not connected";

    const core = latestCoreSnapshot;

    const botEntries = BOT_DEFINITIONS.map((definition) => {
        const entry = BOT_STATUSES.get(definition.name);
        const status = entry?.status ?? "OFFLINE";
        const message = entry?.message ?? "No recent status message";
        const updated = BOT_LAST_UPDATED.get(definition.name);

        return {
            status,
            line: `${ICONS[status]} **${definition.name}** - ${message} (${relativeTime(updated)})`,
        };
    });

    const serviceLines = Array.from(SERVICE_STATUSES.values())
        .filter((service) => service.key !== "core-reachability-local")
        .map((service) => {
        const details = service.details?.length ? ` | ${service.details.join(" | ")}` : "";
        return `${ICONS[service.status]} **${service.label}**: ${service.status} - ${service.message ?? "No details"}${details} (updated ${relativeTime(service.updatedAt)})`;
    });

    const botTotals = {
        healthy: botEntries.filter((entry) => entry.status === "HEALTHY").length,
        degraded: botEntries.filter((entry) => entry.status === "DEGRADED").length,
        starting: botEntries.filter((entry) => entry.status === "STARTING").length,
        offline: botEntries.filter((entry) => entry.status === "OFFLINE").length,
    };

    const systemUsage = os.totalmem() > 0 ? ((os.totalmem() - os.freemem()) / os.totalmem()) * 100 : 0;
    const processMemory = process.memoryUsage();

    const overallStatus = pickOverallStatus([
        ...BOT_DEFINITIONS.map((definition) => BOT_STATUSES.get(definition.name)?.status ?? "OFFLINE"),
        dbStatus,
        core.status,
        ...Array.from(SERVICE_STATUSES.values()).map((service) => service.status),
    ]);

    const embed = new EmbedBuilder()
        .setColor(COLORS[overallStatus])
        .setTitle("Robtic System Status Panel")
        .setDescription(
            [
                `Environment: **${process.env.NODE_ENV || "development"}** | Synced <t:${Math.floor(Date.now() / 1000)}:R>`,
                `Updated: <t:${Math.floor(Date.now() / 1000)}:f>`,
            ].join("\n")
        )
        .addFields(
            {
                name: "Bots",
                value: [
                    `🟢 ${botTotals.healthy}`,
                    `🟡 ${botTotals.degraded}`,
                    `🟠 ${botTotals.starting}`,
                    `🔴 ${botTotals.offline}`,
                ].join(" | "),
                inline: true,
            },
            {
                name: "Database",
                value: `${ICONS[dbStatus]} ${dbState}`,
                inline: true,
            },
            {
                name: "Process",
                value: [
                    `Uptime: ${Math.floor(process.uptime())}s`,
                    `RAM: ${systemUsage.toFixed(1)}%`,
                ].join("\n"),
                inline: true,
            },
            {
                name: "Bot Details",
                value: botEntries.map((entry) => entry.line).join("\n") || "No bot status entries yet.",
                inline: false,
            },
            {
                name: "Runtime",
                value: [
                    `Process RSS: ${formatMegabytes(processMemory.rss)}`,
                    `Process heap: ${formatMegabytes(processMemory.heapUsed)} / ${formatMegabytes(processMemory.heapTotal)}`,
                    `Load average (1m/5m/15m): ${os.loadavg().map((value) => value.toFixed(2)).join(" / ")}`,
                    `Core server: core.robtic.org`,
                ].join("\n"),
                inline: false,
            }
        )
        .setFooter({ text: "Robtic Monitoring and Health System" })
        .setTimestamp();

    return embed;
}

export async function refreshStatusPanels(reason = "manual"): Promise<void> {
    if (refreshInFlight || !statusClient) {
        return;
    }

    refreshInFlight = true;

    try {
        const sentPanels = await ServerConfigRepository.getAllSentPanelsByKey(PANEL_KEY);
        if (!sentPanels.length) {
            return;
        }

        const embed = await buildSystemStatusEmbed();

        for (const panel of sentPanels) {
            try {
                const channel = await statusClient.channels.fetch(panel.channelId);
                if (!isMessageChannel(channel)) {
                    await ServerConfigRepository.removeSentPanel(panel.guildId, panel.messageId);
                    continue;
                }

                const message = await channel.messages.fetch(panel.messageId);
                await message.edit({ embeds: [embed] });
            } catch {
                await ServerConfigRepository.removeSentPanel(panel.guildId, panel.messageId);
            }
        }

        Logger.debug(`Status panel refreshed (${reason})`, "StatusSystem");
    } catch (error) {
        Logger.error(`Failed to refresh status panel: ${String(error)}`, "StatusSystem");
    } finally {
        refreshInFlight = false;
    }
}

export async function configureStatusPanel(
    guildId: string,
    channelId: string,
    sentBy: string,
    client: Client
): Promise<void> {
    registerStatusClient(client);

    const channel = await client.channels.fetch(channelId);
    if (!isMessageChannel(channel)) {
        throw new Error("Selected channel is not a text channel.");
    }

    const embed = await buildSystemStatusEmbed();
    const existing = await ServerConfigRepository.getSentPanelByKey(guildId, PANEL_KEY);

    if (existing && existing.channelId === channelId) {
        try {
            const previousMessage = await channel.messages.fetch(existing.messageId);
            await previousMessage.edit({ embeds: [embed] });

            await ServerConfigRepository.upsertSentPanel(guildId, {
                panelKey: PANEL_KEY,
                channelId,
                messageId: previousMessage.id,
                sentBy,
            });

            schedulePanelRefresh("status channel updated (existing message)");
            return;
        } catch {
            await ServerConfigRepository.removeSentPanel(guildId, existing.messageId);
        }
    }

    const message = await channel.send({ embeds: [embed] });

    await ServerConfigRepository.upsertSentPanel(guildId, {
        panelKey: PANEL_KEY,
        channelId,
        messageId: message.id,
        sentBy,
    });

    schedulePanelRefresh("status channel configured");
}

export async function getConfiguredStatusPanel(guildId: string): Promise<{ channelId: string; messageId: string } | null> {
    const panel = await ServerConfigRepository.getSentPanelByKey(guildId, PANEL_KEY);
    if (!panel) {
        return null;
    }

    return {
        channelId: panel.channelId,
        messageId: panel.messageId,
    };
}

export function reportServiceStatus(
    key: string,
    label: string,
    status: StatusType,
    message?: string,
    details?: string[]
): void {
    SERVICE_STATUSES.set(key, {
        key,
        label,
        status,
        message,
        details,
        updatedAt: Date.now(),
    });

    Logger.debug(`${label}: ${status}${message ? ` - ${message}` : ""}`, "StatusSystem");
    schedulePanelRefresh(`service status update (${key})`);
}

export async function sendStatus(
    botName: BotName,
    status: StatusType,
    message?: string
): Promise<void> {
    BOT_STATUSES.set(botName, {
        name: botName,
        status,
        message,
    });

    BOT_LAST_UPDATED.set(botName, Date.now());

    Logger.debug(`Status update for ${botName}: ${status}${message ? ` - ${message}` : ""}`, "StatusSystem");
    schedulePanelRefresh(`bot status update (${botName})`);
}