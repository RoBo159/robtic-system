/**
 * The five kinds of case, matching the `enum` on the Punishment schema.
 *
 * Written out rather than imported from `@database/models` because it is also the published API
 * contract — `ModerationCase["type"]` in the dashboard's `types.ts` is this list. If the schema ever
 * gains a sixth, both ends change together and `PUNISHMENT_TYPES` is where the compiler will point.
 */
export const PUNISHMENT_TYPES = ["warn", "mute", "tempban", "ban", "kick"] as const;

export type PunishmentType = (typeof PUNISHMENT_TYPES)[number];
