import { Module } from "@nestjs/common";
import { GuildsController } from "./controllers";
import { GuildsService } from "./services";

/**
 * No `imports`: `DiscordService` comes from the `@Global()` AuthModule.
 *
 * That is the one dependency this module has, and it is on the module that owns the credential
 * being used — a feature module reaching Discord through its own client would be a second cache and
 * a second place to get the bot-versus-user token distinction wrong.
 */
@Module({
    controllers: [GuildsController],
    providers: [GuildsService],
    exports: [GuildsService],
})
export class GuildsModule {}
