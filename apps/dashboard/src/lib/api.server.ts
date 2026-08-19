import "server-only";
import { cookies } from "next/headers";
import { ApiError } from "./api";

/**
 * Where server components reach the API.
 *
 * Two variables, not one. Server components call the API from inside the network, where the
 * container name resolves and the public hostname may not; the browser can only use the public one.
 * Collapsing them works locally and then breaks the first time this is deployed behind a proxy.
 */
const INTERNAL_API = process.env.DASHBOARD_API_INTERNAL_URL ?? "http://localhost:3003";

/**
 * The base URL to hand to the browser — read here, on the server, at request time.
 *
 * Server components use it directly for links such as `/auth/login`; client components receive it
 * through ApiConfigProvider. Either way it is never compiled into the bundle, which is what lets
 * one image run in any environment.
 */
export function publicApiUrl(): string {
    return process.env.DASHBOARD_PUBLIC_API_URL ?? "http://localhost:3003";
}

/**
 * A server-side GET against the dashboard API, carrying the visitor's session cookie.
 *
 * The cookie has to be forwarded by hand: a server component runs on the server, so it is not the
 * browser and nothing attaches it automatically. Without this every request would arrive
 * unauthenticated and the whole dashboard would look logged out.
 */
export async function apiGet<T>(path: string): Promise<T> {
    const cookieHeader = (await cookies()).toString();

    const response = await fetch(`${INTERNAL_API}${path}`, {
        headers: { cookie: cookieHeader },
        // Guild configuration is edited in this UI, so a cached read would show the operator their
        // own change failing to appear.
        cache: "no-store",
    });

    if (!response.ok) {
        throw new ApiError(response.status, `${path} responded ${response.status}`);
    }

    return (await response.json()) as T;
}
