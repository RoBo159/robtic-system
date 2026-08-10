import type { OptionJSON } from "@typings/prefix";

export function usageLine(prefix: string, name: string, subGroup: string | null, sub: string | null, leaf: OptionJSON[]): string {
    const parts = [prefix + name];
    if (subGroup) parts.push(subGroup);
    if (sub) parts.push(sub);
    for (const opt of leaf) parts.push(opt.required ? `<${opt.name}>` : `[${opt.name}]`);
    return `\`${parts.join(" ")}\``;
}
