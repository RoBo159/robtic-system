import type { FeatureComponentIndex } from "@typings/feature";
import { streakRewardClaimHandler } from "./components/reward-claim";
import { streakSyncConfirmHandler } from "./components/sync-confirm";
import { streakTopToggleHandler } from "./components/top-toggle";

export default {
    namespace: "streak",
    handlers: [
        streakRewardClaimHandler,
        streakSyncConfirmHandler,
        streakTopToggleHandler,
    ],
} satisfies FeatureComponentIndex;
