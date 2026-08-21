import type { Request } from "express";
import type { SessionPayload } from "./session-payload.interface";

/**
 * The request as it exists *after* `SessionGuard` has run.
 *
 * Used only by the guards that populate it and the parameter decorators that read it. Controllers
 * take `@CurrentSession()` instead of `@Req()`, which is what keeps this type — and Express — out of
 * the feature modules entirely.
 */
export interface AuthenticatedRequest extends Request {
    session: SessionPayload;
}
