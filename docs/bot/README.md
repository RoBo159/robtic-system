# Bot Documentation

`apps/bot` runs six Discord bots from one process (token-merged where bots share a token):

| Bot | Purpose |
|---|---|
| main | System controller: combo, streak, coins, ads, partners, profiles, panels, prefix commands, Minecraft integration |
| moderation | Punishments, tickets, audit logging, security rules |
| hr | Staff management, interviews, promotions, warns, submissions |
| modmail | User-staff DM threads, appeals, reports, tags |
| community | XP, levels, decay, staff activity, support analysis |
| dev | Project tracking and review flows |

## Feature Docs

- [ads.md](./ads.md) — advertisement ordering system
- [combo.md](./combo.md) — two-user conversation scoring
- [command-categories.md](./command-categories.md) — command categories and which are confined to the commands channel
- [minecraft.md](./minecraft.md) — Minecraft architecture: linking, shared economy, chat bridge, LuckPerms sync
- [minecraft-setup.md](./minecraft-setup.md) — Operator guide: API keys, chat wiring, logging channels, full command reference
- [modal.md](./modal.md) — modal patterns
- [streak.md](./streak.md) — daily streak system
