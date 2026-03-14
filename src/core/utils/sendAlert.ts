const WEBHOOK = process.env.MONITOR_WEBHOOK!

export async function sendAlert({
    title,
    description,
    color,
    fields = []
}: {
    title: string
    description: string
    color: number
    fields?: { name: string; value: string; inline?: boolean }[]
}) {
    await fetch(WEBHOOK, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            embeds: [
                {
                    title,
                    description,
                    color,
                    fields,
                    timestamp: new Date().toISOString(),
                    footer: {
                        text: "Robtic Monitoring System"
                    }
                }
            ]
        })
    })
}