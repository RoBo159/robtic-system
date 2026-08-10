import path from "path";
import { AttachmentBuilder, ContainerBuilder, MessageFlags, type StringSelectMenuInteraction } from "discord.js";
import type { ComponentHandler } from "@typings/command";
import { ACTIVITY_OPTIONS } from "../utils/panels/definitions/activity-system";

const LINE_IMAGE_PATH = path.join(process.cwd(), "images", "line.png");

export const activitySystemSelectHandler: ComponentHandler<StringSelectMenuInteraction> = {
    customId: "activity_system_select",

    async run(interaction: StringSelectMenuInteraction) {
        const value = interaction.values[0];
        const option = ACTIVITY_OPTIONS.find(o => o.value === value);

        if (!option) {
            await interaction.reply({ content: "This option is no longer available.", flags: MessageFlags.Ephemeral });
            return;
        }

        const lineAttachment = new AttachmentBuilder(LINE_IMAGE_PATH, { name: "line.png" });

        const container = new ContainerBuilder()
            .addTextDisplayComponents(td => td.setContent(`## ${option.emoji ? `${option.emoji} ` : ""}${option.label}`))
            .addTextDisplayComponents(td => td.setContent(option.content))
            .addMediaGalleryComponents(mg => mg.addItems(item => item.setURL("attachment://line.png")));

        await interaction.reply({
            components: [container],
            files: [lineAttachment],
            flags: [MessageFlags.IsComponentsV2, MessageFlags.Ephemeral],
        });
    },
};
