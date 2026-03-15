import os from "os"
import { reportServiceStatus } from "../src/core/utils/statusSystem/status";

setInterval(async () => {

    const total = os.totalmem()
    const free = os.freemem()
    const used = total - free

    const usage = used / total

    if (usage > 0.85) {
        reportServiceStatus(
            "memory-monitor",
            "Memory Monitor (monitor/memory-monitor.ts)",
            "DEGRADED",
            "Server memory usage exceeded safe threshold",
            [
                `Used: ${(used / 1024 / 1024).toFixed(0)} MB`,
                `Total: ${(total / 1024 / 1024).toFixed(0)} MB`,
                `Usage: ${(usage * 100).toFixed(1)}%`,
            ]
        )
    } else {
        reportServiceStatus(
            "memory-monitor",
            "Memory Monitor (monitor/memory-monitor.ts)",
            "HEALTHY",
            "Memory usage within normal range",
            [`Usage: ${(usage * 100).toFixed(1)}%`]
        )
    }

}, 30000)