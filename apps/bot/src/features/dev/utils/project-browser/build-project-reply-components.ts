import type { APIMessageTopLevelComponent, ContainerBuilder } from "discord.js";
import type { ProjectType } from "@database/models/ProjectShare";
import type { ProjectBrowserItem } from "./browser-state";
import { buildControls } from "./build-controls";
import { buildProjectSelect } from "./build-project-select";

export function buildProjectReplyComponents(
    type: ProjectType,
    container: ContainerBuilder,
    hasPrev: boolean,
    hasNext: boolean,
    projects: ProjectBrowserItem[],
): APIMessageTopLevelComponent[] {
    const components: APIMessageTopLevelComponent[] = [container.toJSON()];

    const controls = buildControls(hasPrev, hasNext);
    const select = buildProjectSelect(projects, type);

    if (controls) components.push(controls.toJSON());
    if (select) components.push(select.toJSON());

    return components;
}
