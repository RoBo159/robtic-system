import type { ModalSubmitFields } from "discord.js";

export function getOptionalText(fields: ModalSubmitFields, customId: string): string {
    try {
        return fields.getTextInputValue(customId);
    } catch {
        return "";
    }
}
