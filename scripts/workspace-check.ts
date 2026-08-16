/**
 * Keeps the three lists of workspaces that must agree in step.
 *
 * A workspace exists in three places: on disk, in `bun.lock`, and as a `COPY <pkg>/package.json`
 * line in each Dockerfile's dependency stage. Nothing in the toolchain checks that they match, and
 * a mismatch does not fail locally — it fails inside `docker build`, minutes into a deploy, with
 * `lockfile had changes, but lockfile is frozen`, which names neither the workspace nor the file.
 *
 * That is exactly what deleting apps/activity and apps/api caused. This check is the cheap way to
 * never spend that debugging session again.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures++;
};

const ROOT = join(import.meta.dir, "..");
const read = (relative: string) => readFileSync(join(ROOT, relative), "utf8");

// 1. On disk: every directory under the workspace globs that actually has a package.json.
const onDisk: string[] = [];
for (const group of ["apps", "libs"]) {
    for (const entry of readdirSync(join(ROOT, group))) {
        if (existsSync(join(ROOT, group, entry, "package.json"))) onDisk.push(`${group}/${entry}`);
    }
}
onDisk.sort();
console.log(`${onDisk.length} workspaces on disk: ${onDisk.join(", ")}\n`);

// 2. In the lockfile. Keys of the top-level `workspaces` map, minus the root entry ("").
const lock = read("bun.lock");
const inLock = [...lock.matchAll(/^ {4}"((?:apps|libs)\/[^"]+)": \{/gm)].map(m => m[1]!).sort();

check(
    "bun.lock lists exactly the workspaces on disk",
    JSON.stringify(inLock) === JSON.stringify(onDisk),
    inLock.length === onDisk.length
        ? ""
        : `lock has ${inLock.filter(w => !onDisk.includes(w)).join(", ") || "—"}; disk has ${onDisk.filter(w => !inLock.includes(w)).join(", ") || "—"}`,
);

// 3. In each Dockerfile's dependency stage. A missing COPY means the workspace's package.json is
//    absent when `bun install --frozen-lockfile` runs, which the lockfile then disagrees with.
const dockerfiles = ["Dockerfile", "apps/robtic-api/Dockerfile"].filter(p => existsSync(join(ROOT, p)));

for (const path of dockerfiles) {
    const body = read(path);
    const copied = [...body.matchAll(/^COPY ((?:apps|libs)\/[^/]+)\/package\.json /gm)].map(m => m[1]!).sort();

    const missing = onDisk.filter(w => !copied.includes(w));
    const stale = copied.filter(w => !onDisk.includes(w));

    check(`${path} copies every workspace manifest`, missing.length === 0, missing.join(", "));
    check(`${path} copies no manifest that is gone`, stale.length === 0, stale.join(", "));
}

// 4. The root manifest's globs, so a new group (`packages/*`) cannot be added without this noticing.
const rootPkg = JSON.parse(read("package.json")) as { workspaces?: string[] };
check(
    "package.json workspace globs are the ones checked here",
    JSON.stringify(rootPkg.workspaces?.slice().sort()) === JSON.stringify(["apps/*", "libs/*"]),
    (rootPkg.workspaces ?? []).join(", "),
);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
