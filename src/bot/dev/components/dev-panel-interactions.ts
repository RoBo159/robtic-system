import {
    StringSelectMenuInteraction,
    ButtonInteraction,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    MessageFlags,
    ContainerBuilder,
    StringSelectMenuBuilder,
    TextDisplayBuilder,
    SectionBuilder,
    SeparatorBuilder,
    SeparatorSpacingSize,
    ThumbnailBuilder,
    type APIMessageTopLevelComponent,
} from "discord.js";
import { ProjectShareRepository } from "@database/repositories";
import { Logger } from "@core/libs";
import { buildProjectContainer } from "./dev-project-reactions";
import emoji from "@shared/emojis.json";

type DevProjectType = "member" | "developer" | "system";

interface BrowserState {
    type: DevProjectType;
    page: number;
    query: string;
}

interface ProjectBrowserItem {
    projectId: string;
    projectTitle: string;
    projectType: string;
    projectDescription: string;
    userId: string;
    likes?: string[];
    dislikes?: string[];
    views?: number;
    imageLink?: string;
}

const browserState = new Map<string, BrowserState>();
const PAGE_SIZE = 10;

const titleByType: Record<DevProjectType, string> = {
    member: `${emoji.user} Member Projects`,
    developer: `${emoji.gear} Staff Projects`,
    system: `${emoji["robtic-reading"]} Robtic Projects`,
};

const descriptionByType: Record<DevProjectType, string> = {
    member:
        "Projects shared by community members. Users can submit projects with `/project share`, then wait for Dev Staff approval before publication.",
    developer:
        "Projects published directly by the Dev Staff. These are trusted, polished, and professionally delivered.",
    system:
        "Official Robtic projects released through the Robtic YouTube channel and recognized as official system projects.",
};

function isValidHttpUrl(raw?: string): raw is string {
    if (!raw) return false;

    try {
        const parsed = new URL(raw);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch {
        return false;
    }
}

function getState(userId: string): BrowserState {
    return browserState.get(userId) ?? { type: "member", page: 1, query: "" };
}

function setState(userId: string, next: BrowserState) {
    browserState.set(userId, next);
}

function truncate(text: string, max = 100): string {
    if (!text) return "";
    if (text.length <= max) return text;
    return `${text.slice(0, Math.max(0, max - 3))}...`;
}

function buildControls(hasPrev: boolean, hasNext: boolean) {
    const row = new ActionRowBuilder<ButtonBuilder>();

    if (hasPrev) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId("dev_projects_prev")
                .setLabel("Previous")
                .setStyle(ButtonStyle.Secondary)
        );
    }

    if (hasNext) {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId("dev_projects_next")
                .setLabel("Next")
                .setStyle(ButtonStyle.Secondary)
        );
    }

    return row.components.length ? row : null;
}

function getProjectScore(project: ProjectBrowserItem) {
    const likes = project.likes?.length ?? 0;
    const dislikes = project.dislikes?.length ?? 0;
    const views = project.views ?? 0;

    return likes * 5 + views - dislikes * 3;
}

function buildTopThree(projects: ProjectBrowserItem[]) {
    return [...projects]
        .sort((a, b) => getProjectScore(b) - getProjectScore(a))
        .slice(0, 3);
}

function buildProjectSelect(
    projects: Array<{
        projectId: string;
        projectTitle: string;
        projectType: string;
        projectDescription: string;
        userId: string;
        views?: number;
    }>,
    type: DevProjectType
) {
    if (!projects.length) return null;

    const placeholderByType: Record<DevProjectType, string> = {
        member: "Select a member project",
        developer: "Select a staff project",
        system: "Select an official project",
    };

    const select = new StringSelectMenuBuilder()
        .setCustomId("dev_projects_get_select")
        .setPlaceholder(placeholderByType[type])
        .addOptions(
            projects.slice(0, 25).map((project) => ({
                label: truncate(project.projectTitle, 100),
                description: truncate(
                    `Type: ${project.projectType} | Views: ${project.views ?? 0} | Author: ${project.userId}`,
                    100
                ),
                value: project.projectId,
            }))
        );

    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);
}

function buildProjectPanel(options: {
    type: DevProjectType;
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
              .map((project, index) => {
                  const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : "🥉";
                  return [
                      `${medal} **${truncate(project.projectTitle, 80)}**`,
                      `> Type: \`${project.projectType}\``,
                      `> Author: <@${project.userId}>`,
                      `> ${emoji.eyes} ${project.views ?? 0} • 👍 ${project.likes?.length ?? 0}`,
                      `> ${truncate(project.projectDescription || "No description provided.", 120)}`,
                  ].join("\n");
              })
              .join("\n\n")
        : "> No featured projects yet.";

    const header = new TextDisplayBuilder().setContent(
        [
            `## ${titleByType[type]}`,
            descriptionByType[type],
            "",
            `**Total Projects:** ${total}`,
            `**Page:** ${page}/${totalPages}`,
            query ? `**Search:** ${query}` : "",
        ]
            .filter(Boolean)
            .join("\n")
    );

    const topContent = new TextDisplayBuilder().setContent(
        `### 🌟 Top Projects\n${topText}`
    );

    const container = new ContainerBuilder().addTextDisplayComponents(header);

    container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    if (isValidHttpUrl(topProjects[0]?.imageLink)) {
        const featuredSection = new SectionBuilder()
            .addTextDisplayComponents(topContent)
            .setThumbnailAccessory(
                new ThumbnailBuilder().setURL(topProjects[0].imageLink!)
            );

        container.addSectionComponents(featuredSection);
    } else {
        container.addTextDisplayComponents(topContent);
    }

    container.addSeparatorComponents(
        new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small)
    );

    return container;
}

async function buildProjectPage(state: BrowserState) {
    const { projects, total } = await ProjectShareRepository.findPublishedPage(
        state.type,
        state.page,
        PAGE_SIZE,
        state.query
    );

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const safePage = Math.min(state.page, totalPages);

    if (safePage !== state.page) {
        const retry = await ProjectShareRepository.findPublishedPage(
            state.type,
            safePage,
            PAGE_SIZE,
            state.query
        );

        return {
            container: buildProjectPanel({
                type: state.type,
                projects: retry.projects,
                total: retry.total,
                page: safePage,
                totalPages: Math.max(1, Math.ceil(retry.total / PAGE_SIZE)),
                query: state.query,
            }),
            projects: retry.projects,
            hasPrev: safePage > 1,
            hasNext: safePage < Math.max(1, Math.ceil(retry.total / PAGE_SIZE)),
            totalPages: Math.max(1, Math.ceil(retry.total / PAGE_SIZE)),
            page: safePage,
        };
    }

    const container = buildProjectPanel({
        type: state.type,
        projects,
        total,
        page: safePage,
        totalPages,
        query: state.query,
    });

    return {
        container,
        projects,
        hasPrev: safePage > 1,
        hasNext: safePage < totalPages,
        totalPages,
        page: safePage,
    };
}

function buildProjectReplyComponents(
    type: DevProjectType,
    container: ContainerBuilder,
    hasPrev: boolean,
    hasNext: boolean,
    projects: Array<{
        projectId: string;
        projectTitle: string;
        projectType: string;
        projectDescription: string;
        userId: string;
        likes?: string[];
        dislikes?: string[];
        views?: number;
        imageLink?: string;
    }>
): APIMessageTopLevelComponent[] {
    const components: APIMessageTopLevelComponent[] = [container.toJSON()];

    const controls = buildControls(hasPrev, hasNext);
    const select = buildProjectSelect(projects, type);

    if (controls) components.push(controls.toJSON());
    if (select) components.push(select.toJSON());

    return components;
}

export const devPanelMenu = {
    customId: "dev_projects_menu",
    async run(interaction: StringSelectMenuInteraction) {
        await interaction.deferReply({
            flags: MessageFlags.Ephemeral,
        });

        const selectedType = interaction.values[0] as DevProjectType;
        const state: BrowserState = { type: selectedType, page: 1, query: "" };
        setState(interaction.user.id, state);

        const page = await buildProjectPage(state);

        try {
            await interaction.editReply({
                content: null,
                embeds: [],
                flags: MessageFlags.IsComponentsV2,
                components: buildProjectReplyComponents(
                    state.type,
                    page.container,
                    page.hasPrev,
                    page.hasNext,
                    page.projects
                ),
            });
        } catch (error) {
            Logger.error(error, "Dev Project Share");

            const fallback = new ContainerBuilder().addTextDisplayComponents(
                new TextDisplayBuilder().setContent(
                    [
                        `## ${titleByType[state.type]}`,
                        "Could not render the advanced project panel.",
                        "Please check project data for invalid values.",
                    ].join("\n")
                )
            );

            await interaction.editReply({
                content: null,
                embeds: [],
                flags: MessageFlags.IsComponentsV2,
                components: [fallback.toJSON()],
            }).catch(() => null);
        }
    }
};

export const devPanelPrevButton = {
    customId: "dev_projects_prev",
    async run(interaction: ButtonInteraction) {
        await interaction.deferUpdate();

        const current = getState(interaction.user.id);
        const nextState = { ...current, page: Math.max(1, current.page - 1) };
        const page = await buildProjectPage(nextState);

        setState(interaction.user.id, {
            ...nextState,
            page: page.page,
        });

        await interaction.message.edit({
            components: buildProjectReplyComponents(
                nextState.type,
                page.container,
                page.hasPrev,
                page.hasNext,
                page.projects
            ),
        });
    }
};

export const devPanelNextButton = {
    customId: "dev_projects_next",
    async run(interaction: ButtonInteraction) {
        await interaction.deferUpdate();

        const current = getState(interaction.user.id);
        const nextState = { ...current, page: current.page + 1 };
        const page = await buildProjectPage(nextState);

        setState(interaction.user.id, {
            ...nextState,
            page: page.page,
        });

        await interaction.message.edit({
            components: buildProjectReplyComponents(
                nextState.type,
                page.container,
                page.hasPrev,
                page.hasNext,
                page.projects
            ),
        });
    }
};

export const devPanelGetModal = {
    customId: "dev_projects_get_select",
    async run(interaction: StringSelectMenuInteraction) {
        const code = interaction.values[0];
        const project = await ProjectShareRepository.findPublishedByProjectId(code);

        await project?.updateOne({ $inc: { views: 1 } });

        if (!project) {
            return interaction.reply({
                content: "Project not found.",
                flags: MessageFlags.Ephemeral,
            });
        }

        const container = buildProjectContainer(project, interaction.user.id, interaction);

        try {
            await interaction.reply({
                components: [container],
                flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral,
            });
        } catch (err) {
            Logger.error(err, "Dev Project Share");
            await interaction.reply({
                content: "Error displaying project details. Please contact staff.",
                flags: MessageFlags.Ephemeral,
            });
        }
    }
};