import { Global, Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { DiscordService } from "./discord.service";
import { SessionService } from "./session.service";
import { SessionGuard } from "./session.guard";
import { GuildAccessGuard } from "./guild-access.guard";

/**
 * Global because every feature module needs GuildAccessGuard, and re-importing this in each one
 * only creates a way to forget it.
 */
@Global()
@Module({
    controllers: [AuthController],
    providers: [DiscordService, SessionService, SessionGuard, GuildAccessGuard],
    exports: [DiscordService, SessionService, SessionGuard, GuildAccessGuard],
})
export class AuthModule {}
