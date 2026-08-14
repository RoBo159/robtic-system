import { sep } from "path";

export type ModuleKind =
    | "command"
    | "event"
    | "component"
    | "message"
    | "manifest"
    | "legacy-command"
    | "legacy-event"
    | "legacy-component";

/** Reserved filename suffixes. A file carrying one is registered wherever it sits in the tree. */
const SUFFIXES: ReadonlyArray<[string, ModuleKind]> = [
    [".command.ts", "command"],
    [".event.ts", "event"],
    [".component.ts", "component"],
    [".message.ts", "message"],
];

/** Directories whose plain `.ts` files are still registered by position, pending the Phase C move. */
const LEGACY_DIRS: ReadonlyArray<[string, ModuleKind]> = [
    ["commands", "legacy-command"],
    ["events", "legacy-event"],
    ["components", "legacy-component"],
];

function normalize(path: string): string {
    return sep === "\\" ? path.replaceAll("\\", "/") : path;
}

/**
 * What, if anything, a file should be loaded as.
 *
 * Suffix wins over position, which is what lets a Phase C file live at
 * `commands/global/status.command.ts` without being claimed twice — the caller dedupes on the
 * returned kind, and `legacy-*` is only ever reported for a file with no suffix.
 *
 * A feature's `<key>/<key>.ts` is the manifest. Everything else inside a feature folder —
 * `commands/`, `functions/`, `utils/`, `lib/` — is a plain import from its own feature and is
 * deliberately invisible here.
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

    if (segments[0] === "features") {
        // features/<key>/<key>.ts — the manifest, and the only unsuffixed feature file that loads.
        const key = segments[1];
        return segments.length === 3 && key && segments[2] === `${key}.ts` ? "manifest" : null;
    }

    for (const [dir, kind] of LEGACY_DIRS) {
        if (segments[0] === dir) return kind;
    }

    return null;
}
