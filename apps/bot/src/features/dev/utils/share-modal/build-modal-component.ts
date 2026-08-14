import { StringSelectMenuBuilder, TextInputBuilder, TextInputStyle } from "discord.js";
import { PROJECT_INPUT_LIMITS } from "@constants";
import type { ModalField } from "./modal-fields";

export function buildModalComponent(field: ModalField) {
    switch (field.type) {
        case "text": {
            const isShort = field.style !== TextInputStyle.Paragraph;
            return new TextInputBuilder()
                .setCustomId(field.id)
                .setStyle(field.style ?? TextInputStyle.Short)
                .setMaxLength(isShort ? PROJECT_INPUT_LIMITS.shortMax : PROJECT_INPUT_LIMITS.paragraphMax)
                .setMinLength(isShort ? PROJECT_INPUT_LIMITS.shortMin : PROJECT_INPUT_LIMITS.paragraphMin)
                .setPlaceholder(field.placeholder);
        }
        case "menu": {
            const menu = new StringSelectMenuBuilder()
                .setCustomId(field.id)
                .setPlaceholder(field.placeholder)
                .setRequired(true);

            if (field.options) {
                menu.addOptions(field.options.map(option => ({ label: option, value: option.toLowerCase() })));
            }
            return menu;
        }
        default:
            return null;
    }
}
