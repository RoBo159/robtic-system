import { BOT_DEFINITION } from "@config";
import { Logger } from "@logger";

const CTX = "minecraft-api";

/**
 * The main bot's token, chosen exactly as the bot process chooses it.
 *
 * <h2>Why this is not just `process.env.MainBotToken`</h2>
 *
 * `BOT_DEFINITION.tokenKey` in libs/config picks `MainBotToken` in production and `TestBot`
 * otherwise, so the bot running against a test guild authenticates as the test bot. Reading the
 * same `tokenKey` here — rather than re-deriving it from `NODE_ENV` — is what keeps the API and the
 * bot in step by construction: a deployment where the two disagreed would have the API acting as
 * one bot while the bot itself acted as another, and the API's role lookups and log embeds would
 * then be attributed to, and permissioned as, a different account than the one actually in the
 * guild.
 */
export function mainBotToken(): string | null {
    return process.env[BOT_DEFINITION.tokenKey] ?? null;
}

/** The env var the token is expected in, for an error message that says what to actually set. */
export function mainBotTokenKey(): string {
    return BOT_DEFINITION.tokenKey;
}

/**
 * Warns once, at startup, when no token is configured.
 *
 * Three separate features degrade silently without it — live Discord role checks, moderation log
 * embeds, and in-game promote/demote — and each one fails in a way that looks like a different
 * bug. Saying it once here is what stops that being diagnosed three times.
 */
export function warnIfBotTokenMissing(): void {
    if (mainBotToken()) return;

    Logger.warn(
        `${mainBotTokenKey()} is not set — the API cannot call Discord. Staff ranks will fall back to ` +
        `the stored role projection, moderation log embeds will not be delivered, and /staff ` +
        `promote|demote will fail. Set it in the same .env the bot reads.`,
        CTX,
    );
}
