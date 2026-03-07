type StatusType = "HEALTHY" | "DEGRADED" | "OFFLINE"

const ENV = process.env.NODE_ENV || "development"

const FOOTER =
    ENV === "production"
        ? "Robtic © Private System"
        : "Robtic Development Instance"

const COLORS = {
    HEALTHY: 5763719,
    DEGRADED: 16776960,
    OFFLINE: 15548997
}

const ICONS = {
    HEALTHY: "🟢",
    DEGRADED: "🟡",
    OFFLINE: "🔴"
}

export async function sendStatus(
    status: StatusType,
    title: string,
    description: string
) {
    const webhook = process.env.STATUS_WEBHOOK
    if (!webhook) return

    await fetch(webhook, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            username: "Bot Monitor",
            embeds: [
                {
                    title: `${ICONS[status]} ${title}`,
                    description,
                    color: COLORS[status],
                    footer: {
                        text: FOOTER
                    },
                    timestamp: new Date().toISOString()
                }
            ]
        })
    })
}