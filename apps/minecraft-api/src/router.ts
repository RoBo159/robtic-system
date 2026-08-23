import { API_HEADERS, ApiError, hasScope, type ApiScope } from "@sdk";
import { Logger } from "@logger";
import { authenticate } from "./middleware/authenticate";
import { enforceRateLimit } from "./middleware/rate-limit";
import { failure, ok } from "./lib/respond";
import type { RequestContext } from "./lib/request-context";

const CTX = "minecraft-api";

export type RouteHandler = (context: RequestContext) => Promise<Response>;

export interface Route {
    method: "GET" | "POST";
    /** Literal path, or a pattern whose first capture group is passed to the handler's context. */
    path: string | RegExp;
    /** Scope the key must carry. */
    scope: ApiScope;
    handler: RouteHandler;
    /** OpenAPI metadata; the document is generated from the same table the router dispatches on. */
    summary: string;
    tag: string;
}

/**
 * The route table.
 *
 * Registration and documentation are the same declaration, so a route cannot exist without
 * appearing in the OpenAPI document, and a documented route cannot be missing from the server.
 */
export class Router {
    private readonly routes: Route[] = [];

    register(...routes: Route[]): this {
        this.routes.push(...routes);
        return this;
    }

    all(): readonly Route[] {
        return this.routes;
    }

    private match(method: string, pathname: string): { route: Route; parameter: string | null } | null {
        for (const route of this.routes) {
            if (route.method !== method) continue;

            if (typeof route.path === "string") {
                if (route.path === pathname) return { route, parameter: null };
                continue;
            }

            const match = route.path.exec(pathname);
            if (match) return { route, parameter: match[1] ?? null };
        }

        return null;
    }

    /**
     * Runs one request end to end: match, authenticate, rate limit, scope check, dispatch.
     *
     * The order matters. Authentication precedes the rate limit so the budget is charged to a key
     * rather than to an address, and the scope check follows both so an under-privileged key is
     * told it is forbidden rather than being silently rate limited into looking broken.
     */
    async handle(request: Request, unauthenticated: (url: URL) => Response | null): Promise<Response> {
        const url = new URL(request.url);

        const open = unauthenticated(url);
        if (open) return open;

        const matched = this.match(request.method, url.pathname);
        if (!matched) return failure(ApiError.notFound(`${request.method} ${url.pathname}`));

        try {
            const identity = await authenticate(request);
            const limit = enforceRateLimit(identity.label);

            if (!hasScope(identity, matched.route.scope)) {
                throw ApiError.forbidden(`This key lacks the "${matched.route.scope}" scope`);
            }

            const body = request.method === "POST" ? await parseBody(request) : {};
            const bodyRequestId =
                typeof body === "object" && body !== null && "requestId" in body
                    ? String((body as { requestId: unknown }).requestId)
                    : null;

            const context: RequestContext = {
                request,
                url,
                identity,
                body,
                requestId: request.headers.get(API_HEADERS.requestId) ?? bodyRequestId,
                serverId: request.headers.get(API_HEADERS.serverId) ?? identity.serverId,
                serverName: request.headers.get(API_HEADERS.serverName),
                pluginVersion: request.headers.get(API_HEADERS.pluginVersion),
            };

            const response = await matched.route.handler(context);
            response.headers.set(API_HEADERS.rateLimitRemaining, String(limit.remaining));
            response.headers.set(API_HEADERS.rateLimitReset, String(limit.resetInSeconds));
            return response;
        } catch (error) {
            return this.toResponse(error, request, url);
        }
    }

    private toResponse(error: unknown, request: Request, url: URL): Response {
        if (error instanceof ApiError) {
            if (error.retryable) {
                Logger.error(`${request.method} ${url.pathname} → ${error.code}: ${error.message}`, CTX);
            } else if (error.code !== "NOT_LINKED") {
                Logger.warn(
                    `${request.method} ${url.pathname} → ${error.code}: ${error.message}` +
                    (Object.keys(error.details).length > 0 ? ` ${JSON.stringify(error.details)}` : ""),
                    CTX,
                );
            }

            const response = failure(error);
            if (error.code === "RATE_LIMITED") {
                const seconds = /retry in (\d+)s/.exec(error.message)?.[1] ?? "60";
                response.headers.set(API_HEADERS.retryAfter, seconds);
            }
            return response;
        }

        Logger.error(`Unhandled error on ${request.method} ${url.pathname}: ${error}`, CTX);
        return failure(ApiError.internal());
    }
}

/** Parses a JSON body, treating an empty one as `{}` and a malformed one as a validation error. */
async function parseBody(request: Request): Promise<unknown> {
    const text = await request.text().catch(() => "");
    if (!text.trim()) return {};

    try {
        return JSON.parse(text);
    } catch {
        throw ApiError.validation({ body: "must be valid JSON" });
    }
}

export { ok };
