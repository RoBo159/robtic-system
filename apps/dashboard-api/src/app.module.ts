import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ConfigModule } from "./config/config.module";
import { AuthModule } from "./auth/auth.module";
import { SessionGuard } from "./auth/session.guard";
import { GuildsController } from "./guilds/guilds.controller";
import { SettingsController } from "./settings/settings.controller";
import { SettingsService } from "./settings/settings.service";
import { ModerationController } from "./moderation/moderation.controller";
import { QuestsController, EconomyController } from "./quests/quests.controller";
import { HealthController } from "./health.controller";

@Module({
    imports: [ConfigModule, AuthModule],
    controllers: [
        HealthController,
        GuildsController,
        SettingsController,
        ModerationController,
        QuestsController,
        EconomyController,
    ],
    providers: [
        SettingsService,

        // Authentication is the default, not an opt-in — see public.decorator.ts. Guild-level
        // authorization stays per controller, because only some routes name a guild.
        { provide: APP_GUARD, useClass: SessionGuard },
    ],
})
export class AppModule {}
