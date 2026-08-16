# Premium

`libs/core/src/premium/` (the engine) + `apps/bot/src/features/premium/` (the surface) — **default-on**, and inert until something is configured.

The single source of truth for what a member is entitled to. Nothing else in the bot reads a Discord role to decide a perk: systems ask for a *benefit*, and how that benefit was granted stays inside the engine.

## Global by design

The ladder is **one ladder for the whole bot**. Prime means the same rank and the same numbers in every server, because a membership someone holds has to be worth the same wherever they use it — a per-guild ladder would let one server make Prime worthless and another make it infinite.

| | Who decides | Where |
|---|---|---|
| Which tiers exist | bot operator | `PremiumTier` — global |
| What each tier is worth | bot operator | `PremiumFeatureValue` — global |
| Memberships (follow the member everywhere) | bot operator | `PremiumMembership` — global |
| Which of *our* roles grant a tier | server admin | `PremiumRoleMap` — per guild |
| Whether perks apply here at all | server admin | `PremiumSettings` — per guild |

Two ways to hold a tier, resolving to exactly the same benefits:

- **A membership** — granted to a person, applies in every server, optionally with an expiry.
- **A server role** — a guild maps one of its own roles onto a global tier. A server that maps nothing simply has no role-granted premium.

## The API

```ts
await hasFeature(guildId, discordId, PremiumFeature.VIP_QUEST_ACCESS);   // flag
await getFeatureValue(guildId, discordId, PremiumFeature.EXTRA_QUEST_SLOT); // count
await getMultiplier(guildId, discordId, PremiumFeature.MESSAGE_XP_BONUS);   // 10% → 1.1
await getDurationMs(guildId, discordId, PremiumFeature.QUEST_TIME_EXTENSION);
await getBenefits(guildId, discordId);      // everything, resolved and cached
await getHighestTier(guildId, discordId);
await getPremiumRoles(guildId);             // this server's mappings
```

`benefitsForRoles(guildId, discordId, roleIds)` is the cheap path for code that already holds a `GuildMember` — it skips the role provider but still reads global memberships.

**Consumers multiply, they do not branch.** A member with no tier multiplies by exactly 1, so every integration is arithmetically identical to what it was before premium existed. That is what makes this safe to put on hot paths.

## Features

A feature is a *definition* — what it means, what shape its value has, what a non-premium member gets — registered in `libs/core/src/premium/features/definitions.ts`. Values are never in code; they live in the database per tier.

| Type | Means | Example |
|---|---|---|
| `flag` | on/off | `VIP_QUEST_ACCESS` |
| `percent` | a multiplier | `QUEST_REWARD_BONUS` = 10 → ×1.1 |
| `count` | a whole number | `EXTRA_QUEST_SLOT` = 1 |
| `duration` | hours | `QUEST_TIME_EXTENSION` = 12 |

**Stacking** is per feature. `highest` is the default and the right answer for nearly everything: Prime Pro replaces Prime rather than adding to it. `sum` is opt-in for genuinely additive perks — two sources of an extra quest slot really are two slots. A top tier that leaves a perk unset falls through to a lower one held, so a half-configured new tier never takes away what the tier below granted.

Adding a benefit is `registerPremiumFeature(...)` plus a consumer that asks for it. No existing system changes.

## What is wired today

| System | Perk | Where |
|---|---|---|
| Quests | `VIP_QUEST_ACCESS` | `features/quests/functions/is-vip.ts` |
| Quests | `QUEST_REWARD_BONUS` | applied at payout in `complete-claim.ts` |
| Quests | `EXTRA_QUEST_SLOT` | `claim-quest.ts` — a second live claim per slot |
| Quests | `QUEST_TIME_EXTENSION` | claim expiry, past the quest's own deadline |
| XP | `MESSAGE_XP_BONUS`, `XP_COOLDOWN_REDUCTION` | `services/community/xp/grant-xp.ts` |
| Voice | `VOICE_XP_BONUS` | `grant-voice-xp.ts`, on top of the alone multiplier |
| Economy | `POINT_BONUS` | `award-premium-bonus.ts`, a separate `premium` ledger row |
| Economy | `POINT_TO_RC_DISCOUNT` | more RC for the same points, in `convert-points-to-rc.ts` |
| Streak | `STREAK_RECOVERY_WINDOW` | added to the guild's window in `break-streak.ts` |
| Profile | `PROFILE_BADGE` | `get-profile-badges.ts` |

Registered and configurable, with no consumer yet: shop, marketplace and transfer discounts, daily rewards, combo bonus, community contribution bonus, and the remaining cosmetics. They resolve to their baselines until something reads them — which is the point of the registry.

Two design notes worth keeping:

- The **quest reward bonus is applied at payout**, not baked into the quest, so a member who upgrades mid-quest is paid at the tier they hold when they finish, and the posted card advertises one honest number to everyone.
- The **point bonus is a second ledger movement** (`source: "premium"`), not an inflated rate: the progress carry stays exact, and the history shows plainly what was earned and what premium added.

## Slots

`QuestClaim.slotIndex` is what makes `EXTRA_QUEST_SLOT` work. The uniqueness rule went from "one live claim per slot" to "one live claim per slot *copy*"; everyone has copy 0, and premium grants copy 1, 2, … The database still decides — a losing race is the same E11000 it always was.

## Caching

Three caches, because the data has three lifetimes:

| Cache | TTL | Dropped when |
|---|---|---|
| Global ladder + values | 60s | any operator write |
| A guild's role map + switch | 60s | that guild's write |
| A member's resolved benefits | 30s | their roles change, their membership changes, or either config above |

Every write announces its scope through `PremiumRepository.onMutation`, so no command has to remember to invalidate. Role changes come from `guildMemberUpdate`, compared rather than assumed — nicknames and timeouts fire that event too, and evicting on all of them would empty the cache on a busy server for nothing.

The role provider is the **only** role read in the system, registered once on `clientReady` and served from the gateway's resident member cache.

## Commands

| Command | Who | |
|---|---|---|
| `/premium view [user]` | anyone | The tier held and every perk it grants |
| `/premium tiers` | anyone | The ladder and what each tier gives |
| `/premium-config role add · remove · list` | server admin | Map this server's roles onto tiers |
| `/premium-config toggle` | server admin | Whether perks apply here at all |
| `/premium-config status` | server admin | The ladder, this server's mappings, and anything misconfigured |
| `/premium-admin tier create · delete · edit · list` | **bot operator** | The global ladder |
| `/premium-admin feature set · clear · list` | **bot operator** | What each tier is worth |
| `/premium-admin membership grant · revoke · view · holders` | **bot operator** | Memberships that follow a member |

`/premium-admin` is `scope: admin`, so it is published only to the admin guild — a server's admins can never edit what a tier is worth for everyone else.

## Checks

```
bun run test:premium
```

Covers the resolution rules that a mistake would be most expensive in: no tier resolves to exactly the old baselines, role and membership grants are indistinguishable, `highest` does not stack while `sum` does, an unset perk falls through to a lower tier, a disabled guild or tier grants nothing, and the benefits snapshot is frozen because it is shared.
