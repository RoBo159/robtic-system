# Voice Activity

`apps/bot/src/features/voice/` — **opt-in**, turn on with `/feature enable voice`.

Time spent in a voice channel earns XP on the **existing** level system. There is no separate
voice level: a level 30 is a level 30 whether it came from chatting, from voice, or from both.

## The tick

One scheduler, one pass per minute (`VOICE_CONFIG.tickIntervalMs`), over
`guild.voiceStates.cache` — not over stored sessions. That matters after a restart: a member who
was already connected is picked up on the very next tick, so a deploy costs at most one minute of
their time rather than the rest of the evening.

Each tick, per connected non-bot member:

| | Accrues when |
|---|---|
| **Connected time** | always, for anyone in a channel |
| **Active time** | only when the member is eligible |
| **XP** (5–15, the same `randomXP` range as chat) | only when eligible, times the multiplier |
| **Points** | only when eligible — see [economy.md](./economy.md) |
| `voiceTime` / `voiceXp` PeriodicStat | only when eligible |

Connected and active are tracked separately on purpose: "how long were you in voice" and "how long
were you actually participating" are different questions, and the profile shows both plus the gap.

## Eligibility

`functions/evaluate-eligibility.ts`, in order:

1. The feature and `VoiceSettings.enabled` are both on.
2. The channel is **not** the guild's own AFK channel. This is unconditional — that channel exists
   to mean "not here", and no setting overrides it.
3. The channel is not in `excludedChannelIds`.
4. The channel is in `trackedChannelIds` — **or that list is empty**, which means "everywhere", so
   a guild does not have to enumerate its channels before anything happens.
5. The member has one of `allowedRoleIds`, or that list is empty.
6. The member is not AFK.

Then the rate: fewer than `minMembersForFullRate` humans in the channel (bots excluded) applies
`aloneMultiplier` — 0.25 by default. Alone still earns, just far less.

**Mute and deafen are deliberately not consulted.** Someone studying with their mic off is
participating; someone with an open mic who walked away an hour ago is not. Presence is measured by
whether they have *done* something recently, which is the AFK check below.

## AFK detection

`libs/core/src/activity/` keeps a `Map<guildId:userId, timestamp>` in memory, flushed to
`Activity.decay.lastActiveAt` on a timer — no write per event. `isAfk()` reads the map, falling back
to the persisted timestamp once on a cold cache. **No record at all means present, not AFK**, so a
fresh boot never mass-mutes everyone for the first five minutes.

Anything deliberate touches it: messages and reactions (`events/activity-touch.event.ts`), every
interaction (`events/interaction-create.event.ts`), and joining or moving voice channels. One
cross-cutting listener rather than a `touchActivity` call per feature — otherwise a new feature
silently drops its users into AFK.

Default timeout is 5 minutes (`afkTimeoutMinutes`, 1–240).

## Sessions and durability

`functions/session-store.ts` holds open sessions in memory with a `dirty` flag. They are written
back every 5 minutes (`persistIntervalMs`), so a crash loses minutes rather than hours. On startup,
`recover-stale-sessions.ts` closes anything left open past `staleSessionMs` (10 min) using its last
recorded tick — historical totals are never overwritten, only added to.

Lifetime totals live on `VoiceStat`. Daily/weekly/monthly come from `PeriodicStat`, which already
backs every other period-scoped leaderboard; duplicating that per period would mean two things to
keep in step and two places for them to disagree.

## Commands

| Command | Access |
|---|---|
| `/voice stats [user]` | anyone |
| `/voice top` | anyone |
| `/voice config …` | admin |

Voice also contributes a **profile tab** (`voice.component.ts` calls `registerProfileTab`) rather
than profile importing from the feature, so the dependency points outwards and `rm -rf
features/voice/` takes the tab with it.

## Configuration

Per guild, via `/voice config` or the Activity admin panel's **Voice activity** section:

| Setting | Default | Bounds |
|---|---|---|
| `enabled` | on | |
| `trackedChannelIds` | empty = everywhere | 50 |
| `excludedChannelIds` | empty | 50 |
| `allowedRoleIds` | empty = everyone | 50 |
| `aloneMultiplier` | 0.25 | 0–1 |
| `minMembersForFullRate` | 2 | 1–99 |
| `afkTimeoutMinutes` | 5 | 1–240 |

## Performance

No per-second work and no per-member write outside the tick. Settings are cached 60s per guild
(`VoiceSettingsRepository`), activity timestamps are in memory and flushed in one bulk write, and
sessions are batched. The tick is a single pass over an already-resident gateway cache, so cost
scales with *connected* members, not with server size.

## Extending it

`IVoiceSession` and the eligibility result are the two places to grow. Screen share, camera, stage
speaking and streaming are all facts about a `VoiceState` that would slot into
`evaluateEligibility` as additional multipliers without touching the tick, the store, or the stats
schema.
