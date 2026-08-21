import type { CookieOptions } from "express";

/**
 * A cookie a service has decided on, for the controller to actually set.
 *
 * The split matters for where logic lives. Minting a session and choosing its lifetime and `Secure`
 * flag are decisions — they belong in `SessionService`. Calling `response.cookie(...)` is transport,
 * and belongs in the controller. Passing this descriptor between them means the service never
 * touches an Express response, so it stays testable without one.
 */
export interface CookieDescriptor {
    name: string;
    value: string;
    options: CookieOptions;
}
