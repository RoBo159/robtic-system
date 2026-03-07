import { sendStatus } from "@core/utils";

export function monitorProcess() {
    process.on("SIGINT", async () => {
        await sendStatus(
            "OFFLINE",
            "Bot Shutdown",
            "Process received SIGINT"
        )
        process.exit()
    })

    process.on("SIGTERM", async () => {
        await sendStatus(
            "OFFLINE",
            "Bot Shutdown",
            "Process terminated"
        )
        process.exit()
    })

    process.on("uncaughtException", async (error) => {
        await sendStatus(
            "DEGRADED",
            "Uncaught Exception",
            String(error)
        )
    })

    process.on("unhandledRejection", async (reason) => {
        await sendStatus(
            "DEGRADED",
            "Unhandled Promise Rejection",
            String(reason)
        )
    })
}