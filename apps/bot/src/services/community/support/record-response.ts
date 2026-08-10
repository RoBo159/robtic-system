import { SupportSessionRepository } from "@database/repositories/SupportSessionRepository";
import { Logger } from "@logger";

export async function recordResponse(messageId: string): Promise<void> {
    Logger.debug(`Recording response for session msg=${messageId}`, "community:support");
    await SupportSessionRepository.respond(messageId);
}
