type BotName = "main" | "support" | "moderation" | "hr" | "modemail" | "activity" | "service";

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

type PermissionLevel =
    | "Owner"
    | "Lead"
    | "Manager"
    | "Staff"
    | "Support"
    | "Moderator"
    | "HR"
    | "Member";