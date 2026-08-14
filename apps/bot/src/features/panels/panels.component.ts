import type { FeatureComponentIndex } from "@typings/feature";
import { panelViewHandler } from "./components/panel-view";
import { activitySystemSelectHandler } from "./components/activity-system-select";

export default {
    feature: "panels",
    handlers: [panelViewHandler, activitySystemSelectHandler],
} satisfies FeatureComponentIndex;
