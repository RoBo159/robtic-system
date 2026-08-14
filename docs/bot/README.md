# Bot Documentation

`apps/bot` is one Discord bot — one token, one gateway connection, one command tree.

Big systems live in `features/<key>/`, each owning its commands, events, components and prefix
form, and each switchable per guild with `/feature`. Smaller commands sit under `commands/` in the
scope tree (`global/`, `guild/{admin,general,games}/`, `admin/`). See
[architecture.md](../architecture.md) for the loader rules and the bar a system has to clear to
become a feature.

| System | Location | Purpose |
|---|---|---|
| moderation | `commands/moderation/` | Punishments, tickets, audit logging, security rules |
| community | `commands/community/` | XP, levels, decay, staff activity, support analysis |
| dev | `commands/dev/` | Project tracking and review flows |
| minecraft | `commands/minecraft.ts` | Linking, shared economy, chat bridge, LuckPerms sync |
| economy / activity | root of `commands/` | Combo, streak, coins, top, ads, partners, profiles, panels |

Command names are unique across the whole tree — two systems cannot both register `/mod`, and the
loader reports a collision rather than letting one silently overwrite the other.

## Feature Docs

- [ads.md](./ads.md) — advertisement ordering system
- [combo.md](./combo.md) — two-user conversation scoring
- [command-categories.md](./command-categories.md) — command categories and which are confined to the commands channel
- [minecraft.md](./minecraft.md) — Minecraft architecture: linking, shared economy, chat bridge, LuckPerms sync
- [minecraft-setup.md](./minecraft-setup.md) — Operator guide: API keys, chat wiring, logging channels, full command reference
- [modal.md](./modal.md) — modal patterns
- [shortcuts.md](./shortcuts.md) — `/shortcut` triggers and their cleanup modes
- [streak.md](./streak.md) — daily streak system
