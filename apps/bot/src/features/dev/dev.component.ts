import type { FeatureComponentIndex } from "@typings/feature";
import devPanelConfig from "./components/dev-panel-config";
import devPanelGetSelect from "./components/dev-panel-get-select";
import devPanelMenu from "./components/dev-panel-menu";
import devPanelNext from "./components/dev-panel-next";
import devPanelPrev from "./components/dev-panel-prev";
import devProjectDislike from "./components/dev-project-dislike";
import devProjectLike from "./components/dev-project-like";
import projectDone from "./components/project-done";
import projectEditMenu from "./components/project-edit-menu";
import projectEditSubmit from "./components/project-edit-submit";
import projectReviewDecision from "./components/project-review-decision";
import projectReview from "./components/project-review";
import projectShareSubmit from "./components/project-share-submit";
import projectSysType from "./components/project-sys-type";

export default {
    feature: "dev",
    handlers: [
        devPanelConfig,
        devPanelGetSelect,
        devPanelMenu,
        devPanelNext,
        devPanelPrev,
        devProjectDislike,
        devProjectLike,
        projectDone,
        projectEditMenu,
        projectEditSubmit,
        projectReviewDecision,
        projectReview,
        projectShareSubmit,
        projectSysType,
    ],
} satisfies FeatureComponentIndex;
