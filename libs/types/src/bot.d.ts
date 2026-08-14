/** One bot runs every module. Kept as a named type so log/status call sites still read as scoped. */
type BotName = "main";
type StatusType = "STARTING" | "HEALTHY" | "DEGRADED" | "OFFLINE"

type BotTokenKey = "MainBotToken" | "TestBot"


interface BotDefinition<Gateway, Partials> {
    name: BotName;
    tokenKey: BotTokenKey;
    intents: Gateway[];
    partials?: Partials[];
    description: string;
}

interface BotStatus {
    name: BotName;
    online?: boolean;
    status?: StatusType;
    message?: string;
    uptime?: number | null;
    guilds?: number;
    ping?: number;
    /** Number of slash commands currently loaded. */
    commands?: number;
}

/**
 * Used to be a fixed union (one PermissionLevel set for every server). Staff tiers are per-guild
 * data now (see StaffTier model), so this is a free-form guild-defined key — a named alias for
 * readability at call sites, not for compile-time enumeration.
 */
type PermissionLevel = string;
