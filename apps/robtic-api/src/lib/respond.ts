import { ApiError } from "@sdk";
import type { ApiEnvelope } from "@sdk";

/**
 * Response construction. Every route returns through one of these, so the envelope shape is
 * guaranteed rather than remembered — a controller cannot accidentally return a bare object.
 */

export function ok<T>(data: T, init: ResponseInit = {}): Response {
    const body: ApiEnvelope<T> = { ok: true, data };
    return Response.json(body, { status: 200, ...init });
}

export function created<T>(data: T): Response {
    return ok(data, { status: 201 });
}

/** Serialises an {@link ApiError}, or wraps anything else as an internal error. */
export function failure(error: unknown): Response {
    const apiError = error instanceof ApiError ? error : ApiError.internal();
    const body: ApiEnvelope<never> = { ok: false, error: apiError.toJSON() };

    const headers: Record<string, string> = {};
    if (apiError.retryable) headers["cache-control"] = "no-store";

    return Response.json(body, { status: apiError.status, headers });
}
