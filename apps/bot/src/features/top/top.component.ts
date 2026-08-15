import type { FeatureComponentIndex } from "@typings/feature";
import { topPeriodHandler } from "./components/period-select";

export default {
    feature: "top",
    handlers: [topPeriodHandler],
} satisfies FeatureComponentIndex;
