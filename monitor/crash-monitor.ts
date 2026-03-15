import pm2 from "pm2"
import { reportServiceStatus } from "../src/core/utils/statusSystem/status";

interface Pm2Packet {
    process: {
        name: string;
        status: string;
    };
    event: string;
}

pm2.connect((err: unknown) => {
    if (err) {
        console.error(err);
        reportServiceStatus("crash-monitor", "Crash Monitor (monitor/crash-monitor.ts)", "OFFLINE", String(err));
        process.exit(2);
    }

    reportServiceStatus("crash-monitor", "Crash Monitor (monitor/crash-monitor.ts)", "HEALTHY", "Connected to PM2 event bus");
    
    pm2.launchBus((err : unknown, bus: any) => {
        if (err) {
            reportServiceStatus("crash-monitor", "Crash Monitor (monitor/crash-monitor.ts)", "OFFLINE", String(err));
            return;
        }

        bus.on("process:event", async (data: Pm2Packet) => {
            if (data.event === "exit") {
                reportServiceStatus(
                    "crash-monitor",
                    "Crash Monitor (monitor/crash-monitor.ts)",
                    "DEGRADED",
                    `Process ${data.process.name} exited`,
                    [
                        `Process: ${data.process.name}`,
                        `Status: ${data.process.status}`,
                    ]
                );
            } else if (data.event === "online") {
                reportServiceStatus(
                    "crash-monitor",
                    "Crash Monitor (monitor/crash-monitor.ts)",
                    "HEALTHY",
                    `Process ${data.process.name} is online`
                );
            }
        })
    })
})