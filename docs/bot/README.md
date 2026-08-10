# Bot Documentation

`apps/bot` is one Discord bot — one token, one gateway connection, one command tree — running six
systems. Each system keeps its own subfolder under `commands/`, `components/`, `events/`,
`services/` and `utils/`; the sixth (admin) sits at the root of those folders since it is the bot's
own baseline.

| System | Folder | Purpose |
|---|---|---|
| admin | (root) | System controller: combo, streak, coins, ads, partners, profiles, panels, prefix commands, Minecraft integration |
| moderation | `moderation/` | Punishments, tickets, audit logging, security rules |
| hr | `hr/` | Staff management, interviews, promotions, warns, submissions |
| modmail | `modmail/` | User-staff DM threads, appeals, reports, tags |
| community | `community/` | XP, levels, decay, staff activity, support analysis |
| dev | `dev/` | Project tracking and review flows |

Command names are unique across the whole tree — two systems cannot both register `/mod`.

## Feature Docs

- [ads.md](./ads.md) — advertisement ordering system
- [combo.md](./combo.md) — two-user conversation scoring
- [command-categories.md](./command-categories.md) — command categories and which are confined to the commands channel
- [minecraft.md](./minecraft.md) — Minecraft architecture: linking, shared economy, chat bridge, LuckPerms sync
- [minecraft-setup.md](./minecraft-setup.md) — Operator guide: API keys, chat wiring, logging channels, full command reference
- [modal.md](./modal.md) — modal patterns
- [streak.md](./streak.md) — daily streak system
