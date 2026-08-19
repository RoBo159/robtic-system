import { Controller, Get } from "@nestjs/common";
import mongoose from "mongoose";
import { Public } from "./auth/public.decorator";

@Controller("health")
export class HealthController {
    /** Open, because the container probe has no session to present. Reports no guild data. */
    @Public()
    @Get()
    check() {
        return {
            status: "ok",
            uptimeMs: Math.round(process.uptime() * 1000),
            database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        };
    }
}
