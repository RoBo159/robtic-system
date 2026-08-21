import { Global, Module } from "@nestjs/common";
import { ConfigModule as NestConfigModule } from "@nestjs/config";
import { configurations } from "./configuration";
import { validate } from "./env.validation";

/**
 * The configuration layer, imported once by AppModule.
 *
 * `isGlobal` because configuration is needed by services in every feature module, and re-importing
 * it in each one only creates a way to forget it. This is also what fixed the original bug this
 * module was written for: a `@Global()` module such as AuthModule is visible *to* everyone but
 * cannot itself reach into AppModule's providers, so a `DiscordService` asking AppModule for the
 * environment failed to resolve at boot.
 *
 * `ignoreEnvFile` is deliberate. Every deployment supplies real process environment variables — the
 * compose `env_file:` on the server, the shell in development — and letting @nestjs/config also hunt
 * for a `.env` relative to the working directory would mean the service read different values
 * depending on where it was started from.
 */
@Global()
@Module({
    imports: [
        NestConfigModule.forRoot({
            isGlobal: true,
            ignoreEnvFile: true,
            cache: true,
            load: configurations,
            validate,
        }),
    ],
})
export class ConfigurationModule {}
