import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../../common";
import { SESSION_COOKIE } from "../constants";
import type { AuthenticatedRequest } from "../interfaces";
import { SessionService } from "../services";

/**
 * Rejects anything without a valid signed session cookie, and attaches the session when there is one.
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
        const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
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
