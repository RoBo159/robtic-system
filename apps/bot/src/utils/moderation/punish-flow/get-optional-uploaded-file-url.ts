import type { ModalSubmitFields } from "discord.js";

/** discord.js throws if customId wasn't part of the submitted modal — the two modal variants don't always share fields. */
export function getOptionalUploadedFileUrl(fields: ModalSubmitFields, customId: string): string | null {
    try {
        return fields.getUploadedFiles(customId, false)?.first()?.url ?? null;
    } catch {
        return null;
    }
}
