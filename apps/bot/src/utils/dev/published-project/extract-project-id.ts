/** Pulls the project id out of a `dev_projects_<action>:<projectId>` custom id. */
export function extractProjectIdFromReaction(customId: string): string | null {
    const parts = customId.split(":");
    if (parts.length < 2) return null;
    const projectId = parts.slice(1).join(":").trim().toLowerCase();
    return projectId.length > 0 ? projectId : null;
}
