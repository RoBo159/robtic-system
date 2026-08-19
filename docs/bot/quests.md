# Quests

`apps/bot/src/features/quests/` + `libs/core/src/quests/` — **opt-in**, turn on with
`/feature enable quests`.

An automated quest engine: it generates quests on its own schedule, posts them, tracks progress
without anyone running a command, and pays out through the existing Points economy.

`opt-in` rather than `default-on` because it *acts* — it posts messages, pings roles and hands out
currency on a schedule. Points and XP only count what was already happening; this starts things.

## The two halves

| | Where | Knows about |
|---|---|---|
| Domain | `libs/core/src/quests/` | repositories, the metric bus — **no discord.js** |
| Surface | `apps/bot/src/features/quests/` | embeds, buttons, channels, the scheduler |

Everything about generating, claiming, progressing and rewarding is expressible without a gateway,
which is what lets the bot, the API and any future surface share one implementation.

## Difficulties

**`QUEST_TIER_SPECS` in `libs/constants/src/quests.ts` is the tuning table.** Reward and claim
slots are fixed values there — edit them and the next generated quest uses the new numbers.

| Tier | Missions | Reward (Points) | Slots | Duration | Cadence |
|---|---|---|---|---|---|
| 🟢 Easy | 1 | 10 | 15 | 24h | **4–7 per day** |
| 🔵 Normal | 2 | 35 | 10 | 24h | **1–3 per day** |
| 🟣 Hard | 4 | 100 | 4 | 3–7 days | **0–1 per day** |
| 🌟 Golden | 1 | 1000 | 1 | 7 days | **0–2 per week** |
| 💎 VIP | 2 | 50 | unlimited | 24h | **2 per day**, VIP roles only |
| 🎁 Special | 3–7 | 200–500 | 5–25 | 6–48h | **posted by an admin, never scheduled** |

**Genuinely random, and written down as it is decided.** A tier rolls how many it gets for the
local day, and those are dealt round-robin across the guild's enabled windows, each taking its
own random minute. Nothing is derivable in advance — not from the guild id, not from the date.
Whether today carries a Hard is decided the first time the planner looks at today, and until
then the answer does not exist anywhere.

That is why **every roll is persisted the moment it is made**:

| Decision | Where it is written |
|---|---|
| how many of a tier today | a `day-plan` generation row, `plannedCount` |
| which minute each appears | that occasion's generation row, `scheduledAt` |
| how many Golden this week | the `week-plan` row, with the chosen windows |
| missions, lifetime | the quest document itself |

Every one of those writes is claimed through a unique index, so the first roll is the one that
stands — for the next tick, for a restart, and for a second worker. Re-rolling would be the bug:
a tick that rolled 7 where the last rolled 4 would quietly plan three extra Easy quests.

Golden is the one weekly tier, rolled `0–2` per week — the zero is what keeps it rare, and the
week's plan row holds the answer so a week that rolled none stays that way.

**Special** is the odd one out, deliberately. An admin posts it with `?quest post`; everything
about it — how many objectives, the reward, the places, the lifetime — is rolled at that moment,
so no two are alike. It sits in its own uncapped slot, which means a member can claim one while
already on a Golden or three Easies: an event quest that punished you for being mid-quest would
be a strange event.

No tier is exclusive any more. Several Easy quests are expected to be open at once, and the old
`one of this tier at a time` rule would have silently capped a 4–7 roll at one. The flip side is
arithmetic worth knowing: **rate × lifetime = how many sit on the board**. At 0–1 Hard per day
with a 3–7 day lifetime, four or five Hard quests are open simultaneously; shorten the lifetime
if that feels crowded.

Every quest of a tier is worth the same and offers the same number of slots, so a member can learn
what an Easy is worth rather than finding out after they finish one. Only the missions and (for
Hard) the lifetime vary between quests of the same tier.

Both numbers are **copied onto the quest document** at generation, so retuning the table never
changes a quest that is already live — members claimed it on the terms it was posted with.


Unlimited slots are stored as `QUEST_UNLIMITED_SLOTS` (1e9) rather than null, so the reservation
predicate stays `slotsRemaining > 0` with no special case.

## Missions

The *objectives* are generated, never hardcoded. `libs/core/src/quests/missions/` holds a registry:
templates register themselves, `rollMissions` picks distinct ones for the tier and rolls each
target from the template's range.

Metrics currently available: `messages`, `xp`, `voiceTime`, `voiceXp`, `comboScore`, `comboHeat`,
`streak`, `pointsEarned`, `levelUp`, `communityContribution`.

Each mission carries an **accumulation** mode, and the distinction is load-bearing:

- `sum` — counters. Messages, XP, seconds. Progress adds up.
- `max` — *levels* a member reaches: combo score, combo heat, streak. Producers publish the **new
  absolute value**, and progress takes the high-water mark.

Treating a level as a counter would make "reach combo 500" satisfiable with a hundred small gains.
That looks entirely plausible in the data and cannot be corrected afterwards, which is why
`scripts/quest-checks.ts` asserts the split.

Missions are **frozen into the quest** at generation and copied again onto each claim. A retuned or
deleted template cannot move the goalposts under someone mid-attempt.

## Generation

Quests do not appear at fixed times. Each guild configures **windows** — slices of its local day —
and the engine picks a minute inside one.

The chosen instant is *derived*, not rolled: `scheduledInstantFor(guildId, tier, occurrence)` seeds
a PRNG from those three values. Stable across restarts and across concurrent planners, and
different for every guild, so two servers never post at the same minute.

The cycle (`functions/scheduler/run-quest-cycle.ts`, once a minute):

1. Expire due claims, resume stuck completions — global, one query.
2. Per guild: plan the next generations, run the community cycle.
3. Fire due generations — global; the lease query does not care whose row it is.
4. Flush buffered community contribution and redraw what moved.
5. Close finished quests, reconcile orphaned slots.

A `firing` row older than `staleFiringMs` (5 min) is assumed crashed and retried, up to
`maxGenerationAttempts`. `graceHours` decides how late a missed window is still worth firing: 0 for
dailies (a daily fired six hours late is worse than not fired), 24 for Hard and Golden.

Time zones are a fixed `utcOffsetMinutes` — minutes, because +05:30 and +05:45 exist. It drifts by
an hour across DST for observing guilds; nothing else in the bot models time zones and the
alternative is a full IANA dependency.

## Claiming

Three concurrent **slots**, not one:

| Slot | Tiers |
|---|---|
| `short` | easy, normal |
| `long` | hard, golden |
| `vip` | vip |

One live claim per slot. A member chasing a week-long Golden would otherwise be locked out of every
daily for that week, which turns the rarest quest into a punishment.

Claiming is reserve-then-insert, never the other way round:

1. `reserveSlot` — a single-document `$inc` guarded by `slotsRemaining > 0`. MongoDB serialises it,
   so overclaiming is impossible without a transaction.
2. Insert the claim, which meets a partial unique index on `{guildId, discordId, slot, slotIndex}`
   filtered to `status: "active"`. E11000 there means "already holding one", and the reserved slot
   goes back. `slotIndex` is 0 for everyone; premium's `EXTRA_QUEST_SLOT` grants 1, 2, …

A crash between the two orphans one slot; `QuestRepository.reconcileSlots()` repairs it each cycle.

Every claim stores its claim time, expiry, per-mission progress, the frozen missions, the durable
baselines, the outcome, the reward paid and the completion rank. Claims are **never deleted** —
that row is the statistics record.

## Progress, without commands

Nothing in the quest engine listens to `messageCreate`. Progress arrives on the **metric bus**
(`libs/core/src/metrics/`): the systems that already own each number publish it, and quests
subscribe.

```
message-stats.event.ts   → messages, pointsEarned
apply-xp-gain.ts         → xp, levelUp
run-voice-tick.ts        → voiceTime
grant-voice-xp.ts        → voiceXp, pointsEarned
process-combo-message.ts → comboScore, comboHeat, pointsEarned
process-streak-message.ts→ streak, pointsEarned
```

`publishMetric` is **synchronous and never throws**. It is called on the message path for every
message in every guild, so it cannot return a promise — an `await` there would put a microtask
between a member typing and the bot responding. Listeners update memory only.

Intake goes into an in-memory buffer, flushed every `flushIntervalMs` (5s) or when
`flushDirtyThreshold` claims are dirty. A member with no live claim costs one `Map` miss.

**Completion** is a compare-and-swap out of `active` with every mission threshold in the filter, so
exactly one worker can ever transition a claim. The reward is paid while the claim sits in
`completing`, keyed by `quest:<questId>:<discordId>`; a crash in between is resumed by the tick and
the key makes the retry safe.

For metrics that already have a durable total, progress is *derived* as `current - baseline` on
reconcile rather than only accumulated — so a flush lost to a crash self-heals.

## What a member sees

**In the channel.** Every quest tier posts its own card to the **daily quest channel** — one
message per quest, each with its own Claim button. The community challenge is the only thing that
goes anywhere else. The card shows the objectives, the reward, and how many places are left, with a
`▰▰▰▱▱` meter; the button label carries the same count (`Claim · 4 left`) and both are edited
together on every claim, through the throttle, so they cannot disagree. When the last place goes
the button turns into a disabled **Full**.

**Their own quests.** `?quest` or `?quests` with nothing after it shows what that member is on and
how far along, per objective. `/quest active` is the same view. Nothing else is needed — claiming
happens on the card, and progress needs no command at all.

**By DM.** A quest resolves quietly hours or days after it was claimed, so the engine says so:

| | |
|---|---|
| Finished in time | ✅ objectives, reward paid, finishing position, how long it took |
| Ran out of time | ⌛ per-objective progress bars, how far they got, and that nothing was lost |

Both are best-effort — closed DMs are normal and never turn a paid reward into an error. An expiry
resolves **that member's claim only**: the quest itself keeps its remaining places and its message
until its own deadline passes, so everyone else carries on.

## Community challenge

One per week per guild, one shared counter, one embed.

The embed is posted **once** and edited for the rest of the week. Time remaining is a Discord
relative timestamp, rendered client-side, so the countdown stays correct without a single edit.
Edits are throttled to `editMinMs` (15s), with milestones at 25/50/75/100% bypassing the throttle
down to a 5s floor.

Only a positive "unknown message" error causes a repost — a transient 500 must not spawn a second
challenge embed halfway through the week.

At settlement the embed is edited a final time with the outcome and the top five. Contributors at
or above `communityMinContribution` are paid `communityRewardBase`, multiplied by rank: 🥇 ×3,
🥈🥉 ×2, 4th–5th ×1.5. Payment is chunked and resumable via `settledCursor`, keyed per member per
week.

Only counter metrics can be community objectives. A level metric describes one member's standing
and cannot meaningfully be summed across a server.

## Rewards

Quest and community rewards go through `PointsRepository.move({ source: "quest" | "community", … })`
with an idempotency key. **Points, never RC** — RC only exists via `/points convert`, which keeps
one place to reason about its supply. Every payout writes a `PointHistory` row.

If payment fails the claim is left in `completing` so the tick retries it, rather than sealing an
unpaid completion.

## Commands

| Command | Access | |
|---|---|---|
| `/quest board` | general | Everything open, annotated with what you can claim |
| `/quest active` | general | Your claims and their progress |
| `/quest community` | general | The week's challenge, and your share |
| `/quest stats [user]` | general | A member's quest record |
| `/quest top` | general | Most completed quests |
| `/quest-config channel quest · community` | admin | Where quests post |
| `/quest-config mention set · list` | admin | Role pinged per quest type |
| `/quest-config vip-role add · remove · list` | admin | Who may claim VIP quests |
| `/quest-config window add · remove · list` | admin | When quests may appear |
| `/quest-config tier toggle` | admin | Turn a difficulty on or off |
| `/quest-config offset` | admin | The server's clock, in minutes from UTC |
| `/quest-config community` | admin | Weekly challenge settings |
| `/quest-config status` | admin | Everything, with problems called out |

Claiming is a button on the quest's own message, not a command.

## Configuration

Per guild, on `QuestSettings` (60s cached, invalidated on write):

| Setting | Default |
|---|---|
| `questChannelId` | none — quests generate but post nowhere |
| `communityChannelId` | none |
| `mentionRoles` | none per tier, plus `community` |
| `vipRoleIds` | empty — **VIP quests cannot be claimed** |
| `enabledTiers` | all on |
| `windows` | morning 08–11, afternoon 13–16, evening 18–22 |
| `utcOffsetMinutes` | 0 |
| `communityEnabled` | on |
| `communityRewardBase` | 50 |
| `communityMinContribution` | 5 |

`/quest-config status` flags the four states where the engine runs and quietly achieves nothing: no
daily channel, no community channel, VIP on with no VIP roles, no enabled windows.

Guilds list VIP roles themselves — Prime, Prime+, Premium, VIP, Lifetime can all sit side by side.
Any one of them is enough. The `Membership` and `ServiceTier` models exist in the schema but have
never had a call site, so there is no live premium concept to reuse.

## Statistics, profile and leaderboards

`QuestStats` holds lifetime totals per member per guild: claimed, completed, failed, per-tier
completions, community challenges, points earned, total and fastest completion time, first-place
finishes.

`getQuestSummary()` (`libs/core/src/quests/stats/`) is the single read behind `/quest stats`, the
`/profile` quest field, the profile's **Quests** tab and `ProfileSnapshot.quests` — so no surface
computes a completion rate its own way. Rate is measured against *resolved* claims, since an active
quest is neither a completion nor a failure.

Quests are also a `/top` category, ranked on lifetime completions. Like points and coins it ignores
the period: a quest can take a week to finish, so a daily board would rank almost nobody.

## Performance

- One `Map` miss per metric for members with no live claim.
- Progress and contribution are buffered in memory and written in batches.
- Claim lookups are LRU-cached (`claimCacheMax` 50k) with a negative cache, and a longer one where
  the feature is off — the answer cannot change while it is disabled.
- Settings are cached 60s per guild.
- Expiry, firing and completion recovery are global queries whose indexes lead with `status`, so
  accumulated history is discarded by the index prefix.
- The scheduler refuses to start a cycle while one is still running.

## Checks

```
bun run test:quests          # generation primitives: determinism, windows, mission rolls
bun run test:quests:wiring   # command tree, routing coverage, components, events
```

Both run without a database or a gateway.

## Extending it

Adding a quest type should mean registering a generator, not editing the engine.

- **A new mission** — `registerMissionTemplate` with a metric, a target range and a label. If it
  measures a level rather than a counter, set `accumulation: "max"` and make sure the producer
  publishes absolute values.
- **A new metric** — add it to `QuestMetric`, publish it from the system that owns it, and add it
  to `RECONCILABLE_METRICS` if it has a durable total worth deriving progress from.
- **A new tier** — a `QUEST_TIER_SPECS` entry, a slot in `TIER_SLOT`, an emoji and a colour. The
  planner, the claim path, statistics and the config command all read the tier list.
- **Abandoning a claim** — the claim model already carries the outcome and resolution fields; it
  needs a transition and a command, not a schema change.
