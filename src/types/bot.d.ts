type BotName = "main" | "support" | "moderation" | "hr" | "modmail" | "activity" | "service";

type BotTokenKey =
    | "MainBotToken"
    | "SupportBotToken"
    | "ModerationBotToken"
    | "HRBotToken"
    | "ModeMailBotToken"
    | "ActivityBotToken"
    | "ServiceBotToken"
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
    online: boolean;
    uptime: number | null;
    guilds: number;
    ping: number;
    modulesLoaded: string[];
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