import { MINECRAFT_LINK_CODE } from "@constants";

/**
 * A random link code from the unambiguous alphabet. Uniqueness is enforced by the unique index on
 * MinecraftLinkCode.code, not here — callers retry on a duplicate-key error.
 */
export function generateLinkCode(): string {
    const { length, alphabet } = MINECRAFT_LINK_CODE;
    const bytes = crypto.getRandomValues(new Uint8Array(length));

    let code = "";
    for (const byte of bytes) {
        code += alphabet[byte % alphabet.length];
    }

    return code;
}
