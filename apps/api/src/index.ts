import { connectDatabase } from "@database/connection";
import { Logger } from "@logger";
import { exchangeToken } from "./routes/exchange-token";
import { getProfile } from "./routes/get-profile";
import { searchUsers } from "./routes/search-users";
import { getLeaderboard } from "./routes/get-leaderboard";
import { getAdminConfigRoute } from "./routes/get-admin-config";
import { updateAdminConfigRoute } from "./routes/update-admin-config";
import { moderateRoute } from "./routes/moderate";
import { getSettingsRoute } from "./routes/get-settings";
import { updateSettingsRoute } from "./routes/update-settings";
import { customizeProfileRoute } from "./routes/customize-profile";
import { getBotAdminConfigRoute } from "./routes/get-bot-admin-config";
import { updateBotAdminConfigRoute } from "./routes/update-bot-admin-config";
import { getBotProfileRoute } from "./routes/get-bot-profile";
import { updateBotProfileRoute } from "./routes/update-bot-profile";
import { getProfileDetailsRoute } from "./routes/get-profile-details";
import { submitProjectRoute } from "./routes/submit-project";
import { getMyProjectsRoute } from "./routes/get-my-projects";
import { jsonError, API_ERRORS } from "./lib/json-response";

const CTX = "api";
const port = Number(process.env.API_PORT ?? 3001);

if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET) {
    Logger.warn("DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET are not set — /api/token will fail", CTX);
}

if (process.env.MONGODB_URI) {
    await connectDatabase(process.env.MONGODB_URI);
} else {
    Logger.warn("MONGODB_URI is not set — profile, search and leaderboard routes will fail", CTX);
}

const PROFILE_PATH = /^\/api\/profile(?:\/(\d{15,25}))?$/;
const PROFILE_DETAILS_PATH = /^\/api\/profile\/(\d{15,25})\/details$/;

Bun.serve({
    port,
    async fetch(request) {
        const url = new URL(request.url);

        try {
            if (request.method === "POST" && url.pathname === "/api/token") {
                return await exchangeToken(request);
            }
            if (request.method === "POST" && url.pathname === "/api/admin/config") {
                return await updateAdminConfigRoute(request);
            }
            if (request.method === "POST" && url.pathname === "/api/admin/moderate") {
                return await moderateRoute(request);
            }
            if (request.method === "POST" && url.pathname === "/api/settings") {
                return await updateSettingsRoute(request);
            }
            if (request.method === "POST" && url.pathname === "/api/profile/customize") {
                return await customizeProfileRoute(request);
            }
            if (request.method === "POST" && url.pathname === "/api/bot-admin/config") {
                return await updateBotAdminConfigRoute(request);
            }
            if (request.method === "POST" && url.pathname === "/api/admin/bot-profile") {
                return await updateBotProfileRoute(request);
            }
            if (request.method === "POST" && url.pathname === "/api/projects") {
                return await submitProjectRoute(request);
            }

            if (request.method === "GET") {
                if (url.pathname === "/api/admin/config") {
                    return await getAdminConfigRoute(request, url);
                }
                if (url.pathname === "/api/settings") {
                    return await getSettingsRoute(request);
                }
                if (url.pathname === "/api/bot-admin/config") {
                    return await getBotAdminConfigRoute(request);
                }
                if (url.pathname === "/api/admin/bot-profile") {
                    return await getBotProfileRoute(request, url);
                }
                if (url.pathname === "/api/projects/mine") {
                    return await getMyProjectsRoute(request);
                }
                const detailsMatch = PROFILE_DETAILS_PATH.exec(url.pathname);
                if (detailsMatch) {
                    return await getProfileDetailsRoute(request, url, detailsMatch[1]);
                }
                const profileMatch = PROFILE_PATH.exec(url.pathname);
                if (profileMatch) {
                    return await getProfile(request, url, profileMatch[1] ?? null);
                }
                if (url.pathname === "/api/search") {
                    return await searchUsers(request, url);
                }
                if (url.pathname === "/api/top") {
                    return await getLeaderboard(request, url);
                }
                if (url.pathname === "/api/health") {
                    return Response.json({ status: "ok" });
                }
            }

            return jsonError(API_ERRORS.notFound, 404);
        } catch (error) {
            Logger.error(`Unhandled error on ${request.method} ${url.pathname}: ${error}`, CTX);
            return jsonError(API_ERRORS.serverError, 500);
        }
    },
});

Logger.success(`Listening on http://localhost:${port}`, CTX);
