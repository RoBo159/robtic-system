# Shortcuts

A shortcut maps a plain chat message to a command, so staff can type `red @user spam` instead of
`!warn @user spam`. Manage them with `/shortcut add | remove | list`.

Two things can sit behind a trigger:

- **A command** — anything in the bot's command tree. It runs through the same permission and
  cooldown pipeline as `/command`, with the trigger standing in for the prefix, so a usage error
  reads `red @user <reason>` rather than `!warn @user <reason>`.
- **A channel utility** — `lock`, `unlock`, `hide`, `show`, `slowmode`, `clear`. These have no slash
  command behind them and are gated by **Manage Channels** rather than by a command's own checks.

## Cleanup

`/shortcut add` requires a `delete` choice, deciding what disappears a few seconds after the
shortcut runs:

| Mode | Deletes | Use it for |
|---|---|---|
| `both` | The trigger message and the bot's reply | Channel utilities — after `!lock` neither message is worth keeping, and the trigger just makes the channel look like a command log |
| `output` | Only the bot's reply | Shortcuts whose reply is noise but whose invocation should stay visible |
| `none` | Nothing | Moderation actions — a ban with no trace of who asked for it is a worse channel than a noisy one |

Re-running `/shortcut add` with the same trigger updates the existing shortcut, so this is also how
you change a mode.

Shortcuts created before this setting existed fall back to a per-command default: `both` for the
channel utilities, `none` for everything else.

## Notes

- Triggers are matched longest-first, so a longer trigger wins over a shorter one it starts with.
- A trigger matches the whole message, or the message up to the first space with the rest passed as
  arguments.
- Cleanup applies to shortcuts only. Plain `!command` never deletes anything.
