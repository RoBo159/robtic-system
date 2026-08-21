import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { IS_PUBLIC_KEY } from "../src/common";

/**
 * Builds the Nest application and asserts what it exposes, without a database or a network port.
 *
 * Two failures this catches that nothing else does. First, Bun only applies legacy decorators when
 * it reads an `experimentalDecorators` tsconfig, and it resolves that from the working directory —
 * launched from the repo root instead of this package, every `@Controller` throws at import time.
 * Second, and worse because it is silent: a controller added without `@UseGuards(GuildAccessGuard)`
 * serves another server's configuration to anyone with a session.
 *
 * In `test/` rather than `src/`: it is not part of the application, and having it under `src/` meant
 * the thing that checks the build was also part of what it checked.
 */
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures++;
};

process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017/route-check";
process.env.DISCORD_CLIENT_ID ??= "0";
process.env.DISCORD_CLIENT_SECRET ??= "x";
process.env.DISCORD_BOT_TOKEN ??= "x";
process.env.DASHBOARD_SESSION_SECRET ??= "route-check";

const { AppModule } = await import("../src/app.module");

const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ["error"],
    abortOnError: false,
}).catch((error: unknown) => {
    console.error("Nest failed to build the application:", error);
    process.exit(1);
});
await app.init();

const router = app.getHttpAdapter().getInstance()._router ?? app.getHttpAdapter().getInstance().router;
const layers: Array<{ route?: { path: string; methods: Record<string, boolean> } }> = router?.stack ?? [];

const routes = layers
    .filter(layer => layer.route)
    .map(layer => ({
        path: layer.route!.path,
        method: Object.keys(layer.route!.methods)[0]!.toUpperCase(),
    }));

console.log(`${routes.length} route(s) registered\n`);
for (const route of routes) console.log(`  ${route.method.padEnd(6)} ${route.path}`);

const paths = new Set(routes.map(route => route.path));

console.log("");
check("health is served", paths.has("/health"));
check("the OAuth handshake is served", paths.has("/auth/login") && paths.has("/auth/callback"));
check("the guild picker is served", paths.has("/guilds"));
check("settings are readable", paths.has("/guilds/:guildId/settings"));
check("moderation is readable", paths.has("/guilds/:guildId/moderation/cases"));
check("quests are readable", paths.has("/guilds/:guildId/quests/settings"));
check("the leaderboard is served", paths.has("/guilds/:guildId/economy/leaderboard"));

const moderationWrites = routes.filter(route => route.path.includes("/moderation") && route.method !== "GET");
check(
    "moderation exposes no writes",
    moderationWrites.length === 0,
    moderationWrites.map(route => `${route.method} ${route.path}`).join(", "),
);

const { GuildAccessGuard } = await import("../src/auth/guards");

const guildScoped = [
    ["SettingsController", (await import("../src/settings/controllers")).SettingsController],
    ["ModerationController", (await import("../src/moderation/controllers")).ModerationController],
    ["QuestsController", (await import("../src/quests/controllers")).QuestsController],
    ["EconomyController", (await import("../src/economy/controllers")).EconomyController],
] as const;

for (const [name, controller] of guildScoped) {
    const guards = Reflect.getMetadata("__guards__", controller) ?? [];
    check(`${name} is guarded by GuildAccessGuard`, guards.includes(GuildAccessGuard));
}

const { GuildsController } = await import("../src/guilds/controllers");
const directoryGuards = Reflect.getMetadata("__guards__", GuildsController.prototype.directory) ?? [];
check("GuildsController.directory is guarded by GuildAccessGuard", directoryGuards.includes(GuildAccessGuard));
check(
    "GET /guilds is not guild-scoped",
    (Reflect.getMetadata("__guards__", GuildsController) ?? []).length === 0,
);

const CHECKED_PREFIXES = ["/guilds/:guildId/settings", "/guilds/:guildId/moderation", "/guilds/:guildId/quests", "/guilds/:guildId/economy", "/guilds/:guildId/directory"];
const unchecked = [...paths].filter(
    path => path.startsWith("/guilds/:guildId") && !CHECKED_PREFIXES.some(prefix => path.startsWith(prefix)),
);
check("every guild-scoped route belongs to a checked controller", unchecked.length === 0, unchecked.join(", "));

const { AuthController } = await import("../src/auth/controllers");
const { HealthController } = await import("../src/health/controllers");

check("login is public", Reflect.getMetadata(IS_PUBLIC_KEY, AuthController.prototype.login) === true);
check("callback is public", Reflect.getMetadata(IS_PUBLIC_KEY, AuthController.prototype.callback) === true);
check("logout is public", Reflect.getMetadata(IS_PUBLIC_KEY, AuthController.prototype.logout) === true);
check("health is public", Reflect.getMetadata(IS_PUBLIC_KEY, HealthController.prototype.check) === true);
check("me is not public", Reflect.getMetadata(IS_PUBLIC_KEY, AuthController.prototype.me) === undefined);

await app.close();

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
