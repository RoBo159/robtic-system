import { TextInputStyle } from "discord.js";
import { PROJECT_SHARE_MODAL } from "@constants";

export type ModalFieldType = "text" | "menu" | "image";

export interface ModalField {
    id: string;
    type: ModalFieldType;
    title: string;
    description: string;
    placeholder: string;
    options?: readonly string[];
    style?: TextInputStyle;
}

const FIELDS = PROJECT_SHARE_MODAL.fields;

/** Ordered field definitions rendered into the /project share modal. */
export const PROJECT_MODAL_FIELDS: ModalField[] = [
    {
        id: "title",
        type: "text",
        title: FIELDS.title.label,
        description: FIELDS.title.description,
        placeholder: FIELDS.title.placeholder,
        style: TextInputStyle.Short,
    },
    {
        id: "description",
        type: "text",
        title: FIELDS.description.label,
        description: FIELDS.description.description,
        placeholder: FIELDS.description.placeholder,
        style: TextInputStyle.Paragraph,
    },
    {
        id: "type",
        type: "menu",
        title: FIELDS.type.label,
        description: FIELDS.type.description,
        placeholder: FIELDS.type.placeholder,
        options: FIELDS.type.options,
    },
    {
        id: "link",
        type: "text",
        title: FIELDS.link.label,
        description: FIELDS.link.description,
        placeholder: FIELDS.link.placeholder,
        style: TextInputStyle.Short,
    },
];
