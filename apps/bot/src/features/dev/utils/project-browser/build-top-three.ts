import { PROJECT_TOP_COUNT } from "@constants";
import type { ProjectBrowserItem } from "./browser-state";
import { getProjectScore } from "./get-project-score";

export function buildTopThree(projects: ProjectBrowserItem[]): ProjectBrowserItem[] {
    return [...projects]
        .sort((a, b) => getProjectScore(b) - getProjectScore(a))
        .slice(0, PROJECT_TOP_COUNT);
}
