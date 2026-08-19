import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { SessionService, SESSION_COOKIE, type SessionPayload } from "./session.service";
import { IS_PUBLIC } from "./public.decorator";

/** The session, attached to the request by SessionGuard so controllers can read it. */
export interface AuthenticatedRequest extends Request {
    session: SessionPayload;
}

/**
 * Rejects anything without a valid signed session cookie.
 *
 * Registered globally in AppModule rather than per controller: a guard you have to remember to add
 * is one somebody will forget on the one route that mattered. Routes that genuinely need to be open
 * mark themselves with `@Public()`.
 */
@Injectable()
export class SessionGuard implements CanActivate {
    constructor(
        private readonly sessions: SessionService,
        private readonly reflector: Reflector,
    ) {}

    canActivate(context: ExecutionContext): boolean {
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
            context.getHandler(),
            context.getClass(),
        ]);
        if (isPublic) return true;

        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

        const session = this.sessions.verify(request.cookies?.[SESSION_COOKIE]);
        if (!session) throw new UnauthorizedException("Sign in to continue");

        request.session = session;
        return true;
    }
}
