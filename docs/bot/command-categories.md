# Command Categories

Every command declares a `category`. It drives two things: how `!help` groups commands, and
whether the command is confined to the configured commands channel.

## Where each category may be used

| Category | Commands channel only? | Examples |
|---|---|---|
| `General` (or no category) | ✅ Yes | `!help` |
| `Profile` | ✅ Yes | `/profile` |
| `Economy` | ✅ Yes | `/points`, `/coins` |
| `Leaderboard` | ✅ Yes | `/top` |
| `Streak` | ✅ Yes | `/streak`, `/streak-top` |
| `Activity` | ✅ Yes | `/check` |
| `Partnership` | ✅ Yes | `/partner` |
| `Utility` | ❌ Anywhere | `/line`, `/send` |
| `Minecraft` | ❌ Anywhere | `/minecraft`, `!ip`, `!status`, `!version` |
| `Configuration` | ❌ Anywhere | `/set-prefix`, `/setup-log` |
| `Admin` | ❌ Anywhere | `/system`, `/whitelist` |
| `Moderation` | ❌ Anywhere | punishment commands |

## Why staff commands are exempt

The commands channel exists to keep `!profile` and `!top` spam out of conversation channels. That
reasoning does not extend to staff work.

An admin fixing a broken role mapping, or a moderator checking `!status` during an incident,
should not have to walk to a specific channel first. Forcing them to actually *spreads* the noise
the restriction was meant to contain, because staff commands then run in the busiest channel on
the server at the worst possible moment.

Staff commands are already gated by permission. Channel confinement on top of that adds friction
without adding protection.

## Adding a command

```ts
export default {
    category: "Minecraft",   // exempt — usable anywhere
    data: new SlashCommandBuilder()...,
    async run(interaction, client) { ... },
};
```

A command with **no** category counts as General and **is** restricted. That is the deliberate
default: a new command that forgot its category is far more likely to be player-facing than staff
tooling, and the safe failure is a command that is too confined rather than one that leaks spam
everywhere.

## Changing the policy

The exempt list is `UNRESTRICTED_COMMAND_CATEGORIES` in
[`libs/constants/src/command-categories.ts`](../../libs/constants/src/command-categories.ts). It is
read by `isChannelRestricted()`, which the prefix router calls — one list, one call site, so the
policy cannot drift between commands.

Set the channel itself with `/set-commands-channel`. With no channel configured, nothing is
restricted and every command works everywhere.
