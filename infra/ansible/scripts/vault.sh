#!/usr/bin/env bash
# Vault wrapper: bun run vault:<status|init|encrypt|decrypt|edit|view|rekey> [env]. Default: production.
set -euo pipefail

ROOT="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --show-toplevel)"
GROUP_VARS="$ROOT/infra/ansible/group_vars"
VAULT_IMAGE="robtic/ansible-vault:local"
VAULT_DOCKERFILE="$ROOT/infra/docker/dockerfiles/ansible-vault.Dockerfile"

action="${1:-}"
env_name="${2:-production}"

vault="$GROUP_VARS/$env_name/vault.yml"
example="$GROUP_VARS/$env_name/vault.yml.example"

usage() {
    cat >&2 <<'EOF'
usage: bun run vault:<action> [environment]

  actions      init | encrypt | decrypt | edit | view | rekey | status
  environment  production (default) | development

  bun run vault:init production
  bun run vault:encrypt production
EOF
}

die() { echo "error: $*" >&2; exit 1; }

is_encrypted() { [ -f "$1" ] && head -c 14 "$1" 2>/dev/null | grep -q '^\$ANSIBLE_VAULT'; }

# `ansible-vault --version` exercises the same startup path a real command would (ansible-core's
# blocking-io check runs unconditionally at import time), so this actually detects the Windows/Git
# Bash "OSError: [WinError 1] Incorrect function" failure rather than just checking the binary exists.
native_vault_works() {
    command -v ansible-vault >/dev/null 2>&1 && ansible-vault --version >/dev/null 2>&1
}

ensure_vault_image() {
    docker image inspect "$VAULT_IMAGE" >/dev/null 2>&1 && return 0
    echo "Building $VAULT_IMAGE (first run only)..." >&2
    MSYS_NO_PATHCONV=1 docker build -q -t "$VAULT_IMAGE" -f "$VAULT_DOCKERFILE" "$ROOT" >/dev/null
}

require_vault_cli() {
    native_vault_works && return 0
    command -v docker >/dev/null 2>&1 || die \
        "ansible-vault does not work natively here, and Docker is not installed either. Install ansible-core (python3 -m pip install --user 'ansible-core>=2.15') or Docker Desktop."
}

# Runs `ansible-vault <args...>`, natively if that actually works, otherwise inside VAULT_IMAGE with
# the repo bind-mounted at /work — the fallback every other action in this script relies on. Absolute
# paths under $ROOT are rewritten relative to it, since that's what they resolve to inside the
# container; anything else (an action name, a flag) passes through unchanged.
run_ansible_vault() {
    if native_vault_works; then
        ansible-vault "$@"
        return
    fi

    command -v docker >/dev/null 2>&1 || die \
        "ansible-vault does not work natively here, and Docker is not installed either. Install ansible-core (python3 -m pip install --user 'ansible-core>=2.15') or Docker Desktop."

    ensure_vault_image

    local args=() arg
    for arg in "$@"; do
        args+=("${arg#"$ROOT"/}")
    done

    # MSYS_NO_PATHCONV: without it, Git Bash on Windows rewrites the container-side paths below
    # (/work) into host paths before docker.exe ever sees them — e.g. `-w /work` arrived as
    # `-w 'C:/Program Files/Git/work'`, which the daemon rightly rejects as not absolute.
    MSYS_NO_PATHCONV=1 docker run --rm -it -v "$ROOT:/work" -w /work "$VAULT_IMAGE" "${args[@]}"
}

require_env_dir() {
    [ -d "$GROUP_VARS/$env_name" ] || die "no such environment: $env_name"
}

require_vault_file() {
    [ -f "$vault" ] || die "no vault at ${vault#"$ROOT"/} — run: bun run vault:init $env_name"
}

status_line() {
    local name="$1" file="$GROUP_VARS/$1/vault.yml"

    if [ ! -f "$file" ]; then
        printf '  %-12s %s\n' "$name" "no vault"
    elif is_encrypted "$file"; then
        printf '  %-12s %s\n' "$name" "encrypted ✓"
    else
        printf '  %-12s %s\n' "$name" "PLAINTEXT — run: bun run vault:encrypt $name"
    fi
}

case "$action" in
    status)
        echo "Ansible vaults:"
        for name in production development; do
            [ -d "$GROUP_VARS/$name" ] && status_line "$name"
        done
        echo ""
        echo "The encrypted vault is meant to be committed; the vault password is not."
        ;;

    init)
        require_env_dir
        [ -f "$vault" ] && die "${vault#"$ROOT"/} already exists"
        [ -f "$example" ] || die "no template at ${example#"$ROOT"/}"

        cp "$example" "$vault"
        chmod 600 "$vault"

        cat <<EOF
Created ${vault#"$ROOT"/}.

  1. \$EDITOR ${vault#"$ROOT"/}
  2. bun run vault:encrypt $env_name

It is PLAINTEXT until step 2; the pre-commit hook will refuse to commit it.
EOF
        ;;

    encrypt)
        require_vault_cli
        require_vault_file

        if is_encrypted "$vault"; then
            echo "${vault#"$ROOT"/} is already encrypted."
            exit 0
        fi

        run_ansible_vault encrypt "$vault"
        chmod 600 "$vault"
        echo "Encrypted. Safe to commit: git add ${vault#"$ROOT"/}"
        ;;

    decrypt)
        require_vault_cli
        require_vault_file
        is_encrypted "$vault" || die "${vault#"$ROOT"/} is already plaintext"

        # edit and view cover almost every real need and leave nothing plaintext on disk.
        cat >&2 <<EOF
This writes secrets to disk in plaintext.

  Change a value:  bun run vault:edit $env_name
  Read a value:    bun run vault:view $env_name
EOF
        read -r -p "Type 'decrypt' to confirm: " confirm
        [ "$confirm" = "decrypt" ] || die "aborted"

        run_ansible_vault decrypt "$vault"
        chmod 600 "$vault"
        echo "Decrypted. Re-encrypt before committing: bun run vault:encrypt $env_name"
        ;;

    edit)
        require_vault_cli
        require_vault_file
        is_encrypted "$vault" || die "${vault#"$ROOT"/} is not encrypted — edit it directly"

        run_ansible_vault edit "$vault"
        ;;

    view)
        require_vault_cli
        require_vault_file
        is_encrypted "$vault" || die "${vault#"$ROOT"/} is not encrypted — just read it"

        run_ansible_vault view "$vault"
        ;;

    rekey)
        require_vault_cli
        require_vault_file
        is_encrypted "$vault" || die "${vault#"$ROOT"/} is not encrypted yet"

        # Changes the password, not the secrets inside.
        run_ansible_vault rekey "$vault"
        echo "Password changed. The secrets inside are unchanged."
        ;;

    ""|-h|--help|help)
        usage
        exit "$([ -z "$action" ] && echo 2 || echo 0)"
        ;;

    *)
        echo "error: unknown action: $action" >&2
        usage
        exit 2
        ;;
esac
