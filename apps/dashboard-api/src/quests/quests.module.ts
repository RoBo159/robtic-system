import { Module } from "@nestjs/common";
import { QuestsController } from "./controllers";
import { QuestsRepository } from "./repositories";
import { QuestsService } from "./services";

@Module({
    controllers: [QuestsController],
    providers: [QuestsService, QuestsRepository],
    exports: [QuestsService],
})
export class QuestsModule {}
