import { ContainerBuilder, StringSelectMenuBuilder } from "discord.js";
import type { PanelDefinition } from "../registry";
import { BRANCH_EMOJIS as emoji } from "@config";
import { BRANCH_CONFIG } from "@config";

function devProjectsContent(name: string): ContainerBuilder {
    return new ContainerBuilder()
        .setAccentColor(0x2b2d31)
        .addTextDisplayComponents(
            td => td.setContent(`**## ${name}**`),
            td => td.setContent("Explore all projects created within the Robtic ecosystem — from community contributions to official releases.")
        )
        .addSeparatorComponents(sep => sep)
        .addTextDisplayComponents(
            td => td.setContent(`**${emoji.user} Member Projects**`),
            td => td.setContent(`\n Projects submitted by community members. \n Use \`/project share\` to submit your project — it will be reviewed and approved by the Dev Staff before being published.`)
        )
        .addSeparatorComponents(sep => sep.setDivider(false))
        .addTextDisplayComponents(
            td => td.setContent(`**${emoji.gear} Staff Projects**`),
            td => td.setContent(`\n Projects created by our Dev Staff. \n These projects showcase official tools, bots, and resources developed to support the community and enhance the Robtic experience.`)
        )
        .addSeparatorComponents(sep => sep.setDivider(false))
        .addTextDisplayComponents(
            td => td.setContent(`**${emoji["robtic-reading"]} Robtic Projects**`),
            td => td.setContent(`\n Official system projects developed by the core team. \n Featured on the Robtic YouTube channel and represent our core systems and innovations.`)
        )
        .addMediaGalleryComponents(mg =>
            mg.addItems(
                item => item.setURL(`${BRANCH_CONFIG.server.githubAssetsBase}/utils/discord/Projects.png`)
            )
        )
        .addActionRowComponents(row => row.setComponents(
            new StringSelectMenuBuilder()
                .setCustomId("dev_projects_menu")
                .setPlaceholder("Select a Project Category")
                .addOptions([
                    { label: "Member Projects", value: "member", description: "Projects submitted by regular server members", emoji: emoji.user },
                    { label: "Staff Projects", value: "developer", description: "Projects submitted by the Dev Staff", emoji: emoji.gear },
                    { label: "Robtic Projects", value: "system", description: "Official system projects", emoji: emoji["robtic-reading"] },
                ])
        ));
}

export default {
    key: "dev_projects",
    name: "📂 Development Projects Hub",
    description: "Browse Member, Staff, and Robtic projects.",
    mode: "container",
    accentColor: 0x2b2d31,
    getContent(lang, roleLabel) {
        return devProjectsContent(roleLabel ?? "");
    },
} satisfies PanelDefinition;
