import { Global, Module } from "@nestjs/common";
import { ENV, loadEnv } from "./env";

/**
 * The environment, as an injectable.
 *
 * Its own global module rather than a provider on AppModule: a `@Global()` module such as AuthModule
 * is visible *to* everyone but cannot itself reach into AppModule's providers, so `DiscordService`
 * asking for `DASHBOARD_ENV` failed to resolve at boot. A global module holding it fixes that for
 * every consumer at once.
 */
@Global()
@Module({
    providers: [{ provide: ENV, useFactory: loadEnv }],
    exports: [ENV],
})
export class ConfigModule {}
