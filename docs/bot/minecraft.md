# Minecraft Integration

Links Minecraft accounts to Discord, sells ores for **robs** through an in-game menu, bridges chat,
mirrors the server's status into Discord, and mirrors LuckPerms groups onto Discord roles.

**Two separate currencies.** Discord has **coins**; Minecraft has **robs**. Robs are keyed by
Minecraft UUID, so a player who has never linked Discord still has a wallet, and the two balances
never convert into one another. The game server cannot read or move a coin balance.

**LuckPerms decides who is staff.** A rank *is* a LuckPerms group. The game server resolves rank
locally and reports the Discord roles it wants applied; Discord never writes a group back. Granting
somebody a Discord role does not make them staff.

## Where it lives

| Concern | Location |
|---|---|
| Slash command | `apps/bot/src/main/commands/minecraft.ts` |
| Discord → Minecraft chat | `apps/bot/src/main/events/minecraft-chat-bridge.ts` |
| Minecraft → Discord role mirror | plugin `service/RoleSyncService.java` → `POST /api/discord/sync-roles` |
| Bridge drain, status panel, schedulers | `apps/bot/src/main/services/minecraft/` |
| Embeds and the admin check | `apps/bot/src/main/utils/minecraft/` |
| Linking, prices, permissions, publishing | `libs/core/src/minecraft/` |
| Schemas and repositories | `libs/database/src/{models,repositories}/Minecraft*.ts` |
| Constants | `libs/constants/src/minecraft.ts` |
| Paper plugin | `apps/minecraft-plugin/` |

It runs inside the **main** bot, which already owns the Discord coin economy (`/coins`) and already
has the `MessageContent` and `GuildMembers` intents the chat bridge needs. No new bot process.

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
| `coins` | bot | Discord-only balance. **Never** touched by the game server |
| `robs` | minecraft-api | The Minecraft currency, keyed by `minecraftUuid` |
| `robtransactions` | minecraft-api | Ore-exchange sales, paid in robs, keyed by uuid |

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
4. The player's LuckPerms groups are read on the game server and any Discord role change is queued
   for the next sync flush.

### Selling

1. The plugin loads prices and the balance asynchronously, then counts the player's inventory on
   the main thread and renders the menu.
2. On confirm, items are **removed first** on the main thread; robs are credited afterwards with
   `$inc` for exactly the number of units the removal reported. A database failure therefore costs
   the sale rather than paying twice.
3. A transaction row is appended with the unit price at the time of sale, so history stays correct
   after a price change.

### Crash detection

The plugin heartbeats every 30s and writes `OFFLINE` on a clean shutdown. A server still marked
`ONLINE` whose heartbeat is more than 90s old is promoted to `CRASHED` by the bot's status tick —
a process that died cannot report its own death.

### Role sync — Minecraft to Discord

The game server reads a player's LuckPerms groups, resolves the Discord role ids they imply from
`roles.yml`, and posts the outcome to `POST /api/discord/sync-roles`. The API performs the Discord
write and nothing else: it holds no copy of the ladder and never maps a role back to a group.

Only role ids named in `roles.yml` — on a rank or in `group-roles` — are ever revoked, which is what
keeps a manually assigned Discord role safe.

Three things keep the request count near zero:

- **Rank resolution is local.** Groups are in memory, so answering "is this player staff?" costs
  nothing at all.
- **Only changes are sent.** The plugin records what Discord was last told; a player whose groups
  have not moved produces no request.
- **Changes are batched and event-driven.** LuckPerms reports a change the moment it happens, and
  everything that moved in one window goes out as a single request.

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
