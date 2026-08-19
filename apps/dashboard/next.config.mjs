import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const nextConfig = {
    reactStrictMode: true,

    // `.next/standalone` is a self-contained server carrying only the files actually reachable from
    // the app — it is what keeps the runtime image small, and why the Dockerfile's final stage has
    // no `node_modules` of its own.
    //
    // Opt-in rather than always on, and the Dockerfile is the only thing that opts in. Producing it
    // means copying a hoisted Bun `node_modules` tree, which is built from symlinks; creating those
    // on Windows needs elevation, so leaving it on would break `bun run build` for anyone
    // developing here while working perfectly in the Linux image.
    output: process.env.NEXT_OUTPUT_STANDALONE === "true" ? "standalone" : undefined,

    // The monorepo root, not this package. Bun hoists dependencies to the root `node_modules`, so
    // tracing from `apps/dashboard` would find none of them and the standalone server would start
    // and then fail on its first import. The cost is that output is nested as
    // `.next/standalone/apps/dashboard/server.js`, which the Dockerfile accounts for.
    outputFileTracingRoot: resolve(here, "../.."),

    images: {
        // Guild and avatar icons, the only remote images this app renders.
        remotePatterns: [{ protocol: "https", hostname: "cdn.discordapp.com" }],
    },
};

export default nextConfig;
