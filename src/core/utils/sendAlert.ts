import { reportServiceStatus } from "./statusSystem/status";

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
    const status: StatusType = color >= 0xff0000
        ? "OFFLINE"
        : color >= 0xffcc00
            ? "DEGRADED"
            : "HEALTHY";

    const detailLines = fields.map((field) => `${field.name}: ${field.value}`);

    reportServiceStatus(
        "alerts",
        "Alert Stream",
        status,
        `${title} - ${description}`,
        detailLines
    );
}