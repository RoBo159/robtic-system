# PlaceholderAPI variables

Every placeholder the Robtic Minecraft plugin exposes, and what each one returns.

All of them live under one identifier — `robtic` — so every variable starts `%robtic_`. That is
deliberate: PlaceholderAPI allows one expansion per identifier, and splitting jobs or statistics into
their own would mean writing `%robticjobs_job%` next to `%robtic_robs%` in every config on the server.

## Before you start

1. Install [PlaceholderAPI](https://www.spigotmc.org/resources/placeholderapi.6245/). Without it the
   plugin logs `PlaceholderAPI is not installed — %robtic_…% placeholders are unavailable.` at boot
   and nothing below works.
2. Check the expansion registered: `/papi list` should show **robtic**.
3. Test one: `/papi parse me %robtic_robs%`.

An unrecognised placeholder is left as literal text rather than rendered as an empty string. If you
see `%robtic_something%` in game, the name is wrong — that is the intended signal, not a bug.

> **Everything here is a memory read.** Nothing touches the network or the database, because
> PlaceholderAPI resolves on the calling thread and things like TAB re-render for every player every
> second. A value whose cache has not warmed up yet returns its fallback rather than blocking.

---

## Economy

Robs are the Minecraft currency and carry **two decimal places**. Whole amounts render without them,
so `5,000` rather than `5,000.00`.

| Placeholder | Example | Meaning |
| --- | --- | --- |
| `%robtic_robs%` | `4,200` | Balance: confirmed plus anything earned offline that has not been acknowledged yet |
| `%robtic_robs_formatted%` | `4,200` | Identical to the above — kept because older configs use it |
| `%robtic_robs_pending%` | `0` | Earned while the API was unreachable and not yet confirmed. Non-zero means a sync is outstanding |

### Leaderboard

`N` is the position, starting at 1. These work with **no player attached**, so they are safe on a
login screen or a hologram.

| Placeholder | Example | Meaning |
| --- | --- | --- |
| `%robtic_top_name_N%` | `Notch` | Name at position N, or `-` |
| `%robtic_top_robs_N%` | `4,200` | Balance at position N, or `0` |
| `%robtic_top_robs_formatted_N%` | `4,200` | Identical to the above |
| `%robtic_position%` | `1` | *This* player's place on the board, or `-` if unranked |

---

## Account

| Placeholder | Example | Meaning |
| --- | --- | --- |
| `%robtic_linked%` | `yes` / `no` | Whether they have linked a Discord account |
| `%robtic_discord_id%` | `2222…` | Their Discord id, or empty when unlinked |
| `%robtic_rank%` | `Moderator` | Staff rank display name, or `Player` |
| `%robtic_rank_group%` | `mod` | LuckPerms group behind that rank, or `default` |
| `%robtic_is_staff%` | `yes` / `no` | Whether they hold any staff rank |
| `%robtic_frozen%` | `yes` / `no` | Frozen by a moderator |
| `%robtic_jailed%` | `yes` / `no` | Currently jailed |
| `%robtic_warnings%` | `3` | How many warnings they have |

Rank is answered from the player's LuckPerms groups resolved against `roles.yml` — read from memory,
never from Discord and never over the network.

---

## Staff

### Server-wide

| Placeholder | Example | Meaning |
| --- | --- | --- |
| `%robtic_staff_online%` | `3` | Staff connected, on duty or not |
| `%robtic_staff_active%` | `1` | Staff currently in `/admin` |
| `%robtic_staff_available%` | `yes` / `no` | Whether a report can be filed right now |
| `%robtic_reports_open%` | `4` | Unclaimed reports |
| `%robtic_reports_reviewing%` | `1` | Claimed and being handled |
| `%robtic_reports_resolved%` | `97` | Closed, all time |

### This player

| Placeholder | Example | Meaning |
| --- | --- | --- |
| `%robtic_staff_rank%` | `Moderator` | Their staff rank, or `-` |
| `%robtic_staff_mode%` | `yes` / `no` | Whether they are in `/admin` |
| `%robtic_staff_session%` | `1h 12m` | How long they have been on duty, or `-` |
| `%robtic_reports_claimed%` | `1` | Reports they are currently holding |
| `%robtic_staff_total_cases%` | `42` | Reports they have closed |
| `%robtic_staff_jails%` | `18` | Jails they have issued |
| `%robtic_staff_warnings%` | `31` | Warnings they have issued |

---

## AFK

| Placeholder | Example | Meaning |
| --- | --- | --- |
| `%robtic_afk%` | `yes` / `no` | Whether they are in the AFK world right now |
| `%robtic_afk_session%` | `42m` | The current AFK session, or `0m` |
| `%robtic_afk_today%` | `3h 10m` | AFK time today (UTC day boundary) |
| `%robtic_afk_total%` | `5d 2h` | Lifetime AFK time |
| `%robtic_afk_robs%` | `1,240.83` | Lifetime robs earned by being AFK |

`afk_session` is derived from the session's start timestamp rather than read from a counter, so it is
correct whenever it is asked for and there is no value being updated on a timer that a fast-refreshing
tab list could catch mid-write.

---

## Jobs

Available when the progression system is running. `%robtic_job%` and friends report the player's
**first active job** — the one whose numbers a tab list or scoreboard should show.

| Placeholder | Example | Meaning |
| --- | --- | --- |
| `%robtic_job%` | `Miner` | Display name of the first active job, or `-` |
| `%robtic_job_id%` | `miner` | Its id |
| `%robtic_job_level%` | `18` | Level in it |
| `%robtic_job_xp%` | `4200` | Total XP in it |
| `%robtic_job_xp_next%` | `800` | XP still needed for the next level |
| `%robtic_job_progress%` | `62` | Percent through the current level |
| `%robtic_job_max%` | `100` | That job's level cap |
| `%robtic_active_jobs%` | `Miner, Farmer` | Every active job, comma-separated |
| `%robtic_owned_jobs%` | `Miner, Farmer, Fisher` | Every owned job |
| `%robtic_active_jobs_count%` | `2` | How many are active |
| `%robtic_owned_jobs_count%` | `3` | How many they own |

### A specific job

Replace `<id>` with a job id from `jobs.yml` — `miner`, `farmer`, `fisher`, `lumberjack`, `hunter`.

| Placeholder | Example | Meaning |
| --- | --- | --- |
| `%robtic_job_level_<id>%` | `18` | Level in that job, `0` if not owned |
| `%robtic_job_xp_<id>%` | `4200` | Total XP in it, `0` if not owned |
| `%robtic_job_has_<id>%` | `yes` / `no` | Whether they own it |

A job id may contain underscores — `%robtic_job_level_deep_miner%` resolves the job `deep_miner`,
not `deep`.

---

## Titles

| Placeholder | Example | Meaning |
| --- | --- | --- |
| `%robtic_title%` | `§bStonebreaker` | The equipped title, with its rarity colour, or `-` |
| `%robtic_title_plain%` | `Stonebreaker` | The same without colour codes |
| `%robtic_title_rarity%` | `Rare` | Its rarity, or `-` |
| `%robtic_titles_owned%` | `14` | How many they have unlocked |
| `%robtic_titles_total%` | `60` | How many exist and are visible |

Use `%robtic_title_plain%` anywhere the surrounding text sets its own colour — a chat format, say —
otherwise the title's colour bleeds into everything after it.

---

## Statistics

Every statistic registered in `statistics.yml` gets placeholders automatically. Nothing is hardcoded:
add a statistic to that file and its placeholders work immediately, with no plugin change.

Replace `<id>` with a statistic id, and `<category>` with a category id.

| Placeholder | Example | Meaning |
| --- | --- | --- |
| `%robtic_stat_<id>%` | `5,000` | The value, formatted for its type |
| `%robtic_stat_raw_<id>%` | `5000` | The stored number, unformatted — use this for comparisons and scoreboard scores |
| `%robtic_stat_has_<id>%` | `yes` / `no` | Whether they have ever recorded a value |
| `%robtic_stat_name_<id>%` | `Coal Mined` | The statistic's display name |
| `%robtic_stat_total_<category>%` | `12,430` | Every numeric statistic in that category, summed |

Formatting follows the statistic's declared type: a `duration` renders `3d 4h`, a `timestamp` renders
`2026-08-26 14:30`, a `boolean` renders `yes`/`no`, and a plain count is grouped with separators.
`stat_raw_` always gives the underlying number.

An **unknown** statistic id returns the placeholder unresolved rather than `0`. A confident zero for
a typo is how somebody spends an afternoon wondering why a counter never moves.

### Statistic ids shipped by default

**player** — `playtime`, `session_playtime`, `joins`, `first_join`, `last_seen`

**combat** — `mobs_killed`, `players_killed`, `deaths`, `zombies_killed`, `skeletons_killed`,
`creepers_killed`

**world** — `blocks_broken`, `blocks_placed`, `stone_mined`, `coal_mined`, `iron_mined`, `gold_mined`,
`diamond_mined`, `ancient_debris_mined`, `logs_chopped`, `crops_harvested`, `fish_caught`,
`items_crafted`

**economy** — `robs_earned`, `robs_spent`, `daily_robs_earned`

**market** — `items_sold`, `daily_items_sold`

**exploration** — `structures_discovered`

**workspace** — `workspaces_claimed`, `workspace_upgrades`, `workspace_tax_paid`,
`workspace_items_stored`

**npc** — `npc_interactions`

**jobs** — `jobs_joined`, `job_levels_gained`, `titles_unlocked`, `contracts_completed`

Category ids for `stat_total_`: `player`, `combat`, `world`, `economy`, `exploration`, `workspace`,
`npc`, `jobs`, `market`, `custom`.

---

## Examples

### Tab list

```yaml
header:
  - "&6&lRobtic"
  - "&7Robs: &f%robtic_robs%  &8|  &7Rank: &f%robtic_rank%"
playerlist:
  - "%robtic_title% &f%player_name%"
```

### Scoreboard

```yaml
lines:
  - "&7Job: &f%robtic_job% &8(&7%robtic_job_level%&8)"
  - "&7Progress: &f%robtic_job_progress%&7%"
  - "&7Robs: &6%robtic_robs%"
  - "&7Blocks mined: &f%robtic_stat_blocks_broken%"
```

Note `%robtic_job_progress%&7%` — the second `%` is the literal percent sign. Writing
`%robtic_job_progress%%` would leave PlaceholderAPI looking for a placeholder that starts where the
last one ended.

### Chat format

```yaml
format: "%robtic_title_plain% &7| &f%player_name%&7: &f%message%"
```

### A conditional, with an add-on that supports them

```yaml
- "%robtic_afk% == yes ? &7(AFK %robtic_afk_session%) : &a● Active"
```

### A leaderboard hologram

```yaml
lines:
  - "&6&lTop Robs"
  - "&e1. &f%robtic_top_name_1% &7— &6%robtic_top_robs_1%"
  - "&e2. &f%robtic_top_name_2% &7— &6%robtic_top_robs_2%"
  - "&e3. &f%robtic_top_name_3% &7— &6%robtic_top_robs_3%"
```

---

## Troubleshooting

**A placeholder shows as literal text**

The name is not recognised. Check the spelling against this page, then `/papi parse me <placeholder>`
to test it in isolation. For a statistic, check the id exists in `statistics.yml`.

**Every placeholder stopped working after `/papi reload`**

It should not — the expansion sets `persist()`, which keeps it registered across a PlaceholderAPI
reload. If it happens anyway, `/papi list` will show whether `robtic` is still there; if it is not,
the plugin failed to re-register and the server log will say why.

**A value is `0`, `-` or empty when it should not be**

That is a cache that has not warmed up, or a player whose data failed to load. Placeholders never
block on the network, so an unavailable value is reported as its fallback rather than waited for.
Check the server log for a load failure for that player.

**A statistic never moves**

Either nothing is recording it, or the id is wrong. `%robtic_stat_has_<id>%` distinguishes the two:
`no` means no value has ever been recorded, and an unresolved placeholder means the id does not
exist.
