import os from "os"
import { sendAlert } from "../src/core/utils/sendAlert";

setInterval(async () => {

    const total = os.totalmem()
    const free = os.freemem()
    const used = total - free

    const usage = used / total

    if (usage > 0.85) {

        await sendAlert({
            title: "Memory Usage Spike",
            description: "Server memory usage exceeded safe threshold",
            color: 16753920,
            fields: [
                { name: "Used", value: `${(used / 1024 / 1024).toFixed(0)} MB` },
                { name: "Total", value: `${(total / 1024 / 1024).toFixed(0)} MB` },
                { name: "Usage", value: `${(usage * 100).toFixed(1)}%` }
            ]
        })

    }

}, 30000)