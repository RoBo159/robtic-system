import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/** @type {import("next").NextConfig} */
const nextConfig = {
    reactStrictMode: true,

    output: process.env.NEXT_OUTPUT_STANDALONE === "true" ? "standalone" : undefined,

    outputFileTracingRoot: resolve(here, "../.."),

    images: {
        remotePatterns: [{ protocol: "https", hostname: "cdn.discordapp.com" }],
    },
};

export default nextConfig;
