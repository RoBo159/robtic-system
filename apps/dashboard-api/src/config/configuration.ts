import { registerAs } from "@nestjs/config";
import { getMainBotToken } from "@config";
import { validate } from "./env.validation";
import type { AppConfig, DatabaseConfig, DiscordConfig, SessionConfig } from "./interfaces";

/**
 * The environment, as four typed namespaces.
 *
 * `registerAs` rather than one flat object, because each namespace carries its own injection token:
 * a service asks for `ConfigType<typeof discordConfig>` and gets exactly the three Discord
 * credentials, fully typed, with no access to the session secret it has no business reading. The old
 * shape was a single `DASHBOARD_ENV` token holding everything, which every consumer received in
 * full.
 *
 * Splitting them is also how the dependency graph stays legible: `SessionService` depending on
 * `sessionConfig` says what it needs in its constructor, and nothing else has to be read to know it.
 */

export const appConfig = registerAs("app", (): AppConfig => {
    const env = validate(process.env);

    return {
        port: env.DASHBOARD_API_PORT,
        publicApiUrl: env.DASHBOARD_API_URL,
        dashboardUrl: env.DASHBOARD_URL,
    };
});

export const databaseConfig = registerAs("database", (): DatabaseConfig => {
    const env = validate(process.env);

    return { uri: env.MONGODB_URI };
});

export const discordConfig = registerAs("discord", (): DiscordConfig => {
    const env = validate(process.env);

    return {
        clientId: env.DISCORD_CLIENT_ID,
        clientSecret: env.DISCORD_CLIENT_SECRET,
        // Same token the bot and the Minecraft API use — `MainBotToken`/`TestBot`, picked by
        // `NODE_ENV` in libs/config. There is no separate dashboard bot token to configure.
        botToken: getMainBotToken(),
    };
});

export const sessionConfig = registerAs("session", (): SessionConfig => {
    const env = validate(process.env);

    return {
        secret: env.DASHBOARD_SESSION_SECRET,
        ttlMs: env.DASHBOARD_SESSION_TTL_MS,
        secureCookies: env.DASHBOARD_SECURE_COOKIES,
    };
});

/** Every namespace, in the order `ConfigModule.forRoot({ load })` should receive them. */
export const configurations = [appConfig, databaseConfig, discordConfig, sessionConfig];
