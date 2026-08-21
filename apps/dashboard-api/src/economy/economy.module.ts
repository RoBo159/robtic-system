import { Module } from "@nestjs/common";
import { EconomyController } from "./controllers";
import { EconomyRepository } from "./repositories";
import { EconomyService } from "./services";

@Module({
    controllers: [EconomyController],
    providers: [EconomyService, EconomyRepository],
    exports: [EconomyService],
})
export class EconomyModule {}
