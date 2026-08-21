import { Module } from "@nestjs/common";
import { ModerationController } from "./controllers";
import { ModerationRepository } from "./repositories";
import { ModerationService } from "./services";

@Module({
    controllers: [ModerationController],
    providers: [ModerationService, ModerationRepository],
    exports: [ModerationService],
})
export class ModerationModule {}
