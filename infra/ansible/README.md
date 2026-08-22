# infra/ansible

Automated, repeatable deployment of the Robtic stack from GHCR.

It does not replace the Docker Compose model — it drives it. The Compose file it uses is the same
`infra/docker/compose/docker-compose.yml` the GitHub Actions pipeline uses, so both paths produce
the same containers and neither has its own copy to drift.

```text
infra/ansible/
├── ansible.cfg
├── requirements.yml              collection dependencies
├── .yamllint
├── inventory/
│   ├── production.ini            core.robtic.org
│   └── development.ini           localhost, for rehearsing
├── group_vars/
│   ├── production/
│   │   ├── vars.yml              public config; references vault_* only
│   │   └── vault.yml.example     template for the encrypted vault (vault.yml is yours to create)
│   └── development/vars.yml
├── templates/
│   └── env.j2                    the generated .env
├── playbooks/
│   ├── bootstrap.yml             once per host: Docker, hardening, checkout
│   ├── deploy.yml                full release: config + images
│   └── update.yml                images only, no vault password needed
└── roles/
    ├── docker/                   engine + Compose plugin from Docker's apt repo
    ├── security/                 sshd, unattended security upgrades, fail2ban
    └── deploy/                   preflight → env → release → verify → prune
```

## Quick start

```bash
cd infra/ansible
ansible-galaxy collection install -r requirements.yml

# once per host
ansible-playbook playbooks/bootstrap.yml --ask-become-pass

# create the vault (see "Secrets" below), then
ansible-playbook playbooks/deploy.yml --ask-vault-pass

# routine: new images from CI, no config change, no vault password
ansible-playbook playbooks/update.yml
```

Rehearse against your own machine first — same playbooks, throwaway values, no vault:

```bash
ansible-playbook -i inventory/development.ini playbooks/deploy.yml
```

## Values you must supply

`group_vars/production/vars.yml` ships with two public values blank because they are specific to
your setup:

| Variable | Where to find it |
|---|---|
| `bot_owner_id` | Your own Discord user ID (Developer Mode → right-click → Copy User ID) |
| `command_guild_id` | The guild admin-only commands register to |

The Discord application ID is not in `vars.yml` — like the bot token and OAuth client secret, it
lives in the vault as `vault_discord_client_id`, so all three Discord credentials sit in one place.
The deploy refuses to start until it (and every other required `vault_*` value) is set.

## Secrets

Public configuration is in `vars.yml`; every secret is a `vault_*` reference resolved from the
encrypted `vault.yml` beside it. `vars.yml` never contains a literal secret, which is what keeps it
reviewable in a pull request.

```bash
cp group_vars/production/vault.yml.example group_vars/production/vault.yml
$EDITOR group_vars/production/vault.yml          # fill in real values
ansible-vault encrypt group_vars/production/vault.yml
```

Or, from the repository root, the same thing through the `bun run vault:*` wrapper (`infra/ansible/scripts/vault.sh`) — `vault:init`, then `$EDITOR`, then `vault:encrypt`:

```bash
bun run vault:init production
$EDITOR infra/ansible/group_vars/production/vault.yml
bun run vault:encrypt production
```

`vault:encrypt`/`decrypt`/`edit`/`view`/`rekey` use the native `ansible-vault` when it actually works, and otherwise fall back to running it inside a small Docker container (`infra/docker/dockerfiles/ansible-vault.Dockerfile`, built on first use) — needed on Windows, where ansible-core's own startup check fails under Git Bash/mintty with `OSError: [WinError 1] Incorrect function`. The fallback needs Docker installed; nothing else changes about the workflow.

Afterwards:

```bash
ansible-vault edit group_vars/production/vault.yml    # edit without writing plaintext to disk
ansible-vault view group_vars/production/vault.yml    # read without decrypting in place
ansible-vault rekey group_vars/production/vault.yml   # change the vault password
```

**The encrypted `vault.yml` is meant to be committed** — that is the point of Vault. What must never
be committed is the vault password, or `vault.yml` left unencrypted.

### Committing does not encrypt anything

There is no automatic encryption on commit, and deliberately so. `git commit` pushes exactly the
bytes you staged: if `vault.yml` is plaintext when you stage it, plaintext is what lands on GitHub.

What the repository has instead is a hook that **refuses the commit**:

```bash
git config core.hooksPath .githooks     # once per clone; git does not share .git/hooks
```

`.githooks/pre-commit` inspects the *staged* content of any `vault*.yml` and blocks the commit
unless it begins with `$ANSIBLE_VAULT`.

A hook that silently ran `ansible-vault encrypt` for you was the other option and is a worse one:
Vault ciphertext is salted, so re-encrypting unchanged content produces a completely different file
— every commit would show the whole vault as modified and a real change would be invisible in
review. It would also need the vault password on every commit, which ends either in a prompt people
disable or a password file in the repository.

So encryption stays an explicit act, and the hook stops you forgetting it:

```bash
ansible-vault encrypt group_vars/production/vault.yml
git add group_vars/production/vault.yml
git commit
```

Verify by hand any time:

```bash
head -c 14 group_vars/production/vault.yml     # must print: $ANSIBLE_VAULT
```

If a plaintext vault ever *does* get committed, the secrets are in the history — rotate them.
Encrypting the file afterwards does not remove the earlier version from git.

To avoid typing the password every run, put it in a file **outside the repository** and point at it:

```bash
ansible-playbook playbooks/deploy.yml --vault-password-file ~/.robtic-vault
```

`~/.robtic-vault` must be `chmod 600` and must never live under this checkout. `.gitignore` blocks
the obvious in-repo names as a backstop, but the correct place is your home directory.

### How a secret reaches a container

```
vault.yml (encrypted, in git)
   └─ decrypted in memory during the play, loaded with no_log
        └─ referenced by vars.yml as {{ vault_* }}
             └─ rendered by templates/env.j2
                  └─ written to /home/robtic/robtic-system/.env on the server, mode 0600
                       └─ read by Compose as env_file: and --env-file
                            └─ present in the container's environment
```

Nothing plaintext is written on the control machine, and no temporary file is left anywhere. The
`template` task carries `no_log: true`, so a changed secret does not print its diff into the log.

## Environment file

`templates/env.j2` generates the single `.env` all four services share. Two things about it are easy
to get wrong and are worth knowing:

- **The bot token variable is `MainBotToken`** — mixed case. `libs/config/src/bot-definitions.ts`
  sets `tokenKey` to `"MainBotToken"` when `NODE_ENV=production` and `"TestBot"` otherwise, and
  `libs/core/src/client-manager.ts` reads `process.env[tokenKey]`. The template switches on
  `node_env` for this reason. A lowercase name produces a bot that cannot log in, with no error
  naming the variable.

- **`DASHBOARD_PUBLIC_API_URL` is read twice.** The Compose file interpolates it at parse time
  (`${DASHBOARD_PUBLIC_API_URL:-…}`), which reads Compose's own `--env-file`, *not* the `env_file:`
  declared on the service. The deploy role passes both. Omitting the CLI one does not error — it
  silently falls back to the default and the dashboard tells every browser the wrong API host.

The file is regenerated on every `deploy.yml` run. Editing it on the server is pointless; the next
deploy overwrites it. The previous version is kept as a timestamped backup beside it, which is what
the rollback restores.

## Deployment flow

```
preflight   Docker present, Compose plugin present, daemon reachable, Compose file exists,
            every required variable non-empty, URLs carry a scheme.       (read-only)
    ↓
env         Render .env → 0600, keeping a backup of the previous version.
    ↓
release     Capture running image IDs (the rollback point) → docker login if credentials are set
            → pull → compose up with recreate=auto.
    ↓
verify      Re-read container state from the daemon. Every service running; every service with a
            healthcheck healthy.
    ↓
prune       Remove dangling images.                                  (the only irreversible step)
```

The ordering is the safety property. A failure anywhere in the first four enters the `rescue:`
block **while the previous images are still on disk**, which is what makes rollback possible:
`:latest` cannot identify a version, so the immutable image IDs captured in `release` are re-tagged
and the stack is brought back up. Prune runs last precisely so it cannot destroy the thing rollback
needs.

## Idempotency

Running `deploy.yml` twice changes nothing the second time:

- `template` writes only when the rendered content differs.
- `docker_image_pull` reports changed only on a new digest.
- `docker_compose_v2` with `recreate: auto` recreates a container only when its image or config
  changed.
- `apt`, `file`, `user`, `systemd` in the bootstrap roles are all declarative.

`--check --diff` is safe to run against production and shows what a real run would do.

## Running from the self-hosted GitHub runner

The runner is *on* core.robtic.org, so it has no SSH route to itself:

```bash
ansible-playbook playbooks/deploy.yml -e ansible_connection=local
```

`.github/workflows/deploy-ansible.yml` does exactly this. It runs automatically on every push to
`main` and picks its own playbook: `deploy` (needs `ANSIBLE_VAULT_PASSWORD`, renders `.env` from the
vault) only when the push touched `group_vars/**` or `templates/env.j2`, `update` (images only, no
vault password) otherwise. It can also be run by hand (`workflow_dispatch`) with an explicit playbook
and an optional `--check --diff` dry run. It does not replace the existing per-service deploy
workflows — see "Migration" below.

## Migration from the existing pipeline

The four `deploy-*.yml` workflows still deploy exactly as they did; nothing in this directory
changes them. `deploy-ansible.yml` running an `update` alongside them on an ordinary push is a
harmless whole-stack re-sync, not a competing deploy path — see the workflow's own top comment for
why. The one thing that *did* start happening automatically once `deploy-ansible.yml` got a `push`
trigger is the `deploy` playbook, which touches configuration: that first push touching
`group_vars/**` still deserves a watched run, same as any other config change.

Recommended order for anyone still rehearsing:

1. Rehearse with `-i inventory/development.ini`.
2. Run `deploy-ansible.yml` manually (`workflow_dispatch`, `check: true`) and compare the result with
   a normal deploy before trusting the automatic push trigger with a real `group_vars/**` change.
3. Once it has been correct a few times, replace the `compose-pull-command` / `compose-up-command`
   inputs in the per-service workflows with a call to `update.yml`, retiring the redundant re-sync.

## What this does not do

- **No host firewall.** Docker publishes ports by writing iptables rules in the `DOCKER` chain,
  which is traversed before the filter chain `ufw` manages — a `ufw deny` on a published port reads
  as active and does nothing. Reach is restricted by the Compose port bindings (loopback for
  everything except the platform API) and by Nginx. See `roles/security/tasks/main.yml`.
- **No Terraform.** Left out as asked. `infra/` is laid out so `infra/terraform/` becomes a sibling
  of `docker/` and `ansible/` without anything moving.
- **No secret rotation.** `ansible-vault rekey` changes the vault password, not the secrets inside.
