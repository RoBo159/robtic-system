import { connectDatabase } from "@database/connection";
import { Logger } from "@logger";
import { API_ROUTES } from "@sdk";
import { Router } from "./router";
import { pluginRoutes } from "./controllers/plugin-controller";
import { minecraftRoutes } from "./controllers/minecraft-controller";
import { economyRoutes } from "./controllers/economy-controller";
import { staffRoutes } from "./controllers/staff-controller";
import { discordRoutes } from "./controllers/discord-controller";
import { serverRoutes } from "./controllers/server-controller";
import { buildOpenApiDocument, renderDocsPage } from "./lib/openapi";
import { pruneRateLimitBuckets } from "./middleware/rate-limit";
import { ModerationService } from "./services/moderation-service";

const CTX = "robtic-api";
const port = Number(process.env.ROBTIC_API_PORT ?? 3002);

/** Housekeeping cadence: releasing lapsed sentences and discarding idle rate-limit buckets. */
const SWEEP_INTERVAL_MS = 30_000;

if (!process.env.MONGODB_URI) {
    Logger.error("MONGODB_URI is not set — the API owns the database and cannot start without it", CTX);
    process.exit(1);
}

await connectDatabase(process.env.MONGODB_URI);

const router = new Router().register(
    ...pluginRoutes,
    ...minecraftRoutes,
    ...economyRoutes,
    ...staffRoutes,
    ...discordRoutes,
    ...serverRoutes,
);

const openApiDocument = buildOpenApiDocument(router.all());
const docsPage = renderDocsPage();

/**
 * The three routes that are reachable without a key.
 *
 * Health is needed by the container probe, which has no credential to present. The specification
 * and its rendering describe the shape of the API but expose no data, and keeping them open is
 * what lets an operator diagnose a misconfigured key rather than being locked out by it.
 */
function unauthenticatedRoute(url: URL): Response | null {
    if (url.pathname === API_ROUTES.health) {
        return Response.json({ ok: true, data: { status: "ok", uptimeMs: Math.round(process.uptime() * 1000) } });
    }

    if (url.pathname === API_ROUTES.openapi) {
        return Response.json(openApiDocument);
    }

    if (url.pathname === API_ROUTES.docs) {
        return new Response(docsPage, { headers: { "content-type": "text/html; charset=utf-8" } });
    }

    return null;
}

Bun.serve({
    port,
    fetch: request => router.handle(request, unauthenticatedRoute),
});

/**
 * Releases sentences whose time has run out.
 *
 * Run here rather than on each game server so a player jailed on one server is still released on
 * schedule when that server is offline — the sentence belongs to the network, not to a process.
 */
setInterval(() => {
    void ModerationService.sweepExpiredJails()
        .then(released => {
            for (const entry of released) {
                Logger.info(`Released ${entry.username} — sentence expired`, CTX);
            }
        })
        .catch(error => Logger.error(`Jail sweep failed: ${error}`, CTX));

    pruneRateLimitBuckets();
}, SWEEP_INTERVAL_MS);

Logger.success(`Listening on http://localhost:${port} — ${router.all().length} routes, docs at ${API_ROUTES.docs}`, CTX);
