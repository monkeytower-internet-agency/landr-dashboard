#!/usr/bin/env bash
# landr-52ik.5 — regenerate src/types/database.gen.ts from the local Supabase
# stack (landr-api/supabase is the schema source of truth; see CLAUDE.md
# "Migrations are the source of truth for schema"). Mirrors landr-mobile's
# database.gen.ts pattern.
#
# Requires the local Supabase stack to be up (Trillian, local podman):
#   cd ~/Projects/landr/landr-api && supabase start
#
# The Supabase CLI shells out to `docker inspect` even for --db-url generation;
# on Trillian the stack runs under podman, so we point DOCKER_HOST at the
# podman user socket rather than a real Docker daemon — but only when that
# socket actually exists (landr-y3oj.2): GitHub Actions runners have a real
# Docker daemon at the default location, and forcing DOCKER_HOST at a
# nonexistent podman socket there would break the CLI.
#
# Set LANDR_API_REPO to override which landr-api checkout to generate from
# (useful when running from a worktree, where the default sibling-dir lookup
# doesn't apply).
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT_FILE="$REPO_ROOT/src/types/database.gen.ts"

# LANDR_API_REPO overrides the landr-api checkout to generate from. Default
# tries a sibling checkout first (the common case: landr-dashboard next to
# landr-api under ~/Projects/landr/), then falls back to the fixed Trillian
# path — needed when this script runs from a worktree checkout (e.g.
# .claude/worktrees/<branch>/), where "../landr-api" doesn't exist.
if [ -n "${LANDR_API_REPO:-}" ]; then
  API_REPO="$(cd "$LANDR_API_REPO" && pwd)"
elif [ -d "$REPO_ROOT/../landr-api/supabase" ]; then
  API_REPO="$(cd "$REPO_ROOT/../landr-api" && pwd)"
else
  API_REPO="$(cd "$HOME/Projects/landr/landr-api" && pwd)"
fi

HEADER='// AUTO-GENERATED — DO NOT EDIT BY HAND.
//
// Full Supabase schema (every table/view/enum/function shape) generated from
// landr-api/supabase (Postgres migrations are the source of truth — see
// CLAUDE.md "Migrations are the source of truth for schema"). This is the
// SINGLE source of truth for DB-shaped types in this repo; hand-written
// aliases (e.g. src/lib/products.ts `ProductKind`) should derive from the
// `Tables<>` / `TablesInsert<>` / `TablesUpdate<>` / `Enums<>` helpers below
// instead of duplicating literal unions, so schema drift gets caught by tsc
// instead of rotting silently. Mirrors the pattern already used in
// landr-mobile (src/types/database.gen.ts).
//
// Regenerate: npm run gen:types (see scripts/gen-types.sh)
//
// landr-52ik.5 adopted this; full adoption across the app rides landr-y3oj.3.'

PODMAN_SOCK="/run/user/$(id -u)/podman/podman.sock"
if [ -S "$PODMAN_SOCK" ]; then
  export DOCKER_HOST="unix://${PODMAN_SOCK}"
fi

echo "$HEADER" > "$OUT_FILE"
(
  cd "$API_REPO"
  supabase gen types typescript \
    --db-url postgresql://postgres:postgres@127.0.0.1:54322/postgres
) >> "$OUT_FILE"

echo "Wrote $OUT_FILE"
