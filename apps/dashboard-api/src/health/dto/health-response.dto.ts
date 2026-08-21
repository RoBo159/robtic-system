export interface HealthResponse {
    status: "ok";
    uptimeMs: number;
    database: "connected" | "disconnected";
}
