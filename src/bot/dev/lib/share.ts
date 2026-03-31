import { LabelBuilder, ModalBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, type ChatInputCommandInteraction } from "discord.js";

type ModelType = "text" | "menu" | "image";

interface ModalItem {
    _id: string;
    type: ModelType;
    title: string;
    description: string;
    placeholder: string;
    options?: string[];
    style?: TextInputStyle;
}

const data : ModalItem[] = [
    {
        _id: "title",
        type: "text",
        title: "Project Title",
        description: "A concise title for your project (3-100 characters)",
        placeholder: "A concise title for your project",
        style: TextInputStyle.Short,
    },
    {
        _id: "description",
        type: "text",
        title: "Project Description",
        description: "A detailed description of your project (10-2000 characters)",
        placeholder: "A detailed description of your project",
        style: TextInputStyle.Paragraph,
    },
    {
        _id: "type",
        type: "menu",
        title: "Project Type",
        description: "Select the type of your project",
        placeholder: "Select a project type",
        options: ["Web", "Discord", "Other"]
    },
    {
        _id: "link",
        type: "text",
        title: "Project Link",
        description: "A URL to your project (optional)",
        placeholder: "A URL to your project",
        style: TextInputStyle.Short,
    }
]

function buildComponent(item : ModalItem) {
    switch (item.type) {
        case "text":
            return new TextInputBuilder()
                .setCustomId(item._id)
                .setStyle(item.style ?? TextInputStyle.Short)
                .setMaxLength(item.style === TextInputStyle.Short ? 100 : 2000)
                .setMinLength(item.style === TextInputStyle.Short ? 3 : 10)
                .setPlaceholder(item.placeholder);
        case "menu":
            const menu = new StringSelectMenuBuilder()
                .setCustomId(item._id)
                .setPlaceholder(item.placeholder)
                .setRequired(true);

            if (item.options) {
                menu.addOptions(item.options.map(option => ({ label: option, value: option.toLowerCase() })));
            }
            return menu;
        default:
            return null;
    }
}

export async function shareProject(interaction: ChatInputCommandInteraction) {
    const model = new ModalBuilder()
        .setCustomId(`shareProject`)
        .setTitle("Project Sharing");

    for (const item of data) {
        let input = buildComponent(item);

        const label = new LabelBuilder()
            .setLabel(item.title)
            .setDescription(item.description);

        if (input && item.type === "text") label.setTextInputComponent(input as TextInputBuilder);
        if(input && item.type === "menu") label.setStringSelectMenuComponent(input as StringSelectMenuBuilder);

        model.addLabelComponents(label);
    }

    await interaction.showModal(model);
}