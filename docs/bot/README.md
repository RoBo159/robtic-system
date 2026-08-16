# Bot Documentation

`apps/bot` is one Discord bot — one token, one gateway connection, one command tree.

Big systems live in `features/<key>/`, each owning its commands, events, components and prefix
form, and each switchable per guild with `/feature`. Smaller commands sit under `commands/` in the
scope tree (`global/`, `guild/{admin,general,games}/`, `admin/`). See
[architecture.md](../architecture.md) for the loader rules and the bar a system has to clear to
become a feature.

| System | Location | Purpose |
|---|---|---|
| points | `features/points/` | Activity points + RC premium currency — on by default |
| coins | `features/coins/` | Minecraft wallet — global, one balance per person, on by default |
| combo | `features/combo/` | Two-user conversation scoring — on by default |
| top | `features/top/` | Cross-category leaderboard panel — on by default |
| logging | `features/logging/` | Log channel routing — on by default |
| panels | `features/panels/` | Reusable message panels — on by default |
| shortcuts | `features/shortcuts/` | Custom message triggers — on by default |
| voice | `features/voice/` | Voice XP and time tracking — opt-in per guild |
| streak | `features/streak/` | Daily message streaks — opt-in per guild |
| quests | `features/quests/` | Generated quests and the weekly community challenge — opt-in per guild |
| reply | `features/reply/` | Auto-replies to trigger phrases — opt-in per guild |
| rejoin-roles | `features/rejoin-roles/` | Restore roles when a member returns — opt-in per guild |
| partner | `features/partner/` | Partner server directory — opt-in per guild |
| moderation | `commands/guild/admin/moderation/` | Punishments, audit logging, security rules |
| tickets | `commands/guild/admin/tickets/` | Ticket lifecycle |
| configuration | `commands/guild/admin/` | Prefix, roles, channels, panels, XP, shortcuts |
| minecraft | `commands/guild/games/` | Linking, shared economy, chat bridge, LuckPerms sync |
| member-facing | `commands/guild/general/` | Profile, level, help, notes |
| cross-server | `commands/global/` | Partners, project sharing, version |
| bot operator | `commands/admin/` | Server allowlist, super users, reload, admin guild |

Command names are unique across the whole tree — two systems cannot both register `/mod`, and the
loader reports a collision rather than letting one silently overwrite the other.

## Feature Docs

- [combo.md](./combo.md) — two-user conversation scoring
- [economy.md](./economy.md) — points, RC, coins, and every way activity pays out
- [command-categories.md](./command-categories.md) — command categories and which are confined to the commands channel
- [minecraft.md](./minecraft.md) — Minecraft architecture: linking, shared economy, chat bridge, LuckPerms sync
- [minecraft-setup.md](./minecraft-setup.md) — Operator guide: API keys, chat wiring, logging channels, full command reference
- [modal.md](./modal.md) — modal patterns
- [quests.md](./quests.md) — quest generation, claiming, automatic progress and the weekly community challenge
- [shortcuts.md](./shortcuts.md) — `/shortcut` triggers and their cleanup modes
- [streak.md](./streak.md) — daily streak system
- [voice.md](./voice.md) — voice activity XP, AFK detection and time tracking
