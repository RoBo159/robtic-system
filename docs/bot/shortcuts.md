# Shortcuts

A shortcut maps a plain chat message to a command, so staff can type `red @user spam` instead of
`!warn @user spam`. Manage them with `/shortcut add | remove | list`.

A target is a **whole command path**, not just a command name — `coins balance`, `warn add`,
`streak-config channel add`. Autocomplete on `/shortcut add` lists every runnable path, and a bare
name that needs a subcommand is rejected rather than stored to fail later.

```
/shortcut add command:"coins balance" trigger:c
!shortcut add "coins balance" c
```

The quotes matter in the prefix form: positional arguments are split on spaces, so a target made of
two words has to be quoted or `balance` would be read as the trigger. Single, double and smart
quotes all work.

Typing `c` now runs `?coins balance`. So does `?c` — a trigger is matched bare and with the guild
prefix in front, because people who learned the bot through `?coins balance` type the prefix out of
habit. A prefixed message whose first word *is* a real command is left alone, so `?coins balance`
runs the command once and never also fires a `coins` trigger.

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
- A shortcut runs through the prefix stand-in, which has no modal. A subcommand that opens one —
  `reason create` — answers with "use the slash command" instead of failing; the command's other
  subcommands still work. `bun run test:prefix` checks that every `showModal()` in the tree is
  either unreachable from chat or declared this way.
