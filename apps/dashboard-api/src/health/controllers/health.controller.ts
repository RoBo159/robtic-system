import { Controller, Get } from "@nestjs/common";
import { Public } from "../../common";
import type { HealthResponse } from "../dto";
import { HealthService } from "../services";

@Controller("health")
export class HealthController {
    constructor(private readonly health: HealthService) {}

    /** Open, because the container probe has no session to present. Reports no guild data. */
    @Public()
    @Get()
    check(): HealthResponse {
        return this.health.check();
    }
}
