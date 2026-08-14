import { GENERIC_URL_REGEX, YOUTUBE_URL_REGEX } from "@constants";
import { normalizeProjectType } from "@core/projects";

type SanitizableProject = {
    projectType: string;
    projectLinks: { github?: string; other?: string; liveDemo?: string };
    youtubeTutorialLink?: string;
};

// Normalization moved to @core/projects so the Activity API shares it; re-exported for existing imports.
export { normalizeProjectType, type ProjectKind } from "@core/projects";

/** Drops any stored link that no longer passes validation, so old records can't render bad URLs. */
export function sanitizeProject(project: SanitizableProject): void {
    project.projectType = normalizeProjectType(project.projectType);

    if (project.projectLinks.github && !GENERIC_URL_REGEX.test(project.projectLinks.github)) project.projectLinks.github = undefined;
    if (project.projectLinks.other && !GENERIC_URL_REGEX.test(project.projectLinks.other)) project.projectLinks.other = undefined;
    if (project.projectLinks.liveDemo && !GENERIC_URL_REGEX.test(project.projectLinks.liveDemo)) project.projectLinks.liveDemo = undefined;
    if (project.youtubeTutorialLink && !YOUTUBE_URL_REGEX.test(project.youtubeTutorialLink)) project.youtubeTutorialLink = undefined;
}
