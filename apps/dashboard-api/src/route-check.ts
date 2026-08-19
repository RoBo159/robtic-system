import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { AppModule } from "./app.module";
import { IS_PUBLIC } from "./auth/public.decorator";

/**
 * Builds the Nest application and asserts what it exposes, without a database or a network port.
 *
 * Two failures this catches that nothing else does. First, Bun only applies legacy decorators when
 * it reads an `experimentalDecorators` tsconfig, and it resolves that from the working directory —
 * launched from the repo root instead of this package, every `@Controller` throws at import time.
 * Second, and worse because it is silent: a controller added without `@UseGuards(GuildAccessGuard)`
 * serves another server's configuration to anyone with a session.
 */
let failures = 0;
const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
    if (!ok) failures++;
};

// Nest resolves providers eagerly, so the ENV factory runs — but nothing here opens a connection.
process.env.MONGODB_URI ??= "mongodb://127.0.0.1:27017/route-check";
process.env.DISCORD_CLIENT_ID ??= "0";
process.env.DISCORD_CLIENT_SECRET ??= "x";
process.env.DISCORD_BOT_TOKEN ??= "x";
process.env.DASHBOARD_SESSION_SECRET ??= "route-check";

const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger: ["error"], abortOnError: false })
    .catch((error: unknown) => {
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

// Moderation is read-only on purpose — see moderation.controller.ts. A POST/PATCH appearing under
// it means somebody added a write path that skips the proof and approval flow.
const moderationWrites = routes.filter(route =>
    route.path.includes("/moderation") && route.method !== "GET");
check("moderation exposes no writes", moderationWrites.length === 0,
    moderationWrites.map(route => `${route.method} ${route.path}`).join(", "));

// Every guild-scoped route must carry GuildAccessGuard, or a session alone would reach it.
const { SettingsController } = await import("./settings/settings.controller");
const { ModerationController } = await import("./moderation/moderation.controller");
const { QuestsController, EconomyController } = await import("./quests/quests.controller");
const { GuildAccessGuard } = await import("./auth/guild-access.guard");

for (const controller of [SettingsController, ModerationController, QuestsController, EconomyController]) {
    const guards = Reflect.getMetadata("__guards__", controller) ?? [];
    check(`${controller.name} is guarded by GuildAccessGuard`, guards.includes(GuildAccessGuard));
}

// Only the handshake and the probe may be public.
const { AuthController } = await import("./auth/auth.controller");
const { HealthController } = await import("./health.controller");
const publicHandlers = [
    ...Object.getOwnPropertyNames(AuthController.prototype),
    ...Object.getOwnPropertyNames(HealthController.prototype),
].length;
check("public routes exist to be checked", publicHandlers > 0);
check("login is public", Reflect.getMetadata(IS_PUBLIC, AuthController.prototype.login) === true);
check("me is not public", Reflect.getMetadata(IS_PUBLIC, AuthController.prototype.me) === undefined);

await app.close();

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
