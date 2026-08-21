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
//    Discovered rather than listed, now that they all live in one directory: a fifth Bun service
//    added to infra/docker/ is checked without anyone remembering to extend an array here. The
//    Minecraft plugin is excluded because it is a Maven build with no workspace manifests at all.
const DOCKER_DIR = "infra/docker/dockerfiles";
const dockerfiles = readdirSync(join(ROOT, DOCKER_DIR))
    .filter(name => name.endsWith(".Dockerfile") && name !== "minecraft-plugin.Dockerfile")
    .map(name => `${DOCKER_DIR}/${name}`)
    .sort();

check("infra/docker/dockerfiles holds a Dockerfile per Bun service", dockerfiles.length === 4, dockerfiles.join(", "));

for (const path of dockerfiles) {
    const body = read(path);
    const copied = [...body.matchAll(/^COPY ((?:apps|libs)\/[^/]+)\/package\.json /gm)].map(m => m[1]!).sort();

    const missing = onDisk.filter(w => !copied.includes(w));
    const stale = copied.filter(w => !onDisk.includes(w));

    check(`${path} copies every workspace manifest`, missing.length === 0, missing.join(", "));
    check(`${path} copies no manifest that is gone`, stale.length === 0, stale.join(", "));
}

// 4. A workspace with dependencies of its own must have its node_modules copied into the image.
//
//    Bun does not hoist a workspace's dependencies to the root: `@nestjs/*`, `next` and everything
//    else declared in an app's own package.json lives in that app's node_modules, along with the
//    `.bin` entries that make `bun run <script>` work. An image that copies only /app/node_modules
//    builds cleanly and then fails — `next: command not found` during the build, or a missing
//    module at container start. Neither names the cause.
//
//    Only checked for the app a Dockerfile actually copies source for; the root package.json's own
//    dependencies are hoisted and need nothing.
for (const path of dockerfiles) {
    const body = read(path);

    for (const workspace of onDisk) {
        // `COPY apps/x ./apps/x` — the source copy, as opposed to the manifest copy above.
        const copiesSource = new RegExp(`^COPY ${workspace} `, "m").test(body);
        if (!copiesSource) continue;

        const manifest = JSON.parse(read(`${workspace}/package.json`)) as {
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
        };
        const hasOwnDeps = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).length > 0;
        if (!hasOwnDeps) continue;

        const copiesModules = new RegExp(`^COPY --from=\\S+ /app/${workspace}/node_modules `, "m").test(body);
        check(`${path} copies ${workspace}'s own node_modules`, copiesModules);
    }
}

// 5. The root manifest's globs, so a new group (`packages/*`) cannot be added without this noticing.
const rootPkg = JSON.parse(read("package.json")) as { workspaces?: string[] };
check(
    "package.json workspace globs are the ones checked here",
    JSON.stringify(rootPkg.workspaces?.slice().sort()) === JSON.stringify(["apps/*", "libs/*"]),
    (rootPkg.workspaces ?? []).join(", "),
);

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
