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
 * Both used to be fixed unions (one Department/PermissionLevel set for every server). Now that
 * staff tiers/departments are per-guild data (see StaffTier model), these are free-form guild-defined
 * strings — kept as named type aliases purely for readability at call sites, not for compile-time
 * enumeration. The old fixed value sets (Dev/Design/Moderation/... and Owner/LeadDev/DevManager/...)
 * still exist as real string values, they're just no longer statically enforced.
 */
type Department = string;
type PermissionLevel = string;
