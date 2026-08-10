import { ProjectType } from "@database/models/ProjectShare";

export interface BrowserState {
    type: ProjectType;
    page: number;
    query: string;
}

export interface ProjectBrowserItem {
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

/** Per-user browser position, so pagination buttons know where the viewer is. */
const browserState = new Map<string, BrowserState>();

export function getState(userId: string): BrowserState {
    return browserState.get(userId) ?? { type: ProjectType.Member, page: 1, query: "" };
}

export function setState(userId: string, next: BrowserState): void {
    browserState.set(userId, next);
}
