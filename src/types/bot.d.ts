type BotName = "main" | "moderation" | "hr" | "modmail" | "community" | "service" | "ticket";
type StatusType = "STARTING" | "HEALTHY" | "DEGRADED" | "OFFLINE"

type BotTokenKey =
    | "MainBotToken"
    | "ModerationBotToken"
    | "HRBotToken"
    | "ModeMailBotToken"
    | "CommunityBotToken"
    | "ServiceBotToken"
    | "TicketBotToken"
    | "TestBot"


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
    modulesLoaded?: string[];
}

interface ModuleDefinition {
    name: string;
    description: string;
    commandsDir: string;
    eventsDir?: string;
    componentsDir?: string;
    onLoad?: () => Promise<void>;
    onUnload?: () => Promise<void>;
}

type Department =
    | "Dev"
    | "Design"
    | "Moderation"
    | "Community"
    | "Events"
    | "Support"
    | "HR";

type PermissionLevel =
    | "Owner"
    | "LeadDev"
    | "LeadDesign"
    | "LeadModerator"
    | "LeadCommunity"
    | "LeadSupport"
    | "StaffLead"
    | "SeniorStaffLead"
    | "PrincipalStaff"
    | "DevManager"
    | "DesignManager"
    | "CommunityManager"
    | "EventManager"
    | "SupportManager"
    | "ModerationManager"
    | "HRManager"
    | "ContentManager"
    | "OperationManager"
    | "Expert"
    | "Professional"
    | "Associate"
    | "Member";
