/**
 * The parts of the API client that are safe on either side of the server/client boundary.
 *
 * `apiGet` lives in `api.server.ts` because it reads the request's cookies through `next/headers`,
 * which webpack refuses to bundle for the browser — and it refuses at the *module* level, so a
 * single client component importing this file would have failed the build no matter which function
 * it actually used. Hence the split.
 */

export class ApiError extends Error {
    constructor(readonly status: number, message: string) {
        super(message);
    }
}

/**
 * Client-side mutation.
 *
 * `base` is passed in rather than read from the environment: in the browser there is no environment
 * to read, and baking one in at build time is what `api-config.tsx` exists to avoid. Client
 * components get it from `useApiBase()`.
 *
 * `credentials: "include"` because the session is a cookie on the API's own origin, which is why
 * the API sets exactly one CORS origin rather than a wildcard.
 */
export async function apiMutate<T>(
    base: string,
    path: string,
    method: "PATCH" | "PUT" | "POST",
    body: unknown,
): Promise<T> {
    const response = await fetch(`${base}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const detail = await response.json().catch(() => null);
        throw new ApiError(
            response.status,
            (detail as { message?: string })?.message ?? `Request failed (${response.status})`,
        );
    }

    return (await response.json()) as T;
}
