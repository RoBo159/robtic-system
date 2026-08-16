# Streaks

`apps/bot/src/features/streak/` — **opt-in**, turn on with `/feature enable streak`.

A streak counts consecutive days on which a member posted a qualifying message in a channel the
server nominated. Everything below is per guild.

> This file replaced a pre-implementation spec that described a Redis/TTL design. The system is
> MongoDB-backed and has never used Redis; if you find a doc mentioning `RecoveryService.ts` or
> `streakReturn:{userId}` keys, it predates the build.

## Earning

`functions/process-streak-message.ts`, on every message:

1. The guild has streak channels configured, and this is one of them. **An empty list means
   nowhere** — unlike XP or message stats, a streak channel is a deliberate choice, so no
   configuration means the feature does nothing rather than counting everywhere.
2. The member is not frozen (see below).
3. The message qualifies: not a bot, long enough (`minMessageLength`, default 5), and not a repeat
   of their last one inside 10s.
4. The claim window has passed since their last increment.

Then the streak advances by one, the streak role is re-applied, milestones are announced, and
points are awarded from the streak reward table.

## Windows

Claim and expiry are reckoned in whole **UTC calendar days**, not rolling hours: a claim at 23:00 is
claimable again at 00:00, which is what "daily" means to the person doing it.

| | Default | Bounds | Set with |
|---|---|---|---|
| Claim every | 1 day | 1–30 | `/streak-config windows claim-days` |
| Expires after | 2 days without a claim | 2–60 | `/streak-config windows expire-days` |
| Return window | 24 hours | 1–168 | `/streak-config windows return-hours` |

Expiry is always forced above the claim window. A streak that died before it could next be claimed
could never be continued, so both the command and the admin panel raise it rather than rejecting the
input — the intent is clear either way.

The scheduler (`functions/scheduler/`) sweeps every 15 minutes, expiring what is due and DMing an
expiry warning 2 hours before, once, if reminders are on.

## Losing a streak, and getting it back

When a streak dies — from expiry or a punishment — three things happen: a `StreakRecovery` row is
written with what was lost, the streak is zeroed, and `pendingReturnUntil` is set to the end of the
return window.

**While that timestamp is in the future the member is frozen.** Qualifying messages are ignored
entirely, so posting cannot quietly replace a 200-day streak with a 1-day one before anyone has had
the chance to restore it.

The freeze is **silent**: nothing is posted in the channel and no DM is sent about it. `/streak` is
the only place the member sees it, where the embed shows what is pending and how long is left.
Replying to every message during the window would be spam, and announcing it invites arguing in the
channel.

Once the window lapses the freeze stops applying and the next qualifying message starts a fresh
streak at 1. Recovery rows are pruned on the same clock, since past that point they can never be
used.

### Returning

`/streak-return <user>` — **staff only**: administrators and the guild operator, plus any roles
added with `/streak-config return-role add`.

The permission check lives in the handler rather than in the command's `access` field. Discord gates
a whole command, and declaring `access: "admin"` would lock out the assigned roles before any of the
bot's own code ran — which is the entire point of having them.

There is deliberately **no self-service return**. A streak a member can restore themselves is not a
streak, it is a button.

## Punishments

Off a per-guild switch, `/streak-config break-on`:

| Trigger | Default | |
|---|---|---|
| `timeout` | on | Covers `/mute`, `/jail` and warn auto-mutes — all three call `member.timeout()`, so the single `guildMemberUpdate` listener catches every one. Only the transition *into* timeout counts |
| `kick` | off | `guildMemberRemove` cannot tell a kick from someone leaving, so the audit log is consulted |

Kick detection **fails open**. If the audit entry is missing or the bot lacks View Audit Log, the
departure is treated as voluntary and the streak survives: wrongly destroying a long streak is far
worse than missing one kick.

A punishment-broken streak writes the same recovery row as a natural expiry, so staff can still
return it. This is a change from the original behaviour, which skipped that step and so made
punishment-broken streaks — the ones most likely to be disputed — the only unrecoverable kind.

## Commands

| Command | Access |
|---|---|
| `/streak [user]` | anyone |
| `/streak-top` | anyone |
| `/streak-return <user>` | staff |
| `/streak-reward add · remove · list` | admin |
| `/streak-config channel add · remove · list · announce` | admin |
| `/streak-config reminder default` | admin |
| `/streak-config settings` | admin |
| `/streak-config windows` | admin |
| `/streak-config break-on` | admin |
| `/streak-config return-role add · remove · list` | admin |
| `/streak-config sync <source-guild-id>` | admin |

`/streak-reward` and `/streak-config settings` still reply in Arabic. They were moved verbatim
during the feature refactor rather than converted to `t()` inside a large diff, where a behaviour
change would have been invisible.

Everything except the reward table is also editable from the Activity admin panel's **Streaks**
section.

## Data

| Collection | |
|---|---|
| `Streak` | Per member: current, best, `lastIncrement`, `active`, `pendingReturnUntil` |
| `StreakSettings` | Per guild: channels, windows, break triggers, return roles, reminders |
| `StreakRecovery` | What was lost, and when — the source for a return |
| `StreakReward` / `StreakRewardClaim` | The milestone reward table and who has claimed what |

## Related

- [economy.md](./economy.md) — streak milestones pay Points from a configurable table
- [../architecture.md](../architecture.md) — the feature layout and deletability contract
