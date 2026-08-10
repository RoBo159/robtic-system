import { STAFF_TIER_THRESHOLDS, STAFF_CATEGORY_LABELS } from "@constants";

/** Matches the same bands the access helpers check (isStaff/isAnyManager/isAnyLead/isOwner). */
export function categoryLabel(score: number): string {
    if (score >= STAFF_TIER_THRESHOLDS.owner) return STAFF_CATEGORY_LABELS.owner;
    if (score >= STAFF_TIER_THRESHOLDS.lead) return STAFF_CATEGORY_LABELS.lead;
    if (score >= STAFF_TIER_THRESHOLDS.manager) return STAFF_CATEGORY_LABELS.highStaff;
    return STAFF_CATEGORY_LABELS.staff;
}
