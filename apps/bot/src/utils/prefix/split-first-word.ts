/** Opening quote → the closing one that ends the same token. */
const QUOTE_PAIRS = new Map([
    ['"', '"'],
    ["'", "'"],
    ["“", "”"],
    ["«", "»"],
]);

/**
 * Takes the next positional token off an argument string.
 *
 * A quoted run counts as one token: `!shortcut add "coins balance" c` gives `coins balance` and
 * `c`. Without that, any option whose value contains a space is unusable unless it happens to be
 * the last string option — which is what made `shortcut add` impossible to drive from chat, since
 * its first option is a command path like `warn add`.
 *
 * Smart quotes are accepted because phones substitute them silently, and someone whose shortcut
 * quietly broke has no way to see why.
 *
 * An unterminated quote falls back to splitting on whitespace rather than swallowing the rest of
 * the message: a stray apostrophe in `it's` must not eat every remaining argument.
 */
export function splitFirstWord(text: string): [string, string] {
    const trimmed = text.trimStart();
    if (!trimmed) return ["", ""];

    const closing = QUOTE_PAIRS.get(trimmed[0]!);
    if (closing) {
        const end = trimmed.indexOf(closing, 1);
        if (end > 0) return [trimmed.slice(1, end), trimmed.slice(end + 1).trimStart()];
    }

    const idx = trimmed.search(/\s/);
    if (idx === -1) return [trimmed, ""];
    return [trimmed.slice(0, idx), trimmed.slice(idx + 1)];
}
