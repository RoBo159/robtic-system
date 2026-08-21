import { plainToInstance, Transform } from "class-transformer";
import { IsBoolean, IsInt, IsNotEmpty, IsString, IsUrl, Max, Min, validateSync } from "class-validator";

/**
 * The environment this service reads, as a validated schema.
 *
 * Deliberately fail-fast, and deliberately *named*: a dashboard that starts without
 * `DISCORD_CLIENT_SECRET` looks healthy until the first person tries to log in, and the error they
 * get names an OAuth response rather than the missing variable. Every message thrown from here names
 * the variable that is wrong.
 *
 * Raw `PROCESS_CASE` names on purpose. This is the only file in the service that knows what the
 * variables are called — everything downstream reads the typed namespaces in `configuration.ts`, so
 * renaming a variable is a change to two files rather than a search across the codebase.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const DEFAULT_PORT = "3003";
const DEFAULT_API_URL = "http://localhost:3003";
const DEFAULT_DASHBOARD_URL = "http://localhost:3000";
const DEFAULT_SESSION_TTL_MS = String(WEEK_MS);

/** Numbers arrive as strings. Anything unparseable is passed through so `@IsInt` names the variable. */
const toInt = ({ value }: { value: unknown }): unknown => {
    const parsed = Number(value);
    return Number.isInteger(parsed) ? parsed : value;
};

/** Same idea for booleans: only the two literals convert, so a typo fails loudly instead of reading false. */
const toBoolean = ({ value }: { value: unknown }): unknown => {
    if (value === "true" || value === true) return true;
    if (value === "false" || value === false) return false;
    return value;
};

export class EnvironmentVariables {
    @Transform(toInt)
    @IsInt()
    @Min(1)
    @Max(65_535)
    DASHBOARD_API_PORT: number;

    @IsString()
    @IsNotEmpty()
    MONGODB_URI: string;

    /** Where the browser reaches this API — the OAuth redirect is built from it. */
    @IsUrl({ require_tld: false, protocols: ["http", "https"] })
    DASHBOARD_API_URL: string;

    /** Where the browser reaches the Next.js app; also the only permitted CORS origin. */
    @IsUrl({ require_tld: false, protocols: ["http", "https"] })
    DASHBOARD_URL: string;

    @IsString()
    @IsNotEmpty()
    DISCORD_CLIENT_ID: string;

    @IsString()
    @IsNotEmpty()
    DISCORD_CLIENT_SECRET: string;

    /** Bot token, used to read which guilds the bot is actually in. */
    @IsString()
    @IsNotEmpty()
    DISCORD_BOT_TOKEN: string;

    /** Signs session cookies. Rotating it logs everybody out, which is the intended emergency stop. */
    @IsString()
    @IsNotEmpty()
    DASHBOARD_SESSION_SECRET: string;

    @Transform(toInt)
    @IsInt()
    @Min(60_000)
    DASHBOARD_SESSION_TTL_MS: number;

    /** False for local http development, where a Secure cookie would never be stored. */
    @Transform(toBoolean)
    @IsBoolean()
    DASHBOARD_SECURE_COOKIES: boolean;
}

/** Absent and empty are the same thing here — an unset variable in a compose `env_file` reads as "". */
const provided = (value: unknown): string | undefined => {
    if (value === undefined || value === null || value === "") return undefined;
    return String(value);
};

const withoutTrailingSlashes = (url: string): string => url.replace(/\/+$/, "");

/**
 * Narrows the ambient environment to the ten variables this service actually reads, filling in
 * defaults first.
 *
 * Picking the keys explicitly rather than spreading `process.env` matters: the result is what gets
 * validated, and a hundred unrelated variables in that object would have to be exempted from
 * validation one way or another.
 */
function normalise(raw: Record<string, unknown>): Record<string, unknown> {
    const publicApiUrl = withoutTrailingSlashes(provided(raw.DASHBOARD_API_URL) ?? DEFAULT_API_URL);

    return {
        DASHBOARD_API_PORT: provided(raw.DASHBOARD_API_PORT) ?? DEFAULT_PORT,
        MONGODB_URI: provided(raw.MONGODB_URI),
        DASHBOARD_API_URL: publicApiUrl,
        DASHBOARD_URL: withoutTrailingSlashes(provided(raw.DASHBOARD_URL) ?? DEFAULT_DASHBOARD_URL),
        DISCORD_CLIENT_ID: provided(raw.DISCORD_CLIENT_ID),
        DISCORD_CLIENT_SECRET: provided(raw.DISCORD_CLIENT_SECRET),
        DISCORD_BOT_TOKEN: provided(raw.DISCORD_BOT_TOKEN),
        DASHBOARD_SESSION_SECRET: provided(raw.DASHBOARD_SESSION_SECRET),
        DASHBOARD_SESSION_TTL_MS: provided(raw.DASHBOARD_SESSION_TTL_MS) ?? DEFAULT_SESSION_TTL_MS,
        DASHBOARD_SECURE_COOKIES:
            provided(raw.DASHBOARD_SECURE_COOKIES) ?? String(publicApiUrl.startsWith("https://")),
    };
}

/**
 * Handed to `ConfigModule.forRoot({ validate })`, and called again by each namespace factory in
 * `configuration.ts`.
 *
 * Pure and cheap, so calling it a handful of times at boot costs nothing and buys one source of
 * truth — there is no cached instance that a test could leave stale.
 */
export function validate(raw: Record<string, unknown>): EnvironmentVariables {
    const instance = plainToInstance(EnvironmentVariables, normalise(raw));

    const errors = validateSync(instance, {
        skipMissingProperties: false,
        forbidUnknownValues: false,
    });

    if (errors.length > 0) {
        const detail = errors
            .map(error => `  - ${error.property}: ${Object.values(error.constraints ?? {}).join("; ")}`)
            .join("\n");

        throw new Error(`apps/dashboard-api cannot start — its environment is invalid:\n${detail}`);
    }

    return instance;
}
