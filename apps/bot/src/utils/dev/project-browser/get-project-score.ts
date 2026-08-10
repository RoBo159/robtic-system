import { PROJECT_SCORE_WEIGHTS } from "@constants";
import type { ProjectBrowserItem } from "./browser-state";

export function getProjectScore(project: ProjectBrowserItem): number {
    const likes = project.likes?.length ?? 0;
    const dislikes = project.dislikes?.length ?? 0;
    const views = project.views ?? 0;

    return likes * PROJECT_SCORE_WEIGHTS.like
        + views * PROJECT_SCORE_WEIGHTS.view
        + dislikes * PROJECT_SCORE_WEIGHTS.dislike;
}
