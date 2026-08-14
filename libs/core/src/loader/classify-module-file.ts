import { sep } from "path";

export type ModuleKind = "command" | "event" | "component" | "message" | "manifest";

/** Reserved filename suffixes. A file carrying one is registered wherever it sits in the tree. */
const SUFFIXES: ReadonlyArray<[string, ModuleKind]> = [
    [".command.ts", "command"],
    [".event.ts", "event"],
    [".component.ts", "component"],
    [".message.ts", "message"],
];

function normalize(path: string): string {
    return sep === "\\" ? path.replaceAll("\\", "/") : path;
}

/**
 * What, if anything, a file should be loaded as — decided purely by name, plus the one positional
 * rule for feature manifests.
 *
 * Nothing is registered because of where it sits, so a helper can live next to the command that
 * uses it without becoming a command. The flip side is that the four suffixes are reserved
 * everywhere under the bot source tree: naming a helper `*.event.ts` attaches a gateway listener.
 *
 * Everything else inside a feature folder — `commands/`, `functions/`, `utils/`, `lib/`,
 * `components/` — is a plain import from its own feature and deliberately invisible here.
 */
export function classifyModuleFile(absolutePath: string, root: string): ModuleKind | null {
    const path = normalize(absolutePath);
    if (path.endsWith(".d.ts")) return null;

    for (const [suffix, kind] of SUFFIXES) {
        if (path.endsWith(suffix)) return kind;
    }

    const rootPath = normalize(root).replace(/\/$/, "");
    const relative = path.startsWith(`${rootPath}/`) ? path.slice(rootPath.length + 1) : path;
    const segments = relative.split("/");

    // features/<key>/<key>.ts — the manifest, and the only unsuffixed file the loader reads.
    if (segments[0] === "features") {
        const key = segments[1];
        return segments.length === 3 && key && segments[2] === `${key}.ts` ? "manifest" : null;
    }

    return null;
}
