import { plainToInstance, Transform } from "class-transformer";
import { IsBoolean, IsInt, IsNotEmpty, IsString, Matches, Max, Min, validateSync } from "class-validator";

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

const TRUE_SPELLINGS = new Set(["true", "1", "yes", "on"]);
const FALSE_SPELLINGS = new Set(["false", "0", "no", "off"]);

/**
 * Booleans are already real booleans by the time they reach here — `normalise` resolves the
 * spelling, because an unrecognised one falls back to a derived default rather than refusing to boot.
 */
const toBoolean = ({ value }: { value: unknown }): unknown => value;

/**
 * The URL rule is deliberately loose: a scheme and something after it.
 *
 * It replaced `@IsUrl`, whose heuristics reject hostnames that are perfectly valid here — a bare
 * container name, a single-label host, an address with an unusual port. The mistake actually worth
 * catching is a missing scheme (`dashboard-api.robtic.org`), because the OAuth `redirect_uri` is
 * built by string concatenation and would silently become a relative path Discord rejects.
 */
const HTTP_URL = /^https?:\/\/\S+$/;

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
    @Matches(HTTP_URL, { message: "$property must start with http:// or https://" })
    DASHBOARD_API_URL: string;

    /** Where the browser reaches the Next.js app; also the only permitted CORS origin. */
    @Matches(HTTP_URL, { message: "$property must start with http:// or https://" })
    DASHBOARD_URL: string;

    @IsString()
    @IsNotEmpty()
    DISCORD_CLIENT_ID: string;

    @IsString()
    @IsNotEmpty()
    DISCORD_CLIENT_SECRET: string;

    /** Signs session cookies. Rotating it logs everybody out, which is the intended emergency stop. */
    @IsString()
    @IsNotEmpty()
    DASHBOARD_SESSION_SECRET: string;

    // No lower bound beyond "a positive number of milliseconds". A very short session is a strange
    // choice rather than a broken one, and refusing to start over it turns a preference into an
    // outage.
    @Transform(toInt)
    @IsInt()
    @Min(1)
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
 * Resolves a boolean variable, falling back rather than failing.
 *
 * An earlier version of this file accepted only the exact strings "true" and "false" and refused to
 * start on anything else. That is the wrong trade for a flag with a sensible derived default:
 * `DASHBOARD_SECURE_COOKIES=1` is obviously intended to mean true, and turning it into a container
 * that will not boot costs an outage to punish a spelling. The fallback is announced, so a typo is
 * still visible in the startup log instead of silently reading as false — which is what the original
 * `=== "true"` comparison did.
 */
function resolveBoolean(raw: string | undefined, fallback: boolean, name: string): boolean {
    if (raw === undefined) return fallback;

    const normalised = raw.trim().toLowerCase();
    if (TRUE_SPELLINGS.has(normalised)) return true;
    if (FALSE_SPELLINGS.has(normalised)) return false;

    console.warn(
        `[config] ${name}="${raw}" is not a recognised boolean — using ${fallback}. ` +
        `Accepted: ${[...TRUE_SPELLINGS, ...FALSE_SPELLINGS].join(", ")}.`,
    );

    return fallback;
}

/**
 * Narrows the ambient environment to the nine variables this service actually reads, filling in
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
        DASHBOARD_SESSION_SECRET: provided(raw.DASHBOARD_SESSION_SECRET),
        DASHBOARD_SESSION_TTL_MS: provided(raw.DASHBOARD_SESSION_TTL_MS) ?? DEFAULT_SESSION_TTL_MS,
        // The one default derived from another variable: an https API is being served over https, so
        // a Secure cookie will be stored, and over http it never would be.
        DASHBOARD_SECURE_COOKIES: resolveBoolean(
            provided(raw.DASHBOARD_SECURE_COOKIES),
            publicApiUrl.startsWith("https://"),
            "DASHBOARD_SECURE_COOKIES",
        ),
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
