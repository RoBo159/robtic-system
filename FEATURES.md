# Features

Everything the bot does, as it actually loads. Counts and command trees in this document were taken
from a real `loadModules` run, not written by hand.

**13 features · 67 commands · 35 components · 45 event listeners · 5 prefix-only handlers**

| Section | |
|---|---|
| [Activation](#activation) | which features are on in a fresh server, and how to change that |
| [Permissions](#permissions) | scope, access, staff tiers, and the order they are checked in |
| [Command surfaces](#command-surfaces) | slash, prefix, context menus, shortcuts |
| [Features](#the-features) | the 12 feature folders |
| [Command systems](#command-systems) | moderation, tickets, minecraft, configuration, leveling, operator |
| [Cross-cutting systems](#cross-cutting-systems) | XP, activity/AFK, statistics, leaderboards, profile, logging |
| [Data](#data) | collections, grouped by system |
| [Reference](#reference) | defaults, limits, categories |

---

## Activation

A **feature** is a self-contained system in `apps/bot/src/features/<key>/` that a server can switch
on or off. Everything else is an ordinary command and is always available.

| | Meaning |
|---|---|
| `default-on` | Live the moment the bot joins. No row is written until someone changes it. |
| `opt-in` | Off until `/feature enable <key>`. |

| Feature | Activation | What it is |
|---|---|---|
| [points](#points) | default-on | Activity points and the RC premium currency |
| [coins](#coins) | default-on | The Minecraft wallet — the one **global** balance |
| [combo](#combo) | default-on | Two-person conversation scoring |
| [top](#top) | default-on | Every leaderboard, in one panel |
| [logging](#logging) | default-on | Log-channel routing |
| [panels](#panels) | default-on | Reusable message panels |
| [shortcuts](#shortcuts) | default-on | Run any command from a custom phrase |
| [voice](#voice) | opt-in | Voice XP and time tracking |
| [streak](#streak) | opt-in | Daily message streaks |
| [premium](#premium) | default-on | Global premium tiers and the perks they grant |
| [quests](#quests) | opt-in | Generated quests, VIP quests and a weekly community challenge |
| [reply](#reply) | opt-in | Auto-replies to trigger phrases |
| [rejoin-roles](#rejoin-roles) | opt-in | Give roles back when a member returns |
| [partner](#partner) | opt-in | Partner server directory |

`default-on` is not the same as "always doing something". `shortcuts` is on by default because a
server with no shortcuts configured costs nothing — the listener finds no triggers and returns
without a query. The same reasoning applies to `panels` and `logging`.

### `/feature`

`scope: guild`, `access: admin`.

| Subcommand | |
|---|---|
| `enable <key>` | Turn a feature on |
| `disable <key>` | Turn a feature off |
| `list` | Every feature, its default, and whether it is on here |

The key autocompletes from what is actually loaded, so a deleted feature disappears from the list
on its own.

### Where the switch is enforced

Four places, so a disabled feature is inert rather than half-alive:

| Surface | Behaviour when off |
|---|---|
| Slash command | Ephemeral "this feature isn't enabled here" |
| Prefix command | Same notice, auto-deleted |
| Gateway listeners | Silent return |
| Schedulers | Guild skipped inside the cycle, not at startup |

Components resolve their owning feature too, so a stale button on an old message says the feature
is off rather than failing silently.

---

## Permissions

Three things decide who may run a command, and they answer different questions.

### Scope — where the command exists

| Scope | Meaning |
|---|---|
| `global` | Data is shared across every server |
| `guild` | Data belongs to one server |
| `admin` | Bot-owner only, published to one designated server |

Admin-scoped commands are registered only to the guild set with `!admin-guild set <id>`. If none is
set they are published nowhere — but still work by prefix, because the prefix router resolves
against what was loaded from disk rather than against Discord's registry. That is what makes
`!admin-guild` able to bootstrap itself.

### Access — who inside a server

| Access | Meaning |
|---|---|
| `admin` | Administrator, or a role in `ServerConfig.botAdminRoles` |
| `general` | Any member |
| `games` | Any member; game-related |

`botAdminRoles` is deliberately **not** the same list as `adminPanelRoles`. One grants admin
commands in chat, the other grants the web panel. Merging them would hand every panel role the
ability to reconfigure the bot from Discord.

### Staff tiers

`StaffTier` binds roles to a numeric score per guild. Commands can require a minimum:

| Threshold | Score |
|---|---|
| staff | 20 |
| manager | 80 |
| lead | 90 |
| owner | 100 |

A command declares **one** mechanism. `access: "admin"` alongside `requiredPermission` would demand
both — a tier-60 moderator would clear the tier gate and then be refused for lacking Administrator.

### The check, in order

```
1  bot owner (SUPER_ADMIN_ID)                    -> allow
2  read whitelist + /command-access grant concurrently
>> if scope === "admin": super users only, and nothing below can override it
3  whitelisted super user                        -> allow
4  no member (DM)                                -> deny "server only"
5  guild owner / Administrator / super user      -> allow
6  a /command-access grant matched               -> allow
7  staff score >= lead (90)                      -> allow
8  requiredPermission not met                    -> deny
>> if access === "admin": botAdminRoles, else deny
9  allow
```

The `scope: "admin"` gate sits above the whitelist short-circuit because it must be *hard* — not a
guild owner, not a `/command-access` grant, not a lead-tier score gets through it. The
`access: "admin"` check sits last because steps 5–7 are all grants: reaching the end means nothing
matched, which under `access: "admin"` has to become a refusal rather than a permissive fallthrough.

Both entry points — real interactions and the duck-typed stand-in built for `!command` — run this
same function, so every check reads from `member`, never from interaction-only fields.

### `/command-access`

`scope: guild`, `access: admin`. Per-command exceptions, plus the server's bot-admin roles.

| Subcommand | |
|---|---|
| `grant-role` · `revoke-role` | Let a role use one specific command |
| `grant-category` · `revoke-category` | Same, for a staff-tier category |
| `list` | Grants configured for a command |
| `admin-roles add` · `remove` · `list` | The server's bot administrator roles |

---

## Command surfaces

The same command is reachable four ways.

### Slash commands

The primary surface. Registered to one route (or two, when an admin guild is set).

### Prefix commands

`!command`, default `!`, changeable per server with `/set-prefix`. Text arguments are parsed against
the command's own option tree and handed to the same handler through a duck-typed stand-in
interaction — so there is one implementation per command, not two.

The router is a single listener. Every system used to ship its own copy, which meant a message was
parsed six times and any command more than one of them claimed actually ran more than once.

Two exceptions survive as branches:

- `jail`, `mute` and `warn` are gated by `PunishConfig.shortcutRoleIds` instead of the normal
  permission check, because they carry a proof-of-evidence flow.
- Player-facing categories are confined to the commands channel; staff and operational ones are
  not. Confining an admin fixing a broken config, or a moderator checking server status mid-incident,
  adds friction exactly where it is least wanted.

### Prefix-only handlers

Five commands ship a `*.message.ts` that runs *in front* of the normal pipeline and may decline. It
exists for what the option parser cannot express — chiefly a bare `!coins`, which deserves a list of
subcommands rather than a "missing subcommand" error.

`coins` · `points` · `voice` · `streak-config` · `streak-reward`

### Context menus

Right-click a member: **Jail User**, **Mute User**, **Warn User**.

### Shortcut phrases

Arbitrary phrases mapped onto any command — see the [shortcuts feature](#shortcuts).

---

## The features

### points

`default-on` · `/points` · category `Economy` · access `general`

The activity currency, and the only source of RC.

| Subcommand | Access | |
|---|---|---|
| `balance [user]` | anyone | Points, RC and rank |
| `rates` | anyone | How points are earned here, and the RC rate |
| `history` | anyone | Recent point activity from the ledger |
| `convert <points>` | anyone | Points → RC |
| `add <user> <amount> [reason]` | admin | Grant |
| `remove <user> <amount> [reason]` | admin | Deduct |
| `migrate-coins <confirm>` | admin | One-time: claim this server's pre-global coin balances as points |

**Earning.** Nothing pays out per event. Each source accumulates *progress* and converts whole units
at the server's rate, carrying the remainder — a member one message short of a point keeps that
message rather than losing it at the boundary.

| Source | Default rate |
|---|---|
| Messages | 100 messages → 1 point |
| Combo score | 100 score → 1 point |
| Voice | 10 active minutes → 1 point |
| Streaks | a configurable `days → points` table, exact match |

Streaks are the exception: a fixed payout rather than accumulated progress, because a streak climbs
one day at a time so each threshold fires exactly once.

**RC** exists only through `/points convert`. Points are deducted before RC is credited — if the
process dies between the two the member is short-changed rather than able to mint RC from a balance
they still hold. Every conversion records the rate that applied, plus a zeroed `fee` and `bonus`, so
taxes and membership perks can arrive later without a migration.

Every movement writes a `PointHistory` row with `balanceAfter`. `lifetimePoints` only climbs;
spending reduces the balance alone, so "earned all-time" stays meaningful after a cash-out.

Full detail: [docs/bot/economy.md](docs/bot/economy.md).

### coins

`default-on` · **`scope: global`** · `/coins` · category `Economy` · access `general`

The **Minecraft** wallet, and the one **global** balance in the system: the same coins in every
Discord server and on every game server on the network. Discord activity no longer pays coins.

| Subcommand | Access |
|---|---|
| `balance [user]` | anyone |
| `add <user> <amount>` | admin — moves the global wallet, in-game money included |
| `remove <user> <amount>` | admin — same |

Two things move a balance: the game server over `/api/economy/{add,remove,sell}`, and an admin.
Every mutation is an `$inc`, so several servers can credit the same member concurrently without
losing writes. `guildId` is still required by the API, but only to resolve a UUID through the
per-guild `MinecraftLink` table — it no longer scopes the balance, which is what let coins go global
with no plugin release.

The `coins` leaderboard is therefore a global ranking, unlike every other board in `/top`.

Kept as a separate system from points rather than renamed, because the plugin's wire contract talks
about coins. Balances from before the global switch are frozen in `LegacyCoin` and can be claimed
into that server's points once, with `/points migrate-coins`.

### voice

`opt-in` · `/voice` · category `Activity` · access `general`

Time in voice earns XP on the **existing** level system. There is no separate voice level.

| Subcommand | Access | |
|---|---|---|
| `stats [user]` | anyone | Time, XP, sessions |
| `top [board]` | anyone | total / weekly / monthly time, or voice XP |
| `config view` | admin | Current settings |
| `config toggle <enabled>` | admin | Rewards on or off |
| `config track <channel> [remove]` | admin | Only these channels earn |
| `config exclude <channel> [remove]` | admin | These never earn |
| `config rates [alone-multiplier] [afk-minutes]` | admin | Tuning |

**The tick.** One pass per minute over the gateway's voice-state cache — not over stored sessions,
so a member already connected when the bot restarted is picked up on the next tick rather than being
lost for the evening. Per member: connected time always; active time, 5–15 XP and points only when
eligible.

**Eligibility**, in order: feature and setting both on → not the server's AFK channel (unconditional,
no setting overrides it) → not excluded → tracked, or the tracked list is empty which means
everywhere → holds an allowed role, or that list is empty → not AFK. Then the rate: below
`minMembersForFullRate` humans in the channel applies `aloneMultiplier`, 0.25 by default.

**Mute and deafen are deliberately not consulted.** Someone studying with their mic off is
participating; someone with an open mic who walked away an hour ago is not. Presence is measured by
whether they have *done* something recently.

**AFK** is an in-memory timestamp map flushed on a timer, touched by messages, reactions, every
interaction, and voice joins/moves. No record at all counts as present, so a fresh boot never mutes
everyone for the first five minutes. Default timeout 5 minutes.

**Durability.** Open sessions are written back every 5 minutes, so a crash loses minutes rather than
hours; anything left open past 10 minutes is closed on startup from its last recorded tick.
Historical totals are added to, never overwritten.

Full detail: [docs/bot/voice.md](docs/bot/voice.md).

### streak

`opt-in` · category `Streak` · 5 commands

Daily message streaks, with rewards and recovery.

| Command | Access | |
|---|---|---|
| `/streak [user]` | general | Current streak, and any pending return |
| `/streak-top` | general | Top 5 |
| `/streak-return <user>` | **staff** | Give a member their expired streak back |
| `/streak-reward add · remove · list` | admin | Reward table |
| `/streak-config channel add · remove · announce` | admin | Which channels count, where milestones post |
| `/streak-config reminder default` | admin | Expiry reminders |
| `/streak-config settings` | admin | View everything |
| `/streak-config windows` | admin | Claim, expiry and return windows |
| `/streak-config break-on` | admin | Which punishments end a streak |
| `/streak-config return-role add · remove · list` | admin | Who else may return streaks |
| `/streak-config sync` | admin | Import streaks from another server the bot is in |

Reaching a configured milestone announces it in the announcement channel, or replies in the channel
that earned it when none is set.

#### How a streak is lost, and given back

Every window is per guild. Claim and expiry are reckoned in whole **UTC calendar days** — a claim at
23:00 is claimable again at 00:00, which is what "daily" means to the person doing it.

| | Default | Bounds |
|---|---|---|
| Claim every | 1 day | 1–30 |
| Expires after | 2 days without a claim | 2–60, always forced above the claim window |
| Return window | 24 hours | 1–168 |

When a streak dies the member is **frozen** for the return window: qualifying messages are ignored,
so posting cannot quietly replace a 200-day streak with a 1-day one before anyone can restore it.
Nothing is said in the channel and no DM is sent about the freeze — `/streak` is the one place they
see it, showing what is pending and how long is left. Once the window lapses the freeze clears and
the next message starts at 1.

Returning is staff-only: administrators, plus any roles set with `/streak-config return-role add`.
The check lives in the handler rather than in the command's `access`, because Discord gates a whole
command and the point is to let a non-administrator role through.

**Punishments** can end a streak too, off a per-guild switch:

| Trigger | Default | |
|---|---|---|
| Timeout | on | Covers `/mute`, `/jail` and warn auto-mutes — all three apply a Discord timeout, so one listener catches them |
| Kick | off | Read from the audit log. If that lookup fails or the bot lacks View Audit Log the departure counts as voluntary and the streak survives — wrongly destroying a long streak is worse than missing one kick |

A punishment-broken streak writes the same recovery row as a natural expiry, so staff can still
return it. That is a change: the old timeout handler skipped it, which quietly made exactly the
streaks most likely to be disputed the only unrecoverable ones.

`/streak-reward` still replies in Arabic — it was moved verbatim during the refactor rather than
converted to `t()` inside a large diff, where a behaviour change would have been invisible.

### premium

`default-on` · `/premium` · `/premium-config` · `/premium-admin` · 20 subcommands

The single source of truth for premium benefits. Nothing else in the bot reads a Discord role to
decide a perk — systems ask the engine for a *benefit*, and how it was granted stays inside.

**The ladder is global.** Prime means the same rank and the same numbers in every server, because a
membership has to be worth the same wherever it is used. A server decides one thing: which of its
own roles grant a tier.

| Who | Decides |
|---|---|
| Bot operator | Which tiers exist, what each perk is worth, and memberships that follow a member everywhere |
| Server admin | Which of this server's roles grant a tier, and whether perks apply here at all |

| Command | Access | |
|---|---|---|
| `/premium view · tiers` | general | What you hold, and what each tier gives |
| `/premium-config role add · remove · list` | admin | Map this server's roles onto tiers |
| `/premium-config toggle · status` | admin | The local switch, and anything misconfigured |
| `/premium-admin tier · feature · membership` | **operator** | The global ladder, its values, and memberships |

A benefit is a definition — `flag`, `percent`, `count` or `duration`, with a baseline that is always
"what happened before premium existed". Values live in the database, never in code. Stacking is per
feature: `highest` by default, because Prime Pro replaces Prime rather than adding to it, with `sum`
opt-in for genuinely additive perks like an extra quest slot. A top tier that leaves a perk unset
falls through to a lower one held, so a half-configured tier never takes anything away.

**Consumers multiply, they do not branch.** A member with no tier multiplies by exactly 1, so every
integration is arithmetically identical to what it was before — which is what makes this safe on the
message and voice paths.

Wired today: VIP quest access, quest reward bonus, extra quest slots, quest time extension, message
and voice XP bonuses, XP cooldown reduction, point bonus, points-to-RC discount, streak recovery
window, profile badge. Another dozen are registered and configurable, waiting on the systems that
will read them.

Three caches with three lifetimes — the global ladder, a guild's role map, a member's resolved
benefits — each dropped by the scope of the write that invalidates it. Role changes come from
`guildMemberUpdate`, compared rather than assumed, since nicknames and timeouts fire it too.

Full detail: [docs/bot/premium.md](docs/bot/premium.md).

### quests

`opt-in` · `/quest` · `/quest-config` · categories `Activity` and `Configuration` · 20 subcommands

Generated quests with automatic progress, and a weekly server-wide challenge.

`opt-in` because it *acts*: it posts on its own schedule, pings roles and hands out currency. Points
and XP only count what was already happening.

| Tier | Missions | Reward | Slots | Duration |
|---|---|---|---|---|
| 🟢 Easy | 1 | 10 | 15 | 24h |
| 🔵 Normal | 2 | 35 | 10 | 24h |
| 🟣 Hard | 4 | 100 | 4 | 3–7 days · 60% of weeks |
| 🌟 Golden | 1 | 1000 | 1 | 7 days · 25% of weeks |
| 💎 VIP | 2 | 50 | unlimited | 24h |

Reward and slots are fixed per tier in `QUEST_TIER_SPECS` (`libs/constants/src/quests.ts`) — the one
table to edit to change what a quest pays or how many may claim it. Only the objectives, and Hard's
lifetime, vary between quests of the same tier.

| Command | Access | |
|---|---|---|
| `/quest board · active · community · stats · top` | general | The board, your claims, the challenge, records |
| `/quest-config channel daily · community · vip` | admin | Where each kind posts; VIP falls back to daily |
| `/quest-config mention set · list` | admin | Role pinged per quest type |
| `/quest-config vip-role add · remove · list` | admin | Any one role is enough to claim VIP |
| `/quest-config window add · remove · list` | admin | Slices of the local day quests may appear in |
| `/quest-config tier toggle` | admin | Turn a difficulty off here |
| `/quest-config offset` | admin | The server's clock, minutes east of UTC |
| `/quest-config community` | admin | Weekly challenge reward and floor |
| `/quest-config status` | admin | Everything, with silent-failure states flagged |

Every tier posts its own card to the one daily quest channel, each with a Claim button whose label
carries the places left (`Claim · 4 left`); card and button are re-edited together on each claim.
A bare `?quest` shows a member their own claims and progress. When a claim resolves the member is
DMed — the reward and finishing position if they made it, per-objective progress if time ran out —
and an expiry ends only that claim, never the quest.

Claiming is a button on the quest's own message. Progress needs no command at all: the systems that
own each number publish to the metric bus and quests subscribe, so messages, XP, voice, combo,
streak and points all feed missions without a second counter existing anywhere.

**Timing is derived, not rolled.** The minute a quest appears is seeded from guild + tier +
window occurrence, so it survives restarts, cannot be double-fired by concurrent planners, and
differs per guild.

**Three concurrent slots** — short (easy, normal), long (hard, golden), vip — so a week-long Golden
does not lock a member out of every daily.

**Completion** compare-and-swaps the claim out of `active` with every threshold in the filter, pays
through the Points economy with an idempotency key, then seals. A crash mid-way is resumed; the key
makes the retry safe. Rewards are Points — RC only exists through `/points convert`.

The weekly challenge posts one embed and edits it all week, throttled, with milestone bypasses; it
never posts a second message for progress. Settlement edits it a final time with the outcome and
top five, then pays contributors above the floor with rank multipliers.

Full detail: [docs/bot/quests.md](docs/bot/quests.md).

### combo

`default-on` · `/combo` · category `Activity` · access `general`

Scores back-and-forth conversation between two people.

Levels: **Bronze** 0 · **Silver** 30 · **Gold** 70 · **Diamond** 140 · **Legendary** 260.

A combo expires after 2 minutes without a qualifying exchange. Heat halves roughly every 45s of
silence and is display-only — it never ends a combo. Alternating replies gain far more heat than
consecutive ones (16 vs 6). Score per message is 2–7 by default, configurable per server.

The conversation detector attributes a message to a partner from a per-channel ring buffer of recent
signals, with a confidence threshold. Up to 25 distinct partners are tracked per user for the
Favorite Partner statistic, to bound document growth.

Authors at or above punishment level 50 have their score gain multiplied by 0.4 — dampened, not
zeroed.

Contributes a profile tab. A champion role can be synced to the server's top scorer.

### top

`default-on` · `/top` · category `Leaderboard` · access `general`

Every leaderboard, one panel.

- **`?top`** — all eight categories in one embed, top 5 each, laid out in columns.
- **`?top <category>`** — that board in depth, top 10, plus the caller's own rank even when far
  below. A gap separator is inserted when they are.

Categories: 🔥 streak · 💬 combo · ⭐ xp · 📨 messages · 🎙️ voice · 🎯 points · 🪙 coins · 🗺️ quests.
Periods: daily · weekly · monthly · all-time, on a select menu.

Voice ranks on seconds of active time and is formatted as a duration. Points, coins and quests are
standings rather than per-period deltas, so they read the same in every period.

### shortcuts

`default-on` · `/shortcut` · category `Configuration` · access `admin`

Map any phrase onto any command. Works across the whole command tree.

| Subcommand | |
|---|---|
| `add <trigger> <command> [args]` | Create or update |
| `remove <trigger>` | Delete |
| `list` | Every shortcut here |
| `info <trigger>` | One in full |
| `toggle <trigger>` | Pause without deleting |
| `restrict role-add · role-remove` | Only these roles may use it |
| `restrict channel-add · channel-remove` | Only these channels |
| `restrict clear` | Drop all restrictions |

`{args}` in the stored argument template is substituted with whatever the user typed after the
trigger. Longest trigger wins when two overlap, so a specific phrase is never shadowed by a shorter
one it contains. Each shortcut counts its uses.

Cleanup modes: delete the trigger and the reply · delete only the reply · keep both.

### reply

`opt-in` · `/reply` · category `Configuration` · access `admin`

Auto-replies to trigger phrases.

| Subcommand | |
|---|---|
| `add <trigger> <reply>` | Repeat to add more — one is picked at random |
| `delete <trigger>` | Remove a trigger and all of its replies |
| `list` | Every trigger here |
| `show <trigger>` | The replies for one trigger |

The trigger set is cached per server, so the message listener does no query when nothing matches.

### rejoin-roles

`opt-in` · `/rejoin-roles` · category `Configuration` · access `admin`

Gives roles back when a member returns after leaving.

| Subcommand | |
|---|---|
| `status` | Current configuration |
| `exclude add · remove <role>` | Roles that are never saved and never restored |
| `staff add · remove <role>` | Roles treated as staff, on the shorter window |
| `timers member-hours <hours>` | How long ordinary roles survive |
| `timers staff-hours <hours>` | How long staff roles survive — **must be less** than member-hours |

Saved roles are deleted once their window expires. The staff window being shorter is enforced, not
advisory: a staff role that comes back after a long absence is a security problem in a way an
ordinary role is not.

### partner

`opt-in` · `/partner` · **`scope: global`** · category `Partnership`

The partner server directory. Global scope: the data is shared across every server the bot is in.

| Subcommand | |
|---|---|
| `add` | Add a partner server |
| `remove` | Remove one |
| `announce` | DM every partner representative |

### panels

`default-on` · `/panels` · category `Configuration` · access `admin`

Reusable message panels — rules, information, role pickers.

| Subcommand | |
|---|---|
| `list` | Every available panel |
| `send` | Post one here |
| `delete` | Remove a previously sent panel |

Sent panels are tracked, so `delete` removes the real message rather than leaving it orphaned.

### logging

`default-on` · `/setup-log` · category `Configuration`

Routes each log kind to a channel. Eleven kinds:

| Key | |
|---|---|
| `guard_log` | Security and guild guard events |
| `punishments_notice` | Executed punishment notices |
| `punishments_case` | Punishment approval workflow |
| `appeals_case` | Appeal case handling |
| `report` | User-submitted reports |
| `xp_gain_log` | XP gains and level-ups |
| `rewards_log` | Reward distribution |
| `support_points_log` | Support staff points |
| `staff_activity_log` | Staff activity |
| `decay_log` | XP decay |
| `ai_log` | AI decisions |

Configurable per key from the command or the admin panel's Logs section.

---

## Command systems

Not features — always available, organised by scope folder.

### Moderation

| Command | Tier | |
|---|---|---|
| `/ban <user>` · `/unban` | 60 | Plain Discord ban. No proof flow |
| `/kick <user>` | 60 | |
| `/jail add · remove · appeal · list` | 60 | The punishment system: case record, punishment level, timeout |
| `/mute add · remove · appeal · list` | 20 | |
| `/warn add · appeal · list` | 20 | |
| `/role give · remove · multirole` | 60 | |
| `/roles` | general | Every role, highest first |
| `/chat lock · unlock · hide · show · slowmode · clear` | — | Channel controls |
| `/reason create · remove · list` | 80 | Punishment reason presets |
| `/security …` | 80 | Audit and guard configuration |
| `/punish-config …` | 80 | Shortcut roles, proof channel, moderator points |
| `/mod help` | general | All moderation commands and usage |

`jail`, `mute` and `warn` are the proof-flow commands. `remove` releases without clearing punishment
level; `appeal` clears the level points. Punishment level is 0–100 and feeds the combo dampener and
the escalation rules.

`/security` covers status, toggle, audit channel, alerts channel, threshold rules
(`rule-add · rule-remove · rule-list`), a whitelist (`whitelist-add · remove · list`) and a
role-strip list (`rolestrip-add · remove · list`).

### Tickets

| Command | |
|---|---|
| `/ticket-panel` | Post the opening panel (tier 80) |
| `/claim` · `/close` · `/escalate` | Lifecycle |
| `/add <user>` · `/remove <user>` | Participants |
| `/rename` | Rename the channel |

`escalate` hands the ticket to the category's admin role.

### Minecraft

| Command | |
|---|---|
| `/minecraft link · unlink` | Account linking via an in-game code |
| `/minecraft profile` | Link, balance and recent sales |
| `/minecraft status` · `/status` | Live server status, TPS, memory, uptime |
| `/minecraft history` | Ore-exchange transactions |
| `/minecraft apikey create · list · revoke` | Server API keys |
| `/ip` | Server address and status |
| `/version` | Supported versions (**global** scope) |

Backed by `apps/robtic-api` — a separate API-key-authenticated service for the game server, distinct
from the Activity's API. See [docs/bot/minecraft.md](docs/bot/minecraft.md).

### Leveling and activity

| Command | |
|---|---|
| `/level [user]` | Level and XP |
| `/leaderboard` | XP leaderboard |
| `/level-rewards set · remove · list` | Role rewards per level (tier 80) |
| `/xp-settings add-channel · remove-channel · decay · level-up-channel · view` | (tier 80) |
| `/check streak · staff` | Look up members by a stat value |
| `/profile [user]` | Profile with a section dropdown |
| `/note <user>` | Add a note about a member |

### Server setup and utilities

Grouped by what they do, not by category — see the [category table](#command-categories) for that.

| Command | |
|---|---|
| `/set-prefix` | Text-command prefix (tier 100) |
| `/set-role` | Members / bots / EN / AR role slots (tier 100) |
| `/set-commands-channel` | Where player-facing commands are confined (tier 100) |
| `/line add · remove` | Channels that auto-attach the line image and react to every message (tier 100) |
| `/send` | Post an embed to a channel (access admin) |
| `/feature enable · disable · list` | Feature switches |
| `/command-access …` | Per-command grants and bot-admin roles |
| `/help [query]` | Categories, one category paged, or one command in full |

### Bot operator

`scope: admin` — bot owner and whitelisted super users only, published to the admin guild.

| Command | |
|---|---|
| `!admin-guild set · show · clear` | Where admin commands are published |
| `/whitelist add · remove · list` | Super users, who bypass every permission check |
| `/addserver` · `/removeserver` | The server allowlist |
| `/system status · reload` | Live status panel; reload commands and components |
| `/set-log-guild` | Centralised server log guild |

`/system reload` re-registers from disk but does **not** re-read source — Bun caches ES modules, so
a changed file needs a restart.

---

## Cross-cutting systems

Not owned by any one feature.

### XP

5–15 XP per qualifying message, once per 60s cooldown. Level *n* costs `100 × 1.2ⁿ` XP. Voice grants
the same range on its own tick, through the same code path — same level maths, same rewards, same
announcement — so a level is a level however it was earned.

Level-ups announce in the configured channel, or stay silent when none is set. Level rewards grant
roles automatically.

**Decay**: after 7 days inactive, 10 XP/day lost, accelerating 5/day, capped at 100/day. Off by
default, checked hourly.

Voice XP is also tracked on its own metric, so "voice XP earned" is answerable without unpicking it
from chat XP on the shared counter.

### Message statistics

A separate "real message" counter with a minimum length of 5, counted **everywhere** — not only in
XP channels. This is what `/top messages` ranks and what the messages-per-point rate consumes.

### Activity and AFK

An in-memory `Map<guild:user, timestamp>` flushed to the database on a timer — no write per event.
Touched by messages, reactions, and every interaction, through one cross-cutting listener rather
than a call sprinkled through each feature, so a new feature cannot silently drop its users into AFK.

### Periodic statistics

`PeriodicStat` accumulates any named metric across daily, weekly, monthly and all-time buckets. It
backs every period-scoped leaderboard, including `voiceTime` and `voiceXp` — which is why voice does
not store its own per-period rows. Duplicating that would mean two things to keep in step and two
places for them to disagree.

### Leaderboards

One `getTopEntries` in `libs/core`, shared by `/top`, `/voice top`, `/streak-top`, `/leaderboard`
and the Activity. Adding a category there surfaces it everywhere at once.

### Profile

`getProfileSnapshot` is the single source for the bot embed, the Activity, and `/api/profile`.
Sections: XP, streak, combo, voice, points, coins, badges, customization.

Features contribute **profile tabs** by registering with a tab registry rather than profile
importing from them — the dependency points outwards, so deleting a feature folder takes its tab
with it. It also means a tab for a disabled feature does not render.

Customization: accent colour, text colour, banner, bio (190 chars), and one of five templates
(classic, banner, compact, card, minimal). Badges include streak fire tiers and server-#1 markers.

### Guards

The bot leaves any server not on the `AllowedGuild` list.

---

## Data

| Group | Collections |
|---|---|
| Economy | `Point` `PointHistory` `PointSettings` `RcConversion` `Coin` (global) `LegacyCoin` |
| Voice | `VoiceSession` `VoiceStat` `VoiceSettings` |
| XP and activity | `ActivityXP` `ActivityLog` `XPSettings` `LevelReward` `PeriodicStat` |
| Streak | `Streak` `StreakSettings` `StreakReward` `StreakRewardClaim` `StreakRecovery` |
| Premium | `PremiumTier` `PremiumFeatureValue` `PremiumRoleMap` `PremiumMembership` `PremiumSettings` |
| Quests | `Quest` `QuestClaim` `QuestSettings` `QuestStats` `QuestGenerationHistory` `CommunityChallenge` `CommunityContribution` |
| Combo | `Combo` `ComboHistory` `ComboSettings` `ComboUserStats` `ComboLeaderboardEntry` `ComboServerRecords` |
| Moderation | `Punishment` `PunishConfig` `Reason` `AuditLog` `Note` |
| Tickets | `Ticket` `SupportSession` |
| Staff | `StaffTier` `StaffStats` `StaffLog` `StaffSession` `StaffBackup` |
| Features and config | `GuildFeature` `FeatureCatalog` `ServerConfig` `GlobalConfig` `BotConfig` `CommandAccess` `LogConfig` |
| Shortcuts and replies | `Shortcut` `Reply` |
| Rejoin roles | `RejoinRolesConfig` `SavedRoles` |
| Minecraft | `MinecraftLink` `MinecraftLinkCode` `MinecraftServer` `MinecraftApiKey` `MinecraftTransaction` `MinecraftItemPrice` `MinecraftConfig` `MinecraftBridgeEvent` `MinecraftJail` `MinecraftWarning` `MinecraftNote` `MinecraftReport` `MinecraftFreeze` `MinecraftRoleState` |
| Platform | `User` `SuperUser` `AllowedGuild` `Partner` `ProjectShare` `PendingProjectShare` `Membership` `ServiceTier` `ApiRequestLog` |

Repositories that sit on a hot path are cached with a 60-second TTL and invalidated on write:
`StaffTier` · `PunishConfig` · `ServerConfig` · `GuildFeature` · `PointSettings` · `VoiceSettings` ·
`Shortcut` · `Reply` · `QuestSettings`.

---

## Reference

### Defaults and limits

| | Default | Bounds |
|---|---|---|
| Prefix | `!` | 5 chars |
| XP per message | 5–15 | |
| XP cooldown | 60s | |
| Level cost | `100 × 1.2ⁿ` | |
| Decay | off · 10/day after 7 days, +5/day, max 100 | |
| Message minimum length | 5 | |
| Messages per point | 100 | 1–100,000 |
| Combo score per point | 100 | 1–100,000 |
| Voice minutes per point | 10 | 1–100,000 |
| Points per RC | 100 | 1–1,000,000 |
| Minimum conversion | 100 | 1–1,000,000 |
| Streak reward rows | — | 15 |
| Voice tick | 60s | |
| Alone multiplier | 0.25 | 0–1 |
| Members for full rate | 2 | 1–99 |
| AFK timeout | 5 min | 1–240 |
| Session persist / stale | 5 min / 10 min | |
| Streak claim / expiry | 1 day / 2 days | 1–30 / 2–60 |
| Streak return window | 24h | 1–168h |
| Streak breaks on timeout / kick | on / off | |
| Combo expiry | 2 min | |
| Combo score per message | 2–7 | 1–100 |
| Channels or roles per field | — | 50 |
| Top overview / detail | 5 / 10 rows | |

### Command categories

Player-facing categories are confined to the commands channel when one is set.

| Category | Confined? | Examples |
|---|---|---|
| `General` | ✅ | `!help` |
| `Profile` | ✅ | `/profile` |
| `Economy` | ✅ | `/points`, `/coins` |
| `Leaderboard` | ✅ | `/top` |
| `Streak` | ✅ | `/streak` |
| `Activity` | ✅ | `/combo`, `/voice`, `/check` |
| `Leveling` | ✅ | `/level`, `/leaderboard` |
| `Partnership` | ✅ | `/partner` |
| `Projects` | ✅ | project sharing |
| `Utility` | ❌ | `/send`, `/note`, `/mod` |
| `Minecraft` | ❌ | `/minecraft`, `!ip`, `!status`, `!version` |
| `Tickets` | ❌ | `/claim`, `/close` |
| `Moderation` | ❌ | `/ban`, `/jail` |
| `Configuration` | ❌ | `/set-prefix`, `/setup-log` |
| `Admin` | ❌ | `/system`, `/whitelist` |

### Further reading

| | |
|---|---|
| [docs/architecture.md](docs/architecture.md) | Loader rules, registration routes, the feature bar |
| [docs/folder-structure.md](docs/folder-structure.md) | Where everything lives |
| [docs/bot/economy.md](docs/bot/economy.md) | Points, RC and coins in full |
| [docs/bot/voice.md](docs/bot/voice.md) | Voice activity in full |
| [docs/bot/streak.md](docs/bot/streak.md) | Streaks |
| [docs/bot/combo.md](docs/bot/combo.md) | Combo scoring |
| [docs/bot/shortcuts.md](docs/bot/shortcuts.md) | Shortcut triggers and cleanup modes |
| [docs/bot/minecraft.md](docs/bot/minecraft.md) | Minecraft architecture |
| [docs/bot/minecraft-setup.md](docs/bot/minecraft-setup.md) | Minecraft operator guide |
