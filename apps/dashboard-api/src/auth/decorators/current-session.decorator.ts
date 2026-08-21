import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthenticatedRequest, SessionPayload } from "../interfaces";

/**
 * The session `SessionGuard` attached, as a handler parameter.
 *
 *     @Get()
 *     list(@CurrentSession() session: SessionPayload) { … }
 *
 * Replaces `@Req() request: AuthenticatedRequest` in every feature controller, which is what keeps
 * Express types out of `guilds/`, `settings/` and the rest — those modules now describe what they
 * need rather than receiving the whole request and helping themselves.
 *
 * Only ever reached on a guarded route. A `@Public()` handler has no session, so asking for one
 * there gets `undefined`; the type says otherwise because every route that uses it is guarded, and
 * the alternative is a `SessionPayload | undefined` that every caller has to narrow for a case that
 * cannot happen.
 */
export const CurrentSession = createParamDecorator(
    (_data: unknown, context: ExecutionContext): SessionPayload =>
        context.switchToHttp().getRequest<AuthenticatedRequest>().session,
);

/** The Discord user id alone, for handlers that only need to attribute a change to somebody. */
export const CurrentUserId = createParamDecorator(
    (_data: unknown, context: ExecutionContext): string =>
        context.switchToHttp().getRequest<AuthenticatedRequest>().session.sub,
);
