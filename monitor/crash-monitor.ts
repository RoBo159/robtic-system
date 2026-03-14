import pm2 from "pm2"
import fetch from "node-fetch"

const WEBHOOK = process.env.MONITOR_WEBHOOK || "";

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
        process.exit(2);
    }
    
    pm2.launchBus((err : unknown, bus: any) => {
        bus.on("process:event", async (data: Pm2Packet) => {
            if (data.event === "exit") {

                await fetch(WEBHOOK, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        embeds: [{
                            title: "Bot Crash Detected",
                            description: `Process **${data.process.name}** crashed`,
                            color: 15158332,
                            fields: [
                                { name: "Process", value: data.process.name },
                                { name: "Status", value: data.process.status }
                            ],
                            timestamp: new Date().toISOString()
                        }]
                    })
                })

            }
        })
    })
})