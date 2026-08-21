import { Injectable } from "@nestjs/common";
import mongoose from "mongoose";
import type { HealthResponse } from "../dto";

/**
 * What the container probe asks for.
 *
 * Reports the database as a *field* rather than as a failing status code, deliberately. The
 * healthcheck in `infra/docker/compose/docker-compose.yml` treats any 2xx as healthy, and this
 * service can serve `/auth/login` and every cached Discord read with MongoDB down — restarting the
 * container would not reconnect it any faster than mongoose already retries. So a disconnected
 * database is something an operator can see here, not something that puts the container in a
 * restart loop.
 */
@Injectable()
export class HealthService {
    check(): HealthResponse {
        return {
            status: "ok",
            uptimeMs: Math.round(process.uptime() * 1000),
            database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
        };
    }
}
