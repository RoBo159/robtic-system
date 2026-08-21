import { Controller, Get, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { Public } from "../../common";
import { CurrentSession } from "../decorators";
import { OAuthCallbackQueryDto, type SessionUserResponse } from "../dto";
import type { SessionPayload } from "../interfaces";
import { AuthService, OAuthStateService } from "../services";

/**
 * The Discord sign-in handshake.
 *
 * Every handler here is transport only: read a cookie or a query parameter, hand it to a service,
 * write a cookie, redirect. The decisions — what the state is, whether it matches, what a session
 * contains and how long it lives — are in `AuthService`, `OAuthStateService` and `SessionService`.
 */
@Controller("auth")
export class AuthController {
    constructor(
        private readonly auth: AuthService,
        private readonly oauthState: OAuthStateService,
    ) {}

    /**
     * Starts the OAuth handshake.
     *
     * `@Res()` rather than a returned value because this is a redirect, not a payload.
     */
    @Public()
    @Get("login")
    login(@Res() response: Response): void {
        const state = this.oauthState.issue();

        response.cookie(state.name, state.value, state.options);
        response.redirect(this.auth.authorizeUrl(state.value));
    }

    @Public()
    @Get("callback")
    async callback(
        @Query() query: OAuthCallbackQueryDto,
        @Req() request: Request,
        @Res() response: Response,
    ): Promise<void> {
        const stateCookie = this.oauthState.clearTarget();

        this.oauthState.assertMatches(query.state, request.cookies?.[stateCookie.name]);
        const code = this.oauthState.requireCode(query.code);

        response.clearCookie(stateCookie.name, stateCookie.options);

        const session = await this.auth.establishSession(code);

        response.cookie(session.name, session.value, session.options);
        response.redirect(this.auth.guildPickerUrl);
    }

    @Get("me")
    me(@CurrentSession() session: SessionPayload): SessionUserResponse {
        return this.auth.describe(session);
    }

    @Public()
    @Get("logout")
    logout(@Res() response: Response): void {
        const target = this.auth.sessionClearTarget();

        response.clearCookie(target.name, target.options);
        response.redirect(this.auth.landingUrl);
    }
}
