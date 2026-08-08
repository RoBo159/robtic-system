# Minecraft Setup Guide

Everything an operator needs: getting an API key, wiring chat to Discord, choosing where logs go,
and the full command reference.

Architecture and internals live in [`minecraft.md`](./minecraft.md). This document is the how-to.

---

## 1. Getting an API key

The plugin authenticates to the Robtic API with a bearer key. It has no database access and no
`.env` — this key is the only secret it holds.

### Issue it

Run in Discord, in a staff-only channel:

```
/minecraft apikey create label:survival-01 server:survival
```

| Option | What it is |
|---|---|
| `label` | A name for the key. Used to revoke it later. Must be unique per guild. |
| `server` | The `server.id` this key may act for. A key bound to `survival` cannot claim to be `skyblock`. |

The reply is **ephemeral and shown exactly once**:

```
rbtk_9f2c81a4e77b3d05...
```

Only a SHA-256 digest is stored. The plaintext cannot be recovered — not by you, not from the
database, not by us. A lost key is replaced, never looked up.

### Install it

`plugins/RobticMinecraft/api.yml`:

```yaml
api:
  url: "https://api.robtic.org"
  api-key: "rbtk_9f2c81a4e77b3d05..."
  guild-id: "1283878145463812188"
```

Then in game:

```
/robtic reload
```

**No restart.** The key is read fresh on every request, so a rotation is edit-and-reload.

### Manage keys

```
/minecraft apikey list                  Show every key, its server, and when it was last used
/minecraft apikey revoke label:old-key  Kill a key immediately
```

Revocation takes effect within **30 seconds** — that is the API's key cache expiring.

### Rotating without downtime

1. `/minecraft apikey create label:survival-02 server:survival`
2. Put the new key in `api.yml`, run `/robtic reload`
3. Confirm with `/minecraft apikey list` that `survival-02` shows a recent "last used"
4. `/minecraft apikey revoke label:survival-01`

Both keys are valid between steps 1 and 4, so no request is ever rejected mid-swap.

---

## 2. Chat: how Discord and Minecraft are linked

There are **two independent channels**. Keeping them separate is deliberate — it is what stops a
staff message ever appearing in public chat.

```
        PUBLIC                                STAFF
  ┌──────────────────┐                 ┌──────────────────┐
  │  #minecraft-chat │                 │  #staff-chat     │
  └────────┬─────────┘                 └────────┬─────────┘
           │  both directions                   │  both directions
           ▼                                    ▼
  in-game chat  ──────────────────────  /a <message>
  (everyone)                            (staff mode only)
```

### Set it up

```
/minecraft config chat-channel  channel:#minecraft-chat
/minecraft config staff-channel channel:#staff-chat
```

### Public chat

- Anything a player types in game → the public channel, as `` `[MC]` **Name** message ``
- Anything typed in that Discord channel → in-game chat as `[Discord] Name: message`
- Mentions are stripped — a player cannot ping `@everyone` from Minecraft
- Toggle with `/minecraft config toggle`

### Staff chat

- `/a <message>` in game → the staff channel, prefixed with the sender's rank
- Messages in the staff Discord channel → shown in game to staff **only**
- A player not in staff mode can neither send nor receive it

### Why it cannot loop

The bot ignores messages from bots and webhooks. Everything this integration posts back into
Discord comes from the bot account, so a relayed message can never be re-queued for the game
server. There is no counter or timestamp guard to get wrong — the loop is structurally impossible.

### Account linking

```
Player runs /link in game
  → plugin asks the API for a 6-character code (5-minute TTL)
  → player runs /minecraft link code:ABC123 in Discord
  → the code is claimed destructively, so it can never be spent twice
  → roles sync immediately; no relog needed
```

Unlink with `/minecraft unlink` (yourself) or `/minecraft unlink user:@someone` (staff).

---

## 3. Logging: where moderation actions go

The plugin **never holds a Discord channel id**. It reports an *action*; the API resolves the
destination. Re-pointing a log stream is a Discord-side change — you never edit a server config or
restart anything.

### Set a default

```
/minecraft config log-channel channel:#staff-logs
```

Every action goes there unless it has its own destination.

### Split specific actions out

```
/minecraft config log-action action:jail    channel:#punishments
/minecraft config log-action action:freeze  channel:#punishments
/minecraft config log-action action:api_error channel:#alerts
```

### Every loggable action

| Action | Colour | Fires when |
|---|---|---|
| `staff_enabled` / `staff_disabled` | Blue | A staff member enters or leaves staff mode |
| `freeze` / `unfreeze` | Amber / Green | A player is frozen or thawed |
| `jail` / `release` | Red / Green | A jail sentence starts or ends |
| `teleport` | Blue | Staff teleports to a player |
| `inventory_inspect` / `enderchest_inspect` | Blue | Staff opens a player's inventory |
| `player_report` | Amber | `/report` is used |
| `warning_added` / `warning_removed` | Amber / Green | A warning is issued or lifted |
| `note_added` | Blue | A private staff note is written |
| `role_sync` | Blue | Discord roles are pushed to LuckPerms |
| `player_linked` / `player_unlinked` | Green / Amber | An account link changes |
| `coins_sold` | Blue | Ore is sold (off by default — it is noisy) |
| `server_started` / `server_stopped` | Green / Amber | Server lifecycle |
| `plugin_error` / `api_error` / `auth_failure` | Red | Something is wrong |

### Every embed carries

Timestamp · Server · Moderator · Player · Action · Reason · Duration · UUID · Discord account ·
Minecraft username. Colour follows severity, so a jail and an inspection are distinguishable
without reading them.

### Turning actions off per server

`plugins/RobticMinecraft/logging.yml` decides what this server *reports*; Discord decides where it
*lands*.

```yaml
console: true       # mirror into the server console
discord: true       # send to Discord at all
actions:
  coins_sold: false # too noisy on a busy server
  teleport: false
```

An action missing from the list defaults to **on** — a new action added by an update should be
audited by default.

---

## 4. Command reference

### Discord — everyone

| Command | What it does |
|---|---|
| `!ip` or `/ip` | Server address, port, versions, player count. Tap-to-copy. |
| `!version` or `/version` | Supported client versions, software, Java version |
| `!status` or `/status` | Live status, players, TPS, memory, CPU, uptime, last restart |
| `/minecraft link <code>` | Redeem the code from `/link` in game |
| `/minecraft profile [user]` | Linked account, playtime, balance |
| `/minecraft status` | Server status panel |
| `/minecraft price list` | Current ore prices |

`!` is the default prefix; change it with `/set-prefix`.

### Discord — staff (manager tier and above)

| Command | What it does |
|---|---|
| `/minecraft apikey create label:<x> server:<y>` | **Issue an API key** |
| `/minecraft apikey list` | List keys |
| `/minecraft apikey revoke label:<x>` | Revoke a key |
| `/minecraft config view` | Show the whole configuration |
| `/minecraft config chat-channel channel:#x` | Public chat bridge |
| `/minecraft config staff-channel channel:#x` | Staff chat bridge |
| `/minecraft config status-channel channel:#x` | Auto-updating status panel |
| `/minecraft config log-channel channel:#x` | Default log destination |
| `/minecraft config log-action action:<a> channel:#x` | Per-action destination |
| `/minecraft config staff-rank role:@x name:<n> group:<g> priority:<p>` | **Map a Discord role to a staff rank** |
| `/minecraft config role-map role:@x group:<g>` | Map a role to a LuckPerms group |
| `/minecraft config role-unmap role:@x` | Remove a mapping |
| `/minecraft config jail-role role:@x` | Role applied while jailed |
| `/minecraft config toggle` | Chat bridge / role sync on/off |
| `/minecraft price set item:<i> coins:<n>` | Set an ore price |
| `/minecraft price remove\|toggle` | Remove or disable an item |
| `/minecraft unlink [user]` | Unlink an account |
| `/minecraft history [user] [limit]` | Sale history |

### In game — everyone

| Command | What it does |
|---|---|
| `/link` | Get a linking code |
| `/coins` | Your balance |
| `/exchange` (`/sell`) | Open the ore exchange |
| `/report <player> <reason>` | Report someone; staff-only visibility |

### In game — staff

Everything below requires **staff mode**, and staff mode requires a linked account holding a
configured Discord role. A Bukkit permission alone is never enough.

| Command | What it does |
|---|---|
| `/admin` | Toggle staff mode |
| `/a <message>` | Staff chat |
| `/hide` | Vanish |
| `/staff` | Staff dashboard |
| `/freeze <player> [reason]` | Freeze or unfreeze |
| `/jail <player> <duration\|perm> <reason>` | Jail. `30m`, `2h`, `7d`, `1h30m`, `perm` |
| `/unjail <player> [reason]` | Release |
| `/jail-set` | Set the jail to where you stand |
| `/jail-history <player>` | Sentence history |
| `/warn <player> <reason>` | Issue a warning |
| `/warnings <player>` | List warnings |
| `/note <player> <text>` | Private staff note |
| `/notes <player>` | List notes |

### In game — operator

| Command | What it does |
|---|---|
| `/robtic reload` | Re-read every config file. **This is how a key rotation takes effect.** |
| `/robtic status` | Force a status report |
| `/robtic prices` | Print the price table |
| `/robtic queue` | Queued-request count and connection state |
| `/robtic refresh` | Drop cached prices |

---

## 5. Staff ranks

Discord decides **who** is staff. `roles.yml` decides what a role **means** in game. That split is
what lets `/admin` keep working during an API outage — rank definitions are local, only "which
roles does this player hold" is remote.

Configure from Discord:

```
/minecraft config staff-rank role:@Moderator name:Moderator group:moderator priority:30
/minecraft config staff-rank role:@Admin     name:Admin     group:admin     priority:20
/minecraft config staff-rank role:@Owner     name:Owner     group:owner     priority:0
```

**Lower priority wins** when someone holds several roles.

Group behaviour:

- **Outside** staff mode → everyone holds `base-group` (default `staff`)
- **Inside** staff mode → their highest rank's group
- **On exit** → back to `base-group`

Only groups named in `roles.yml` are ever touched. A group you granted by hand in LuckPerms is
never removed.

---

## 6. Working offline

The plugin keeps running when the API is unreachable.

| Feature | Offline behaviour |
|---|---|
| `/coins` | Cached balance, marked as cached |
| `/exchange` | **Works.** Items removed, coins credited locally, sale queued |
| `/admin` | **Refused** — see below |
| Freeze / jail | Applied in game, queued for the API |
| Staff chat | Shown in game, queued for Discord |
| Staff logs | Queued |
| Join alerts | From cache |

### Why selling works but staff mode does not

Selling only ever **credits** coins, and the credit is queued under an idempotency key — so it
lands exactly once, and the worst case is that it lands a few minutes late.

Staff mode has to store an inventory snapshot **before** clearing an inventory. If that snapshot
cannot be made durable, the items have nowhere to come back from. So `/admin` refuses rather than
risk it. This is the one place the plugin deliberately fails closed.

### What the player sees

```
Sold your items for 900 coins.
(Offline — this sale will sync automatically when the connection returns.)
```

then, on reconnect:

```
Your offline earnings have synced. Balance: 4,320 coins
```

### The reconnect sequence

1. Drain the queue — every offline credit reaches the API **first**
2. Re-read balances for anyone with a pending credit; the API's figure is authoritative and the
   pending total is *cleared*, not subtracted (it is already included)
3. Drop cached profiles so role changes made during the outage take effect

Both the queue and pending credits are written to disk on shutdown, so a restart mid-outage does
not lose what a player is owed.

Tune it in `api.yml` under `offline:`. `allow-debit` is off and should stay off until something in
game actually spends coins — a debit against a cached balance cannot be validated across servers.

---

## 7. First-time setup checklist

```
1  /minecraft config status-channel channel:#mc-status
2  /minecraft config chat-channel   channel:#mc-chat
3  /minecraft config staff-channel  channel:#mc-staff
4  /minecraft config log-channel    channel:#mc-logs
5  /minecraft config staff-rank role:@Moderator name:Moderator group:moderator priority:30
   (repeat per rank)
6  /minecraft config jail-role role:@Jailed
7  /minecraft apikey create label:survival-01 server:survival
8  Drop RobticMinecraft-2.0.0.jar into plugins/, start once to generate configs
9  Fill in api.yml (url, key, guild-id) and config.yml (server.id, name, address)
10 Restart, then in game: /jail-set  and set staff.spawn in config.yml
11 Verify: /robtic status  →  "Status reported to the Robtic API."
```

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| **`/minecraft` doesn't appear in Discord** | Commands registered **globally**; Discord caches those for up to an hour | Set `COMMAND_GUILD_ID` to your guild id and restart. See below. |
| `api.yml is not configured — disabling` | `url`, `api-key` or `guild-id` blank | Fill them in, restart |
| `The Robtic API rejected this server's key` | Wrong or revoked key | Re-issue, `/robtic reload` |
| `/admin` → "you do not hold a configured Discord staff role" | No `staff-rank` mapping, or the player is unlinked | `/minecraft config staff-rank`, then `/link` |
| `/admin` → "the Robtic API is unreachable" | API down | Expected. Staff mode fails closed to protect inventories |
| Logs not appearing | No destination configured | `/minecraft config log-channel` |
| Coins look stale | Serving from cache | `/robtic queue` shows connection state |
| Jail does nothing | No jail location | Stand where you want it, `/jail-set` |

### Slash commands not appearing

Set this in `.env` and restart the bot:

```
COMMAND_GUILD_ID=1283878145463812188
```

Commands then publish to that guild and appear **immediately**.

Without it they publish globally, and Discord caches global commands for up to an hour. During
that window the command genuinely does not exist for clients — which is why **none** of these
help, and why the problem is so easy to misread:

- restarting the bot
- recreating the container
- kicking the bot and re-inviting it
- clearing the Discord client cache

Startup now logs which path it took:

```
Registering 31 commands to guild 1283878145463812188 (instant)...
Registering 31 global commands (may take up to 1h to appear)...
```

If registration is rejected, the log now names the offending command and field rather than a bare
`Invalid Form Body` — one bad command used to fail the entire batch silently, leaving every other
command frozen at its previous definition.
