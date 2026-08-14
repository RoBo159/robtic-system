import { ProjectShareRepository } from "@database/repositories";
import { PROJECT_PAGE_SIZE } from "@constants";
import type { BrowserState } from "./browser-state";
import { buildProjectPanel } from "./build-project-panel";

export async function buildProjectPage(state: BrowserState) {
    const { projects, total } = await ProjectShareRepository.findPublishedPage(
        state.type,
        state.page,
        PROJECT_PAGE_SIZE,
        state.query
    );

    const totalPages = Math.max(1, Math.ceil(total / PROJECT_PAGE_SIZE));
    const safePage = Math.min(state.page, totalPages);

    if (safePage !== state.page) {
        const retry = await ProjectShareRepository.findPublishedPage(
            state.type,
            safePage,
            PROJECT_PAGE_SIZE,
            state.query
        );
        const retryTotalPages = Math.max(1, Math.ceil(retry.total / PROJECT_PAGE_SIZE));

        return {
            container: buildProjectPanel({
                type: state.type,
                projects: retry.projects,
                total: retry.total,
                page: safePage,
                totalPages: retryTotalPages,
                query: state.query,
            }),
            projects: retry.projects,
            hasPrev: safePage > 1,
            hasNext: safePage < retryTotalPages,
            totalPages: retryTotalPages,
            page: safePage,
        };
    }

    return {
        container: buildProjectPanel({
            type: state.type,
            projects,
            total,
            page: safePage,
            totalPages,
            query: state.query,
        }),
        projects,
        hasPrev: safePage > 1,
        hasNext: safePage < totalPages,
        totalPages,
        page: safePage,
    };
}
