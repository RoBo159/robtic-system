import { ActionRowBuilder, StringSelectMenuBuilder } from "discord.js";
import type { ProjectType } from "@database/models/ProjectShare";
import { PROJECT_BROWSER_MESSAGES, PROJECT_SELECT_MAX_OPTIONS, PROJECT_TRUNCATE } from "@constants";
import type { ProjectBrowserItem } from "./browser-state";
import { truncate } from "./truncate";

export function buildProjectSelect(projects: ProjectBrowserItem[], type: ProjectType) {
    if (!projects.length) return null;

    const select = new StringSelectMenuBuilder()
        .setCustomId("dev_projects_get_select")
        .setPlaceholder(PROJECT_BROWSER_MESSAGES.placeholderByType[type])
        .addOptions(
            projects.slice(0, PROJECT_SELECT_MAX_OPTIONS).map((project) => ({
                label: truncate(project.projectTitle, PROJECT_TRUNCATE.default),
                description: truncate(
                    PROJECT_BROWSER_MESSAGES.selectOptionDescription(project.projectType, project.views ?? 0, project.userId),
                    PROJECT_TRUNCATE.default
                ),
                value: project.projectId,
            }))
        );

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}
