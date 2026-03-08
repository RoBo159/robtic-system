import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";
import { Logger } from "@core/libs";

export interface DiscordUser {
    id: string;
    username: string;
    avatar: string | null;
    accessToken: string;
    refreshToken: string;
}

declare global {
    namespace Express {
        interface User extends DiscordUser {}
    }
}

export function setupPassport() {
    const clientId = process.env.DISCORD_CLIENT_ID;
    const clientSecret = process.env.DISCORD_CLIENT_SECRET;
    const callbackURL = process.env.DASHBOARD_CALLBACK_URL || "http://localhost:3300/auth/callback";

    if (!clientId || !clientSecret) {
        Logger.error("DISCORD_CLIENT_ID or DISCORD_CLIENT_SECRET missing.", "API");
        return;
    }

    passport.serializeUser((user, done) => done(null, user));
    passport.deserializeUser((user: DiscordUser, done) => done(null, user));

    passport.use(
        new DiscordStrategy(
            {
                clientID: clientId,
                clientSecret: clientSecret,
                callbackURL,
                scope: ["identify", "guilds"],
            },
            (_accessToken, _refreshToken, profile, done) => {
                const user: DiscordUser = {
                    id: profile.id,
                    username: profile.username,
                    avatar: profile.avatar,
                    accessToken: _accessToken,
                    refreshToken: _refreshToken,
                };
                return done(null, user);
            },
        ),
    );

    Logger.success("Passport Discord strategy configured", "API");
}
