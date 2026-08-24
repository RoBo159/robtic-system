import { hash, verify } from "@node-rs/argon2";
import { MINECRAFT_AUTH } from "@constants";

/**
 * The one place that turns a password into a hash, and the one place that checks one.
 *
 * <h2>Why this is in `libs/core` and not in the API</h2>
 *
 * Both sides of RobticAuth handle passwords, and they reach the database by different routes: the
 * game server asks the API to verify a login, while the Discord modals call straight into these
 * core functions the way `redeemLinkCode` already does. A second implementation on either side would
 * be a second set of Argon2 parameters, and the day they drifted apart every password set on one
 * side would stop verifying on the other.
 *
 * <h2>Argon2id, with the OWASP baseline</h2>
 *
 * The parameters live in {@code MINECRAFT_AUTH.argon2}. Memory is the one that matters — it is what
 * denies an attacker the advantage of a GPU — and 19 MiB per verification is affordable for a system
 * that authenticates a player once per session rather than once per request.
 *
 * The encoded hash carries its own salt and parameters, so raising the cost later applies to new
 * passwords without invalidating existing ones. Nothing here needs a migration.
 */

/**
 * Argon2id, spelled as its numeric value.
 *
 * The library declares `Algorithm` as an ambient `const enum`, which this workspace cannot import:
 * `verbatimModuleSyntax` forbids it, because a const enum is erased at compile time and there would
 * be nothing left to import at runtime. The value is part of the library's public encoding — it
 * appears in every hash as `$argon2id$` — so naming it here is stable, and the assertion below fails
 * the build if it ever stops being what we think it is.
 */
const ARGON2ID = 2;

const OPTIONS = {
    algorithm: ARGON2ID,
    memoryCost: MINECRAFT_AUTH.argon2.memoryCost,
    timeCost: MINECRAFT_AUTH.argon2.timeCost,
    parallelism: MINECRAFT_AUTH.argon2.parallelism,
} as const;

/** Why a password was refused, or null when it is acceptable. */
export type PasswordProblem = "too_short" | "too_long" | "blank";

/**
 * Checks a password against the bounds, and nothing else.
 *
 * Deliberately not a complexity ruleset. Mandatory symbols and mixed case push people towards
 * `Password1!` and towards writing it down; length is the property that actually costs an attacker
 * anything. The floor is a real minimum rather than a ritual.
 */
export function validatePassword(password: string): PasswordProblem | null {
    if (!password || password.trim().length === 0) return "blank";
    if (password.length < MINECRAFT_AUTH.password.minLength) return "too_short";
    if (password.length > MINECRAFT_AUTH.password.maxLength) return "too_long";
    return null;
}

/** Hashes a password. The result is an encoded Argon2id string, safe to store verbatim. */
export async function hashPassword(password: string): Promise<string> {
    const encoded = await hash(password, OPTIONS);

    // The guard the numeric constant above promises. A library upgrade that renumbered the algorithm
    // would otherwise silently start storing Argon2i or Argon2d — still hashes, still verifiable,
    // but no longer the algorithm this system claims to use, and nothing would ever say so.
    if (!encoded.startsWith("$argon2id$")) {
        throw new Error(
            `Expected an Argon2id hash but got "${encoded.slice(0, encoded.indexOf("$", 1) + 1)}". ` +
            "The argon2 library's Algorithm enum has changed — update ARGON2ID in password.ts.",
        );
    }

    return encoded;
}

/**
 * Checks a password against a stored hash.
 *
 * A malformed or truncated hash returns false rather than throwing. A stored credential that cannot
 * be parsed is not an exception the login path should have to catch — it is simply a password that
 * does not match, and the player recovers through the same route as anybody who has forgotten
 * theirs. Throwing here would turn one corrupt row into a 500 on every attempt.
 */
export async function verifyPassword(encodedHash: string, password: string): Promise<boolean> {
    if (!encodedHash || !password) return false;

    try {
        return await verify(encodedHash, password);
    } catch {
        return false;
    }
}
