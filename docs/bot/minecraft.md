# Minecraft Integration

Links Minecraft accounts to Discord, shares one coin balance between them, sells ores for coins
through an in-game menu, bridges chat, mirrors the server's status into Discord, and synchronises
LuckPerms groups from Discord roles.

The Discord bot is the source of truth. Minecraft is another client: it reads and writes the same
MongoDB database and never stores a balance or a price of its own.

## Where it lives

| Concern | Location |
|---|---|
| Slash command | `apps/bot/src/main/commands/minecraft.ts` |
| Discord → Minecraft chat, role sync | `apps/bot/src/main/events/minecraft-chat-bridge.ts`, `minecraft-role-sync.ts` |
| Bridge drain, status panel, schedulers | `apps/bot/src/main/services/minecraft/` |
| Embeds and the admin check | `apps/bot/src/main/utils/minecraft/` |
| Linking, prices, permissions, publishing | `libs/core/src/minecraft/` |
| Schemas and repositories | `libs/database/src/{models,repositories}/Minecraft*.ts` |
| Constants | `libs/constants/src/minecraft.ts` |
| Paper plugin | `apps/minecraft-plugin/` |

It runs inside the **main** bot, which already owns the coin economy (`/coins`) and already has the
`MessageContent` and `GuildMembers` intents the chat bridge and role sync need. No new bot process.

## Collections

| Collection | Written by | Purpose |
|---|---|---|
| `minecraftlinks` | bot | Confirmed `discordId ↔ minecraftUuid` pairs |
| `minecraftlinkcodes` | plugin | One-time `/link` codes, expired by a TTL index |
| `minecraftitemprices` | bot | Coins per unit, per guild and item |
| `minecrafttransactions` | plugin | Immutable audit row per sale |
| `minecraftservers` | plugin | Per-server status and heartbeat |
| `minecraftconfigs` | bot | Channels, toggles, role → group mappings |
| `minecraftbridgeevents` | both | The bridge queue, expired by a TTL index |
| `coins` | both | **Existing** shared balance — not duplicated for Minecraft |

The coin balance deliberately stays in the existing `Coin` collection. The link resolves a UUID to
a `discordId`, and everything downstream uses the same balance Discord already awards.

## The bridge

Neither side opens a port. `minecraftbridgeevents` is a queue with a `direction`:

- `to_discord` — drained by `drain-bridge-events.ts` every 2s. One consumer, claimed by flipping
  `consumed`.
- `to_minecraft` — polled by the plugin every 2s (40 ticks). A broadcast (`serverKey: null`) must
  reach every server in the guild, so each server adds its own key to `consumedBy` instead of
  flipping a shared flag.

### Event payloads

| Type | Direction | Payload |
|---|---|---|
| `chat` | both | `{ username, message, discordId? , minecraftUuid? }` |
| `player_join` / `player_quit` | → Discord | `{ minecraftUuid, username, linked }` |
| `server_status` | → Discord | `{ status, displayName, onlinePlayers, maxPlayers, version }` |
| `price_invalidate` | → Minecraft | `{ itemKey }` |
| `role_sync` | → Minecraft | `{ discordId, minecraftUuid, reason, grant[], revoke[], managed[] }` |

## Flows

### Linking

1. Player runs `/link` in game. The plugin writes a 6-character code with a 5-minute TTL.
2. Player runs `/minecraft link CODE` on Discord.
3. `redeemLinkCode` claims the code with `findOneAndDelete`, so it can never be spent twice, then
   checks that neither side is already linked and creates the link.
4. A `role_sync` event is queued so the player's groups are applied without relogging.

### Selling

1. The plugin loads prices and the balance asynchronously, then counts the player's inventory on
   the main thread and renders the menu.
2. On confirm, items are **removed first** on the main thread; coins are credited afterwards with
   `$inc` for exactly the number of units the removal reported. A database failure therefore costs
   the sale rather than paying twice.
3. A transaction row is appended with the unit price at the time of sale, so history stays correct
   after a price change.

### Crash detection

The plugin heartbeats every 30s and writes `OFFLINE` on a clean shutdown. A server still marked
`ONLINE` whose heartbeat is more than 90s old is promoted to `CRASHED` by the bot's status tick —
a process that died cannot report its own death.

### Role sync

`resolveLuckPermsGroups` turns a member's roles into `{ grant, revoke, managed }`, where `managed`
is exactly the set of groups named in the guild's mappings. Groups outside that set never appear
in either list, which is what keeps manually assigned groups safe.

## Commands

| Command | Who |
|---|---|
| `/minecraft link <code>` | everyone |
| `/minecraft unlink [user]` | self; staff for others |
| `/minecraft profile [user]` | everyone |
| `/minecraft status` | everyone |
| `/minecraft history [user] [limit]` | own history; staff for others and guild-wide |
| `/minecraft price list` | everyone |
| `/minecraft price set\|remove\|toggle` | staff |
| `/minecraft config view\|status-channel\|chat-channel\|toggle\|role-map\|role-unmap` | staff |

Staff means manager tier or above (`STAFF_TIER_THRESHOLDS.manager`), plus super users — the same
check the combo module uses. The command carries no `requiredPermission` because `/minecraft link`
must stay open to everyone, so each admin branch checks for itself.

## Setup

1. `/minecraft config status-channel #channel`
2. `/minecraft config chat-channel #channel`
3. `/minecraft config role-map @Moderator moderator`
4. Install the plugin (see `apps/minecraft-plugin/README.md`) with the same `MONGODB_URI` and the
   guild id.
5. Prices are seeded from the catalog the first time a server reports in or an admin runs
   `/minecraft price list`; adjust with `/minecraft price set`.
