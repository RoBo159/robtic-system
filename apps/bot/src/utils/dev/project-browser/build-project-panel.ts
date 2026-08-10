import { ContainerBuilder, SectionBuilder, SeparatorBuilder, SeparatorSpacingSize, TextDisplayBuilder, ThumbnailBuilder } from "discord.js";
import type { ProjectType } from "@database/models/ProjectShare";
import { PROJECT_BROWSER_MESSAGES, PROJECT_TRUNCATE } from "@constants";
import type { ProjectBrowserItem } from "./browser-state";
import { buildTopThree } from "./build-top-three";
import { truncate } from "./truncate";
import { isValidHttpUrl } from "./is-valid-http-url";

export function buildProjectPanel(options: {
    type: ProjectType;
    projects: ProjectBrowserItem[];
    total: number;
    page: number;
    totalPages: number;
    query: string;
}) {
    const { type, projects, total, page, totalPages, query } = options;

    const topProjects = buildTopThree(projects);

    const topText = topProjects.length
        ? topProjects
            .map((project, index) => [
                `${PROJECT_BROWSER_MESSAGES.medals[index]} **${truncate(project.projectTitle, PROJECT_TRUNCATE.title)}**`,
                `> Type: \`${project.projectType}\``,
                `> Author: <@${project.userId}>`,
                PROJECT_BROWSER_MESSAGES.statsLine(project.views ?? 0, project.likes?.length ?? 0),
                `> ${truncate(project.projectDescription || PROJECT_BROWSER_MESSAGES.noDescription, PROJECT_TRUNCATE.description)}`,
            ].join("\n"))
            .join("\n\n")
        : PROJECT_BROWSER_MESSAGES.noFeaturedProjects;

    const header = new TextDisplayBuilder().setContent(
        [
            `## ${PROJECT_BROWSER_MESSAGES.titleByType[type]}`,
            PROJECT_BROWSER_MESSAGES.descriptionByType[type],
            "",
            PROJECT_BROWSER_MESSAGES.totalProjectsLabel(total),
            PROJECT_BROWSER_MESSAGES.pageLabel(page, totalPages),
            query ? PROJECT_BROWSER_MESSAGES.searchLabel(query) : "",
        ]
            .filter(Boolean)
            .join("\n")
    );

    const topContent = new TextDisplayBuilder().setContent(
        `${PROJECT_BROWSER_MESSAGES.topProjectsHeading}\n${topText}`
    );

    const container = new ContainerBuilder().addTextDisplayComponents(header);

    container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    if (isValidHttpUrl(topProjects[0]?.imageLink)) {
        container.addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(topContent)
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(topProjects[0].imageLink!))
        );
    } else {
        container.addTextDisplayComponents(topContent);
    }

    container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    return container;
}
