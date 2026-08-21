import { Module } from "@nestjs/common";
import { HealthController } from "./controllers";
import { HealthService } from "./services";

@Module({
    controllers: [HealthController],
    providers: [HealthService],
})
export class HealthModule {}
