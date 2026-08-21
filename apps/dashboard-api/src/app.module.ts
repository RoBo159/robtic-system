import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { AuthModule } from "./auth";
import { SessionGuard } from "./auth/guards";
import { AllExceptionsFilter } from "./common";
import { ConfigurationModule } from "./config";
import { EconomyModule } from "./economy";
import { GuildsModule } from "./guilds";
import { HealthModule } from "./health";
import { ModerationModule } from "./moderation";
import { QuestsModule } from "./quests";
import { SettingsModule } from "./settings";

/**
 * The composition root, and nothing else.
 *
 * It declares no controller and no feature provider of its own — every one of those now belongs to
 * the module that owns it. What was here before was a flat list of six controllers and a service,
 * which meant adding a feature meant editing this file, and reading this file told you nothing about
 * how the features related.
 *
 * Import order is the dependency order: configuration must resolve before anything reads it, and
 * AuthModule must be constructed before the feature modules whose controllers reference its guards.
 * Both are `@Global()`, which is what lets the six feature modules below declare no imports at all.
 */
@Module({
    imports: [
        ConfigurationModule,
        AuthModule,

        HealthModule,
        GuildsModule,
        SettingsModule,
        ModerationModule,
        QuestsModule,
        EconomyModule,
    ],
    providers: [
        { provide: APP_GUARD, useClass: SessionGuard },

        { provide: APP_FILTER, useClass: AllExceptionsFilter },
    ],
})
export class AppModule {}
