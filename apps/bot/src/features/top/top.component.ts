import type { FeatureComponentIndex } from "@typings/feature";
import { topCategoryHandler } from "./components/category-select";
import { topPeriodHandler } from "./components/period-select";

/**
 * Registration is explicit here, unlike the older component files where every named export that
 * happens to look like a handler is picked up. The loader stamps `namespace` onto each handler as
 * its feature key, which is what lets a panel left over from before `/feature disable top` say so
 * instead of silently acting.
 */
export default {
    namespace: "top",
    handlers: [topCategoryHandler, topPeriodHandler],
} satisfies FeatureComponentIndex;
