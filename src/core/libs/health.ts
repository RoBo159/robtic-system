import { reportServiceStatus } from "@core/utils";

export function monitorProcess() {
    process.on("SIGINT", async () => {
        reportServiceStatus("process", "Node Process", "OFFLINE", "Process received SIGINT");
        process.exit()
    })

    process.on("SIGTERM", async () => {
        reportServiceStatus("process", "Node Process", "OFFLINE", "Process terminated");
        process.exit()
    })

    process.on("uncaughtException", async (error) => {
        reportServiceStatus("process", "Node Process", "DEGRADED", "Uncaught exception", [String(error)]);
    })

    process.on("unhandledRejection", async (reason) => {
        reportServiceStatus("process", "Node Process", "DEGRADED", "Unhandled promise rejection", [String(reason)]);
    })
}