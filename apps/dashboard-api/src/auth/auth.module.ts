import { Global, Module } from "@nestjs/common";
import { AuthController } from "./controllers";
import { GuildAccessGuard, SessionGuard } from "./guards";
import { AuthService, DiscordService, OAuthStateService, SessionService } from "./services";

/**
 * Authentication and authorization for the whole service.
 *
 * `@Global()` because every feature module needs `GuildAccessGuard`, and re-importing this in each
 * one only creates a way to forget it — on the one controller where forgetting is a data leak
 * rather than an error.
 *
 * `DiscordService` is exported for the same reason: `GuildsController` needs the visitor's guild
 * list, and the alternative to sharing this client is a second one with a second cache, which would
 * double the calls to an endpoint Discord rate-limits hard.
 */
@Global()
@Module({
    controllers: [AuthController],
    providers: [AuthService, DiscordService, OAuthStateService, SessionService, SessionGuard, GuildAccessGuard],
    exports: [DiscordService, SessionService, SessionGuard, GuildAccessGuard],
})
export class AuthModule {}
