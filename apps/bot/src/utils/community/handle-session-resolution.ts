import type { BotClient } from "@core/bot-client";
import { Logger } from "@logger";
import { resolveSession } from "../../services/community/support";
import { logToChannel, supportPointsEmbed, supportSessionEmbed } from "./activity-log";

export async function handleSessionResolution(
    session: { userMessageId: string; userId: string; claimedBy: string | null; responseTimeMs: number | null },
    guildId: string,
    endedBy: string,
    reason: string,
    client: BotClient,
): Promise<void> {
    const resolved = await resolveSession(session.userMessageId, guildId);
    if (!resolved) return;

    Logger.debug(`[activity] Session resolved: staff=${resolved.staffId} points=${resolved.points}`, client.botName);

    const responseMs = session.responseTimeMs ?? 0;

    await logToChannel(client, "support_points", supportPointsEmbed(resolved.staffId, resolved.points, responseMs));
    await logToChannel(client, "support_points", supportSessionEmbed(
        "resolved", session.userId, resolved.staffId, reason,
    ));
}
