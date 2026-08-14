import type { REST } from "discord.js";
import { Logger } from "@logger";

/**
 * Publishes one payload to one route.
 *
 * `rest.put` fully replaces a route's command list, so this is also how a route is emptied: pass an
 * empty payload. Failures are reported and swallowed, because the two routes are published
 * independently — a 403 on the admin guild must not stop the main payload from going out.
 */
export async function putCommandRoute(
    rest: REST,
    route: `/${string}`,
    payload: object[],
    label: string,
    botName: BotName,
): Promise<boolean> {
    try {
        await rest.put(route, { body: payload });
        Logger.success(`Registered ${payload.length} commands to ${label}`, botName);
        return true;
    } catch (error) {
        reportRegistrationFailure(error, payload, label, botName);
        return false;
    }
}

function reportRegistrationFailure(error: unknown, payload: object[], label: string, botName: BotName): void {
    const raw = (error as { rawError?: { errors?: Record<string, unknown>; message?: string } }).rawError;

    Logger.error(`Failed to register commands to ${label}: ${(error as Error).message}`, botName);

    if (!raw?.errors) return;

    for (const [index, detail] of Object.entries(raw.errors)) {
        const name = (payload[Number(index)] as { name?: string })?.name ?? `#${index}`;
        Logger.error(`  → "${name}": ${JSON.stringify(detail)}`, botName);
    }
}
