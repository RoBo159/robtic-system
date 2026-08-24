import { MINECRAFT_AUTH } from "@constants";

/**
 * A random recovery code from the same unambiguous alphabet link codes use.
 *
 * Uniqueness is enforced by the unique index on `MinecraftRecoveryCode.code`, not here — callers
 * retry on a duplicate-key error, exactly as {@link generateLinkCode}'s callers do.
 *
 * Longer than a link code, and grouped. A link code is read off the chat line directly above the
 * cursor; a recovery code is read off a login screen by somebody who is locked out, often on a phone
 * in the other hand. The extra characters cost nothing and the grouping is what makes eight of them
 * transcribable.
 */
export function generateRecoveryCode(): string {
    const { length, alphabet } = MINECRAFT_AUTH.recoveryCode;
    const bytes = crypto.getRandomValues(new Uint8Array(length));

    let code = "";
    for (const byte of bytes) {
        code += alphabet[byte % alphabet.length];
    }

    return code;
}

/**
 * Renders a code for display: `D92LX71M` → `D92L-X71M`.
 *
 * Storage and comparison always use the undashed form — see
 * {@code MinecraftRecoveryCodeRepository.normalise} — so the dash is presentation only and a player
 * who types it, omits it, or lowercases the whole thing is understood either way.
 */
export function formatRecoveryCode(code: string): string {
    const { groupSize } = MINECRAFT_AUTH.recoveryCode;
    const bare = code.replace(/[\s-]/g, "").toUpperCase();

    const groups: string[] = [];
    for (let start = 0; start < bare.length; start += groupSize) {
        groups.push(bare.slice(start, start + groupSize));
    }

    return groups.join("-");
}
