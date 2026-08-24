import { connectDatabase } from "@database/connection";
import { Logger } from "@logger";
import { API_ROUTES } from "@sdk";
import { Router } from "./router";
import { pluginRoutes } from "./controllers/plugin-controller";
import { minecraftRoutes } from "./controllers/minecraft-controller";
import { robsRoutes } from "./controllers/robs-controller";
import { staffRoutes } from "./controllers/staff-controller";
import { discordRoutes } from "./controllers/discord-controller";
import { serverRoutes } from "./controllers/server-controller";
import { survivalRoutes } from "./controllers/survival-controller";
import { mailRoutes } from "./controllers/mail-controller";
import { authRoutes } from "./controllers/auth-controller";
import { buildOpenApiDocument, renderDocsPage } from "./lib/openapi";
import { pruneRateLimitBuckets } from "./middleware/rate-limit";
import { warnIfBotTokenMissing } from "./lib/bot-token";
import { ModerationService } from "./services/moderation-service";

const CTX = "minecraft-api";
const port = Number(process.env.MINECRAFT_API_PORT ?? 3002);

/** Housekeeping cadence: releasing lapsed sentences and discarding idle rate-limit buckets. */
const SWEEP_INTERVAL_MS = 30_000;

if (!process.env.MONGODB_URI) {
    Logger.error("MONGODB_URI is not set — the API owns the database and cannot start without it", CTX);
    process.exit(1);
}

await connectDatabase(process.env.MONGODB_URI);

warnIfBotTokenMissing();

const router = new Router().register(
    ...pluginRoutes,
    ...minecraftRoutes,
    ...robsRoutes,
    ...staffRoutes,
    ...discordRoutes,
    ...serverRoutes,
    ...survivalRoutes,
    ...mailRoutes,
    ...authRoutes,
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

/**
 * Bound to every interface, explicitly.
 *
 * Inside a container "localhost" means the container itself, so a server bound to loopback is
 * unreachable from the Docker port mapping and every request is refused at the TCP level — with
 * no log line here to explain it, because the connection never arrives. Binding 0.0.0.0 is what
 * makes the container's published port work at all.
 *
 * Restricting *who may reach it* is the port mapping's job (see infra/docker/compose/docker-compose.yml) and the API
 * key's job, not this bind address's.
 */
const hostname = process.env.MINECRAFT_API_HOST ?? "0.0.0.0";

const server = Bun.serve({
    port,
    hostname,
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

Logger.success(
    `Listening on ${server.hostname}:${server.port} — ${router.all().length} routes, docs at ${API_ROUTES.docs}`,
    CTX,
);

if (hostname !== "0.0.0.0") {
    Logger.warn(
        `Bound to ${hostname} rather than 0.0.0.0. Inside a container this is unreachable from the ` +
        `published port and every external request will be refused.`,
        CTX,
    );
}
