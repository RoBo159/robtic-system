import type { FeatureComponentIndex } from "@typings/feature";
import { topPeriodHandler } from "./components/period-select";
import { topPageHandler } from "./components/page-nav";

export default {
    feature: "top",
    handlers: [topPeriodHandler, topPageHandler],
} satisfies FeatureComponentIndex;
