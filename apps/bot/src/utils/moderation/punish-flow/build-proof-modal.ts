import {
    ModalBuilder,
    LabelBuilder,
    TextInputBuilder,
    TextInputStyle,
    FileUploadBuilder,
} from "discord.js";
import type { PunishType } from "@typings/punishment";
import { PUNISH_TITLES, PUNISH_PROOF_MESSAGES, PROOF_NOTE_MAX_LENGTH, PUNISH_EXTRA_NONE } from "@constants";
import { proofModalCustomId } from "./proof-custom-id";

/** `guildId` is embedded since this modal can also be shown from a DM button (no guild context there). */
export function buildProofModal(
    type: PunishType,
    guildId: string,
    targetId: string,
    reasonKey: string,
    moderatorId: string,
    extra = PUNISH_EXTRA_NONE,
): ModalBuilder {
    const modal = new ModalBuilder()
        .setCustomId(proofModalCustomId(type, guildId, targetId, reasonKey, moderatorId, extra))
        .setTitle(PUNISH_PROOF_MESSAGES.modalTitle(PUNISH_TITLES[type]));

    const noteLabel = new LabelBuilder()
        .setLabel(PUNISH_PROOF_MESSAGES.noteLabel)
        .setDescription(PUNISH_PROOF_MESSAGES.noteDescription)
        .setTextInputComponent(
            new TextInputBuilder()
                .setCustomId("note")
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
                .setMaxLength(PROOF_NOTE_MAX_LENGTH)
        );

    const fileLabel = new LabelBuilder()
        .setLabel(PUNISH_PROOF_MESSAGES.fileLabel)
        .setDescription(PUNISH_PROOF_MESSAGES.fileDescription)
        .setFileUploadComponent(
            new FileUploadBuilder()
                .setCustomId("proof")
                .setMinValues(1)
                .setMaxValues(1)
                .setRequired(true)
        );

    modal.addLabelComponents(noteLabel, fileLabel);
    return modal;
}
