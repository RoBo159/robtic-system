# Built plugin jars

Server-ready jars for every Minecraft plugin in this repository. These are **build outputs** — a
change goes into `apps/`, and the jar is rebuilt.

```
infra/plugins/
├── DragonBattle-1.0.4.jar      the dragon fight plugin, independent of everything below
├── ecosystem/                  the ten Robtic 4.0.0 plugins — install all ten together
└── legacy/                     RobticMinecraft 3.3.2, the monolith the ecosystem replaces
```

## Install one or the other, never both

`legacy/RobticMinecraft-3.3.2.jar` and the `ecosystem/` jars **cannot run on the same server.** Both
register the `robtic` PlaceholderAPI identifier — PlaceholderAPI allows one expansion per
identifier — and both claim the same 52 commands. Whichever loads second loses.

The monolith is kept because it is the fallback: it is a single jar with no migration to undo, and
it is what to reinstall if the ecosystem misbehaves before it has been proven in production.

## The ecosystem

All ten install together into `plugins/`. Load order is handled by `softdepend` in each descriptor,
so the order they are copied in does not matter.

| Jar | Requires | Without it |
| --- | --- | --- |
| `RobticCore` | — | nothing else starts |
| `RobticWorld` | Core | no structures are discovered |
| `RobticJobs` | Core, World | no professions or workspaces |
| `RobticEssentials` | Core | no homes, friends, chests, lobby or AFK |
| `RobticStaff` | Core | no moderation; Discord cannot act on this server |
| `RobticPremium` | Core | every player is at free limits |
| `RobticDiscord` | Core | no linking or chat relay |
| `RobticAuth` | Core, **Discord** | no login gate |
| `RobticMail` | Core | no mailbox, and no mail button on the profile |
| `RobticMarket` | Core | no `/exchange` |

Every "requires" above is enforced in code, not by Bukkit's `depend:`. A missing one produces a
single line and a graceful self-disable:

```
[RobticJobs] Missing required plugin: RobticWorld. RobticJobs has been disabled.
```

No stack trace, no repetition, and the server keeps running. See `RobticPlugin` for why
`softdepend` is used instead of `depend`.

### Optional integrations

LuckPerms, PlaceholderAPI, Citizens, FancyNpcs and BetterStructures are all optional. Each missing
one logs one line at startup and disables exactly one feature.

## Rebuilding

Both builds run in Docker, so neither Maven, Gradle nor a JDK has to be installed.

```bash
# The ten-plugin ecosystem
cd apps/robtic
docker run --rm -v "$(pwd)":/app -v "$HOME/.m2":/root/.m2 -w /app \
    maven:3.9-eclipse-temurin-21 mvn -B clean install -DskipTests

# The monolith (only while it is still the fallback)
cd apps/minecraft-plugin
docker run --rm -v "$(pwd)":/app -v "$HOME/.m2":/root/.m2 -w /app \
    maven:3.9-eclipse-temurin-21 mvn -B clean package -DskipTests

# Dragon fight plugin
cd apps/DragonBattle
./build.sh clean build
```

Then collect the results:

```bash
cp apps/robtic/robtic-*/target/Robtic*.jar        infra/plugins/ecosystem/
cp apps/minecraft-plugin/target/RobticMinecraft-*.jar infra/plugins/legacy/
cp apps/DragonBattle/build/libs/DragonBattle-*.jar    infra/plugins/
```

On Git Bash for Windows, prefix each `docker run` with `MSYS_NO_PATHCONV=1` — otherwise the path
rewriting turns `-w /app` into something Docker refuses.

Maven also leaves `original-RobticMinecraft-*.jar` in `target/`; that is the pre-shade intermediate
and must **not** be deployed.

## Versions

- **Ecosystem** — `<version>` in `apps/robtic/pom.xml`. All ten modules inherit it.
- **Monolith** — `<version>` in `apps/minecraft-plugin/pom.xml`.
- **DragonBattle** — `version` in `apps/DragonBattle/build.gradle.kts`.

Each `plugin.yml` reads `${project.version}`, so nothing else needs editing.

## Before deploying

```bash
cd apps/robtic && ./robtic-world/check-markers.sh   # regions, validation rules, markers.yml
cd apps/minecraft-plugin && ./check-licenses.sh     # licence signing and expiry arithmetic
cd apps/minecraft-plugin && ./check-progression.sh  # jobs, titles and workspace configuration
```

## Data migration

The ecosystem reads the monolith's data directory and **never modifies it**. Titles are lifted out
of `RobticMinecraft/progression/players/<uuid>.json` into `RobticCore/titles/<uuid>.json` the first
time each player joins; the original file stays exactly as it was, and RobticJobs reads the same file
for the professions half.

That means a rollback to the monolith loses nothing. It also means the two data sets diverge from the
moment the ecosystem starts writing, so going back after players have been on 4.0.0 loses whatever
happened in between.

## Old versions

Superseded jars are deleted rather than kept. Two versions of the same plugin in a folder a deploy
script globs is a way to load the wrong one, and every previous build is reproducible from its tag.
