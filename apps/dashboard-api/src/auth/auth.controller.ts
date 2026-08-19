import { Controller, Get, Inject, Query, Req, Res, UnauthorizedException } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { ENV, type DashboardEnv } from "../config/env";
import { DiscordService } from "./discord.service";
import { SessionService, SESSION_COOKIE } from "./session.service";
import { Public } from "./public.decorator";
import type { AuthenticatedRequest } from "./session.guard";

const STATE_COOKIE = "robtic_oauth_state";

@Controller("auth")
export class AuthController {
    constructor(
        @Inject(ENV) private readonly env: DashboardEnv,
        private readonly discord: DiscordService,
        private readonly sessions: SessionService,
    ) {}

    /**
     * Starts the OAuth handshake.
     *
     * The `state` is minted here and stored in a short-lived cookie so the callback can prove the
     * response belongs to a handshake this browser began — without it, anyone can feed a victim a
     * callback URL and log them into an attacker's account.
     */
    @Public()
    @Get("login")
    login(@Res() response: Response): void {
        const state = randomBytes(16).toString("hex");

        response.cookie(STATE_COOKIE, state, {
            httpOnly: true,
            sameSite: "lax",
            secure: this.env.secureCookies,
            maxAge: 5 * 60 * 1000,
            path: "/",
        });

        response.redirect(this.discord.authorizeUrl(state));
    }

    @Public()
    @Get("callback")
    async callback(
        @Query("code") code: string | undefined,
        @Query("state") state: string | undefined,
        @Req() request: Request,
        @Res() response: Response,
    ): Promise<void> {
        const expected = request.cookies?.[STATE_COOKIE];
        if (!code || !state || !expected || state !== expected) {
            throw new UnauthorizedException("This sign-in link is no longer valid — start again");
        }

        response.clearCookie(STATE_COOKIE, { path: "/" });

        const accessToken = await this.discord.exchangeCode(code);
        const user = await this.discord.currentUser(accessToken);

        response.cookie(SESSION_COOKIE, this.sessions.issue(user, accessToken), this.sessions.cookieOptions());
        response.redirect(`${this.env.dashboardUrl}/guilds`);
    }

    @Get("me")
    me(@Req() request: AuthenticatedRequest) {
        const { sub, username, avatar } = request.session;
        return { id: sub, username, avatar };
    }

    @Public()
    @Get("logout")
    logout(@Res() response: Response): void {
        response.clearCookie(SESSION_COOKIE, { path: "/" });
        response.redirect(this.env.dashboardUrl);
    }
}
