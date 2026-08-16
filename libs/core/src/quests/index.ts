/**
 * The quest engine's domain layer.
 *
 * No discord.js anywhere below this barrel: generation, progress and rewards are all expressible
 * without a gateway, which is what lets the bot feature, the API and any future surface share one
 * implementation. Importing this also registers the built-in mission catalogue.
 */
import "./missions";

export {
    registerMissionTemplate,
    getMissionTemplate,
    templatesForTier,
    communityTemplates,
    allMissionTemplates,
    clearMissionTemplates,
    type MissionTemplate,
    type GeneratedMission,
} from "./missions";

export { rollMissions } from "./missions/roll-missions";

export {
    recordMetric,
    flushProgress,
    markCompletionCandidate,
    pendingClaimCount,
    clearProgressBuffer,
    setCompletionHandler,
} from "./progress/buffer";

export {
    peekClaims,
    fillClaims,
    invalidateMemberClaims,
    forgetGuildClaims,
    primeClaim,
    cachedMemberCount,
    clearClaimCache,
} from "./progress/claim-cache";

export {
    toRuntime,
    thresholdsOf,
    effectiveValue,
    type ClaimRuntime,
    type MissionRuntime,
} from "./progress/runtime";

export { claimQuest, type ClaimResult, type ClaimFailure } from "./claim/claim-quest";
export { completeClaim, finishLeasedClaim, questPayoutKey } from "./claim/complete-claim";
export { reconcileClaim } from "./claim/reconcile-claim";
export { expireDueClaims, type ExpirySummary } from "./claim/expire-claims";
export {
    snapshotBaseline,
    currentTotals,
    isReconcilable,
    RECONCILABLE_METRICS,
} from "./claim/snapshot-baseline";

export { startQuestProgress, stopQuestProgress } from "./start-quest-progress";

export { planGeneration } from "./generation/plan-generation";
export { fireDueGenerations, type QuestPoster } from "./generation/fire-generation";
export { buildQuest } from "./generation/build-quest";
export {
    enumerateOccurrences,
    pickInstantIn,
    localDateKey,
    localWeekKey,
    type WindowOccurrence,
} from "./generation/windows";
export { randomInt, randomInstant, shuffle } from "./generation/random";

export {
    recordContribution,
    flushContributions,
    pendingTotal,
    clearContributionBuffer,
    type ContributionFlush,
} from "./community/contribution-buffer";
export { ensureWeeklyChallenge } from "./community/start-challenge";
export { settleChallenge, communityPayoutKey, type SettlementResult } from "./community/settle-challenge";
export {
    setActiveChallenge,
    forgetGuildChallenge,
    contributeFromMetric,
} from "./community/track-contributions";

export { getQuestSummary, type QuestSummary } from "./stats/get-quest-summary";

export {
    setQuestNotifier,
    announceCompleted,
    announceExpired,
    type QuestNotifier,
    type QuestCompleted,
    type QuestExpired,
} from "./notify";
