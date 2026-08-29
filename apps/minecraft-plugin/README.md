# Robtic Minecraft Plugin

Paper plugin that connects a Minecraft server to the Robtic Discord system. It is a **client**, not
a second source of truth: the Discord bot owns the economy, and this plugin reads and writes the
same MongoDB database.

Module documentation, collection layout, and the bridge protocol live in
[`docs/bot/minecraft.md`](../../docs/bot/minecraft.md).

## Requirements

| | |
|---|---|
| Server | Paper 1.21+ |
| Java | 21+ |
| Database | The same MongoDB the bot uses |
| Optional | LuckPerms (group sync), Citizens or any NPC plugin (menu NPC) |

## Building

```bash
cd apps/minecraft-plugin
mvn clean package
```

The shaded jar lands in `target/RobticMinecraft-1.0.0.jar`. The Mongo driver is bundled and
relocated under `org.robtic.minecraft.lib`, so it cannot clash with another plugin shading Mongo.

## Installing

1. Drop the jar into `plugins/` and start the server once to generate `plugins/RobticMinecraft/config.yml`.
2. Set at minimum:

   ```yaml
   mongo:
     uri: "mongodb://localhost:27017/robtic"   # same as MONGODB_URI in the bot's .env
   discord:
     guild-id: "123456789012345678"
   server:
     key: "survival"                            # unique per server sharing the guild
     display-name: "Survival Server"
   ```

3. Restart. The plugin refuses to enable with an unset `guild-id` or an unreachable database
   rather than failing later on a player command.

## Commands

| Command | Permission | Purpose |
|---|---|---|
| `/link` | `robtic.link` | Generate the one-time code to redeem on Discord |
| `/coins` | `robtic.economy` | Show the shared balance |
| `/exchange` (`/sell`) | `robtic.economy` | Open the ore exchange menu |
| `/robtic prices\|refresh\|status` | `robtic.admin` | Inspect prices, clear the cache, force a status report |

Prices cannot be edited in game by design — Discord owns them (`/minecraft price set`), and a
second write path would let the two sides disagree.

## The NPC

Set `npc.names` to the display names of the NPCs that should open the exchange:

```yaml
npc:
  enabled: true
  names:
    - "Coin Exchange"
```

Names are matched case-insensitively and with colour codes ignored, so `"Coin Exchange"` in the
config still matches an NPC actually called `&6Coin Exchange`.

Two mechanisms are used, because NPC plugins are not all the same kind of thing:

| NPC plugin | How the click is caught |
| --- | --- |
| Citizens, armour stands, any named mob | `PlayerInteractEntityEvent` on the entity's display name |
| **FancyNpcs** | the plugin's own `NpcInteractEvent` |
| Citizens (also) | `NPCRightClickEvent` |

The distinction matters when it stops working. A **FancyNpcs** NPC is not an entity at all — it is a
set of packets sent to the client, and nothing is spawned server-side. `PlayerInteractEntityEvent`
therefore never fires for one, so before 2.0.1 no amount of getting the name exactly right in
config.yml could have made right-click work. Both hooks install themselves only when the plugin
concerned is present, and each logs a line at startup when it does.

## Placeholders

With PlaceholderAPI installed the plugin registers the `robtic` expansion, so TAB, scoreboards,
holograms and anything else that resolves placeholders can read the shared economy. Note the
separator is `_`, not `:` — `%robtic_coins%`.

| Placeholder | Example | Meaning |
| --- | --- | --- |
| `%robtic_coins%` | `4200` | Balance, including coins sold while the API was down |
| `%robtic_coins_formatted%` | `4,200` | The same number, grouped |
| `%robtic_coins_pending%` | `0` | Coins earned offline the API has not acknowledged yet |
| `%robtic_linked%` | `yes` | Whether the Discord account is linked |
| `%robtic_discord_id%` | `2222…` | Empty when unlinked |
| `%robtic_rank%` | `Moderator` | Staff rank display name, or `Player` |
| `%robtic_rank_group%` | `mod` | LuckPerms group, or `default` |
| `%robtic_is_staff%` | `no` | Whether any configured rank is held |
| `%robtic_frozen%` / `%robtic_jailed%` | `no` | Punishment state |
| `%robtic_warnings%` | `0` | Warning count |
| `%robtic_position%` | `1` | Place on the coin leaderboard, or `-` |
| `%robtic_top_name_N%` | `Notch` | Nth name on the board, or `-` |
| `%robtic_top_coins_N%` | `4200` | Nth balance |
| `%robtic_top_coins_formatted_N%` | `4,200` | Nth balance, grouped |

An unrecognised `%robtic_…%` placeholder is left on screen untouched rather than rendered blank, so
a typo in a TAB config is visible instead of silent.

**Every value is served from memory.** PlaceholderAPI resolves on the main thread, and TAB asks for
every placeholder for every player on a timer — so none of these may make a network call. A
background task refreshes the balances, Discord roles and the leaderboard on
`api.placeholder-refresh-ticks` (30 seconds by default), and the placeholders read what it left
behind. That is also what makes `%robtic_is_staff%` cheap: the roles come from the cached profile
and are resolved against roles.yml locally, so putting it in a tab list that redraws every second
costs no Discord lookups at all.

## Configuration reference

| Key | Meaning |
|---|---|
| `mongo.uri` / `mongo.database` | Connection string; `database` overrides the one in the URI |
| `discord.guild-id` | Guild whose economy, links, and settings this server uses |
| `server.key` / `server.display-name` | Identity in the Discord status panel |
| `cache.price-seconds` / `cache.link-seconds` | In-memory TTLs; price edits also push an invalidation |
| `bridge.poll-ticks` / `bridge.batch-size` | How often and how much of the Discord queue is drained |
| `bridge.chat-to-discord` / `chat-from-discord` / `announce-connections` | Per-direction bridge switches |
| `status.heartbeat-ticks` | Heartbeat interval; a gap over 90s is reported as a crash |
| `npc.enabled` / `npc.names` | Which entities open the exchange |
| `exchange.title` / `exchange.rows` | Menu appearance |
| `permissions.sync-enabled` / `sync-on-join` | LuckPerms group sync |
| `verification.notify-on-join` / `require-link-for-economy` | Unlinked-player behaviour |
| `messages.*` | Every player-facing string, in legacy `&` colour codes |

## Threading

Every MongoDB call runs on an async task; every inventory read or write runs on the main thread.
The sell path removes items on the main thread first and credits coins afterwards, so a database
failure costs the sale rather than paying a player twice.

## Architecture

```
RobticMinecraftPlugin      Composition root — builds and injects everything
config/PluginSettings      Immutable snapshot of config.yml
persistence/               MongoProvider, collection names, one repository per collection
service/                   LinkService, PriceService, ExchangeService, ChatBridgeService,
                           StatusService, PermissionSyncService, BridgeConsumerService
gui/                       ExchangeMenu (rendering), ExchangeController (orchestration),
                           ExchangeHolder (inventory identity)
listener/                  Connection, chat, menu clicks, NPC interaction
command/                   /link, /coins, /exchange, /robtic
```

All LuckPerms references are confined to `LuckPermsGroupApplier`, which is only constructed once
the plugin has been confirmed present — nothing else can fail to load without it.
