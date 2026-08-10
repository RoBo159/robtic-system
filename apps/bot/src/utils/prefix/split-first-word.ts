export function splitFirstWord(text: string): [string, string] {
    const trimmed = text.trimStart();
    const idx = trimmed.search(/\s/);
    if (idx === -1) return [trimmed, ""];
    return [trimmed.slice(0, idx), trimmed.slice(idx + 1)];
}
