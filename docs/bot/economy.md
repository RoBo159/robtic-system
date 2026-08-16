# Economy

Three currencies, with different jobs and different sources.

| | What it is | Scope | How it comes into existence |
|---|---|---|---|
| **Points** | The activity currency | **Per guild** | Earned from chat, combo, voice, streaks and quests |
| **RC** | The premium currency | **Per guild** | **Only** by converting Points |
| **Coins** | The Minecraft wallet | **Global** | `/api/economy` from the game server, or an admin |

Coins and Points are separate systems, not a rename. The Minecraft plugin's wire contract talks
about coins, and keeping the two apart meant the plugin never had to change. Discord activity used
to pay coins; it now pays Points.

**Coins are global** — one balance per person, the same in every Discord server and on every game
server on the network. Points are per guild, because they measure activity *in* a server. That
difference in scope is why moving between them is a one-way, once-per-server claim rather than an
ongoing exchange.

## Coins

There is nothing to configure and nothing to earn passively. Two things move a balance:

| | |
|---|---|
| `POST /api/economy/{add,remove,sell}` | The game server. Every mutation is an `$inc`, so several servers can credit concurrently |
| `/coins add` · `/coins remove` | An admin, in any server — it moves the same global wallet, including their in-game money |

`/coins balance` and the `coins` leaderboard are likewise global: the same numbers wherever you ask.
`guildId` is still required by the API, but only to resolve a Minecraft UUID through the per-guild
`MinecraftLink` table — it no longer scopes the balance. That is what let coins go global with no
plugin release.

### The legacy archive

Before this change, coins were per guild. Those balances were snapshotted into `LegacyCoin` and the
live wallet was reset to zero for everyone. Nothing spends from the archive; a server can claim its
own rows into Points once with `/points migrate-coins`, and consumed rows are marked rather than
deleted so the transfer stays reconcilable against the `coin-migration` ledger entries it wrote.

## Earning Points

Nothing pays out per event. Each source accumulates *progress* on the wallet and converts whole
units at the guild's rate, carrying the remainder (`progress -= earned * rate`) — so a member one
message short of a point keeps that message rather than losing it at the boundary.

| Source | Progress field | Default rate | Trigger |
|---|---|---|---|
| Messages | `messageProgress` | 100 messages → 1 point | one real (non-command) message |
| Combo | `comboProgress` | 100 combo score → 1 point | combo score awarded |
| Voice | `voiceProgress` | 10 active minutes → 1 point | the voice tick, when eligible |
| Streaks | — | configurable table | reaching a rewarded day-count, exact match |
| Quests | — | fixed per tier, 10–1000 | completing a claimed quest |
| Community | — | `communityRewardBase` × rank | settling the weekly challenge, above the floor |

Streaks and quests are the exceptions: they pay a fixed amount rather than accumulating, because
each one fires exactly once — a streak climbs one day at a time, and a quest is completed once by
each member who claimed it. Quest payouts carry an idempotency key so a retried completion cannot
pay twice. See [quests.md](./quests.md).

Every movement writes a `PointHistory` row with `balanceAfter` — an append-only ledger, readable
with `/points history`. `lifetimePoints` only ever climbs; spending reduces the balance alone, so
"earned all-time" stays meaningful after a member cashes out.

## RC

`/points convert <points>` is the only source of RC anywhere in the system. That is deliberate:
one place to reason about supply.

- Rejected if conversion is disabled, below `minConversionPoints`, or not an exact multiple of
  `pointsPerRc`.
- Points are deducted **before** RC is credited. If the process dies between the two the member is
  short-changed rather than able to mint RC from a balance they still hold — the safer failure.
- Every conversion writes an `RcConversion` row carrying the rate that applied, because a guild can
  change the rate and an old row still has to mean what it meant then. `fee` and `bonus` are
  recorded as zero rather than omitted, so taxes and membership perks can arrive later without a
  migration.

## How this relates to XP

Points and XP are independent. The same message can pay both, and voice pays both on the same tick,
but neither converts into the other and levels have no effect on point rates. XP is a progression
number; Points are a balance you spend.

## Commands

| Command | Access |
|---|---|
| `/points balance [user]` · `rates` · `history` · `convert` | anyone |
| `/points add` · `remove` · `migrate-coins` | admin |
| `/coins balance [user]` · `add` · `remove` | balance anyone, rest admin |

## Configuration

Per guild, via `/points` or the Activity admin panel's **Points & RC** section:

| Setting | Default | Bounds |
|---|---|---|
| `messagesPerPoint` | 100 | 1–100,000 |
| `comboPerPoint` | 100 | 1–100,000 |
| `voiceMinutesPerPoint` | 10 | 1–100,000 |
| `streakRewards` | empty | 15 rows, dedup'd by day-count |
| `pointsPerRc` | 100 | 1–1,000,000 |
| `conversionEnabled` | on | |
| `minConversionPoints` | 100 | 1–1,000,000 |

Coins have no earning rates left to configure — the game server decides what a coin is worth.

## Data

| Collection | Purpose |
|---|---|
| `Point` | The wallet: `points`, `lifetimePoints`, `rc`, and the three progress counters |
| `PointHistory` | Append-only ledger, one row per movement, with `balanceAfter` |
| `RcConversion` | One row per conversion, with the rate, fee and bonus that applied |
| `PointSettings` | Per-guild rates, cached 60s |
| `Coin` | The global Minecraft wallet, keyed by `discordId` alone |
| `LegacyCoin` | Frozen per-guild balances from before coins went global; claimable once per server |
