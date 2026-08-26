#!/usr/bin/env bash
#
# Keeps docs/bot/placeholders.md honest about what the plugin actually exposes.
#
# The statistics placeholders are generated from statistics.yml rather than written in code, so the
# documented ids are a hand-maintained copy of a config file — exactly the kind of list that rots
# silently. A player following the docs and getting an unresolved placeholder has no way to tell
# whether the id is wrong or the feature is broken.
#
# Run with `bash scripts/placeholder-docs-check.sh`.
set -u

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
YML="$ROOT/apps/minecraft-plugin/src/main/resources/statistics.yml"
DOC="$ROOT/docs/bot/placeholders.md"
FAIL=0

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

# Ids named in the docs' "Statistic ids shipped by default" section. Stops before the category list,
# which is a different vocabulary and would otherwise be compared against statistic ids.
sed -n '/### Statistic ids shipped by default/,/^Category ids for/p' "$DOC" \
  | grep -v '^Category ids for' \
  | grep -oP '`\K[a-z_]+(?=`)' | sort -u > "$work/doc-stats"

# Ids declared under `statistics:` — the four-space keys inside that block only, so the categories
# above it and the vanilla recording map below it are both excluded.
awk '/^  statistics:/{f=1;next} /^  # ─── Vanilla/{f=0} f' "$YML" \
  | grep -oP '^    \K[a-z_]+(?=:)' | sort -u > "$work/yml-stats"

# Category ids, from the same file and from the docs' own list.
awk '/^  categories:/{f=1;next} /^  # ─── Statistics/{f=0} f' "$YML" \
  | grep -oP '^    \K[a-z_]+(?=:)' | sort -u > "$work/yml-cats"

# `stat_total_` is dropped: it appears in that sentence as the placeholder the category ids are for,
# not as a category itself.
sed -n '/^Category ids for/,/^$/p' "$DOC" | grep -oP '`\K[a-z_]+(?=`)' \
  | grep -vx 'stat_total_' | sort -u > "$work/doc-cats"

report() {
    local label="$1" left="$2" right="$3" message="$4"
    local diff
    diff="$(comm -23 "$left" "$right")"

    if [ -n "$diff" ]; then
        echo "FAIL  $message"
        echo "$diff" | sed 's/^/          /'
        FAIL=1
    else
        echo "PASS  $label"
    fi
}

report "every documented statistic id exists ($(wc -l < "$work/doc-stats" | tr -d ' ') checked)" \
    "$work/doc-stats" "$work/yml-stats" \
    "documented in placeholders.md but not declared in statistics.yml:"

report "every declared statistic is documented" \
    "$work/yml-stats" "$work/doc-stats" \
    "declared in statistics.yml but missing from placeholders.md:"

report "every documented category exists ($(wc -l < "$work/doc-cats" | tr -d ' ') checked)" \
    "$work/doc-cats" "$work/yml-cats" \
    "documented category not declared in statistics.yml:"

report "every declared category is documented" \
    "$work/yml-cats" "$work/doc-cats" \
    "declared category missing from placeholders.md:"

# Job ids, which the docs name explicitly in the per-job placeholder section.
awk '/^jobs:/{f=1;next} /^[a-z]/{f=0} f' "$ROOT/apps/minecraft-plugin/src/main/resources/jobs.yml" \
  | grep -oP '^  \K[a-z_]+(?=:)' | sort -u > "$work/yml-jobs"

sed -n '/Replace `<id>` with a job id/,/^$/p' "$DOC" | grep -oP '`\K[a-z_]+(?=`)' \
  | grep -v '^id$' | sort -u > "$work/doc-jobs"

report "every documented job id exists ($(wc -l < "$work/doc-jobs" | tr -d ' ') checked)" \
    "$work/doc-jobs" "$work/yml-jobs" \
    "documented job id not declared in jobs.yml:"

echo
if [ "$FAIL" -eq 0 ]; then
    echo "placeholders.md matches the plugin's configuration."
else
    echo "placeholders.md is out of date."
fi

exit "$FAIL"
