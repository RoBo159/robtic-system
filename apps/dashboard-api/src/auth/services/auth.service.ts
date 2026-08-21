import { Inject, Injectable } from "@nestjs/common";
import type { ConfigType } from "@nestjs/config";
import { appConfig } from "../../config";
import type { CookieDescriptor, SessionPayload } from "../interfaces";
import type { SessionUserResponse } from "../dto";
import { DiscordService } from "./discord.service";
import { SessionService } from "./session.service";

/**
 * The sign-in flow, as three steps a controller can call in order.
 *
 * `AuthController` used to hold this: it minted state, exchanged the code with Discord, fetched the
 * user and assembled the session, interleaved with `response.cookie` and `response.redirect` calls.
 * Splitting them puts every decision here and leaves the controller doing only what a controller can
 * do — read the request, write the response.
 */
@Injectable()
export class AuthService {
    constructor(
        @Inject(appConfig.KEY) private readonly app: ConfigType<typeof appConfig>,
        private readonly discord: DiscordService,
        private readonly sessions: SessionService,
    ) {}

    authorizeUrl(state: string): string {
        return this.discord.authorizeUrl(state);
    }

    /** Trades Discord's one-time code for a session cookie. */
    async establishSession(code: string): Promise<CookieDescriptor> {
        const accessToken = await this.discord.exchangeCode(code);
        const user = await this.discord.currentUser(accessToken);

        return this.sessions.issue(user, accessToken);
    }

    /**
     * The session, as the browser is allowed to see it.
     *
     * Deliberately not the whole payload: `accessToken` is a live Discord credential and `jti` is an
     * internal handle. Returning `request.session` directly would have leaked both to any page
     * script that called `/auth/me`.
     */
    describe(session: SessionPayload): SessionUserResponse {
        return { id: session.sub, username: session.username, avatar: session.avatar };
    }

    /** The cookie logout has to clear, name and path both — see `SessionService.clearTarget`. */
    sessionClearTarget(): { name: string; options: { path: string } } {
        return this.sessions.clearTarget();
    }

    /** Where to send the browser once it holds a session. */
    get guildPickerUrl(): string {
        return `${this.app.dashboardUrl}/guilds`;
    }

    /** Where to send the browser once it does not. */
    get landingUrl(): string {
        return this.app.dashboardUrl;
    }
}
