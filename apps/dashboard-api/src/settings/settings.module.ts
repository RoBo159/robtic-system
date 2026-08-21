import { Module } from "@nestjs/common";
import { SettingsController } from "./controllers";
import { SettingsRepository } from "./repositories";
import { SettingsService } from "./services";

@Module({
    controllers: [SettingsController],
    providers: [SettingsService, SettingsRepository],
    exports: [SettingsService],
})
export class SettingsModule {}
