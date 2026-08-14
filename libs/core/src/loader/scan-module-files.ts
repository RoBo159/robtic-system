import { existsSync } from "fs";
import { classifyModuleFile, type ModuleKind } from "./classify-module-file";

export interface ModuleFile {
    path: string;
    kind: ModuleKind;
}

const tsGlob = new Bun.Glob("**/*.ts");

/**
 * One filesystem walk over the whole bot source tree, classified and sorted.
 *
 * Sorted because `Bun.Glob.scan` gives no order guarantee, and load order decides which of two
 * commands sharing a name wins. Deterministic order turns that from a coin flip into a rule:
 * manifests first, then suffixed files, then legacy ones, alphabetically within each group.
 */
const KIND_ORDER: Record<ModuleKind, number> = {
    manifest: 0,
    command: 1,
    event: 1,
    component: 1,
    message: 1,
    "legacy-command": 2,
    "legacy-event": 2,
    "legacy-component": 2,
};

export async function scanModuleFiles(root: string): Promise<ModuleFile[]> {
    if (!existsSync(root)) return [];

    const files: ModuleFile[] = [];

    for await (const path of tsGlob.scan({ cwd: root, absolute: true })) {
        const kind = classifyModuleFile(path, root);
        if (kind) files.push({ path, kind });
    }

    return files.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.path.localeCompare(b.path));
}
