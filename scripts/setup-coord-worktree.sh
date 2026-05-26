#!/usr/bin/env bash
# scripts/setup-coord-worktree.sh
#
# Set up a per-coder .coord/-managed worktree with race-immune git identity.
# Closes the recurring attribution-slip bug documented at
# [[feedback_per_worktree_git_identity]] by leveraging Git's
# `extensions.worktreeConfig` flag for per-worktree `[user]` blocks.
#
# Usage:
#   bash scripts/setup-coord-worktree.sh <N> <branch> <path> [<base-ref>]
#
# Example:
#   bash scripts/setup-coord-worktree.sh 6 feat/foo ../sheet-music-app-foo origin/master
#
# Effects (all idempotent — safe to re-run):
#   1. Enables `extensions.worktreeConfig=true` on the shared .git (if not already).
#   2. Sets `core.hooksPath=scripts/git-hooks` on the shared .git ONLY IF unset
#      (warns + leaves alone if a different value is present).
#   3. Creates the worktree at <path> on branch <branch> cut from <base-ref>
#      (no-ops if the worktree already exists at <path>).
#   4. Writes per-worktree git identity `coder-N@coord.local` via
#      `git config --worktree user.email/user.name` (race-immune; never
#      overwritten by sibling worktree's bare `git config`).
#   5. Writes `.coord/.worktree-coder` marker file (per-worktree, untracked)
#      holding `coder-N` — the pre-commit hook reads this as the source of
#      truth for the expected identity.
#   6. Verifies effective `git config user.email` echoes back the expected
#      `coder-N@coord.local`. Exits non-zero with a clear diagnostic if any
#      step fails.

set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: bash scripts/setup-coord-worktree.sh <N> <branch> <path> [<base-ref>]
  <N>        coder number (positive integer)
  <branch>   feature branch name to cut, e.g. feat/per-worktree-git-identity-enforcement
  <path>     worktree path (relative to current dir or absolute)
  <base-ref> optional base ref (default: origin/master)
USAGE
  exit 2
}

N="${1:-}"
BRANCH="${2:-}"
WT_PATH="${3:-}"
BASE_REF="${4:-origin/master}"

[[ -z "$N" || -z "$BRANCH" || -z "$WT_PATH" ]] && usage
if ! [[ "$N" =~ ^[0-9]+$ ]]; then
  echo "ERR: <N> must be a positive integer, got: '$N'" >&2
  exit 2
fi

EXPECTED_EMAIL="coder-${N}@coord.local"
EXPECTED_NAME="coder-${N}"

# Self-orient: cd to the git repo that contains this script. Prevents the
# script from misconfiguring an unrelated parent-directory git repo if the
# caller invokes us with a non-managed cwd (e.g. canonical's parent dir
# happens to also be a git repo).
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "$REPO_ROOT" ]]; then
  echo "ERR: setup-coord-worktree.sh must live inside a git working tree" >&2
  echo "  script dir: $SCRIPT_DIR" >&2
  echo "  parent of script dir is not a git repo" >&2
  exit 2
fi
cd "$REPO_ROOT"

echo "[setup-coord-worktree] N=${N} branch=${BRANCH} path=${WT_PATH} base=${BASE_REF}"
echo "[setup-coord-worktree] operating on repo: ${REPO_ROOT}"

# Step 1: enable extensions.worktreeConfig on shared .git (idempotent).
current_ext="$(git config --get extensions.worktreeConfig || true)"
if [[ "$current_ext" != "true" ]]; then
  git config extensions.worktreeConfig true
  echo "[setup-coord-worktree] enabled extensions.worktreeConfig on shared .git"
else
  echo "[setup-coord-worktree] extensions.worktreeConfig already true"
fi

# Step 2: set core.hooksPath ONLY IF unset (don't clobber a manual setting).
current_hooks_path="$(git config --get core.hooksPath || true)"
expected_hooks_path="scripts/git-hooks"
if [[ -z "$current_hooks_path" ]]; then
  git config core.hooksPath "$expected_hooks_path"
  echo "[setup-coord-worktree] set core.hooksPath=${expected_hooks_path} on shared .git"
elif [[ "$current_hooks_path" != "$expected_hooks_path" ]]; then
  echo "[setup-coord-worktree] WARN: core.hooksPath already set to '${current_hooks_path}'" >&2
  echo "[setup-coord-worktree] WARN: leaving alone — pre-commit hook may not activate" >&2
  echo "[setup-coord-worktree] WARN: to enable: git config core.hooksPath ${expected_hooks_path}" >&2
else
  echo "[setup-coord-worktree] core.hooksPath already ${expected_hooks_path}"
fi

# Step 3: create the worktree if missing.
if [[ -e "$WT_PATH/.git" ]]; then
  echo "[setup-coord-worktree] worktree '$WT_PATH' already exists — skipping git worktree add"
else
  git worktree add "$WT_PATH" -b "$BRANCH" "$BASE_REF"
  echo "[setup-coord-worktree] git worktree add → ${WT_PATH} on ${BRANCH} cut from ${BASE_REF}"
fi

# Step 4: set per-worktree identity via --worktree (race-immune).
( cd "$WT_PATH" && \
  git config --worktree user.email "$EXPECTED_EMAIL" && \
  git config --worktree user.name  "$EXPECTED_NAME" )
echo "[setup-coord-worktree] set --worktree user.email=${EXPECTED_EMAIL} / user.name=${EXPECTED_NAME}"

# Step 5: write the marker file (per-worktree, untracked).
( cd "$WT_PATH" && mkdir -p .coord && printf 'coder-%s\n' "$N" > .coord/.worktree-coder )
echo "[setup-coord-worktree] wrote .coord/.worktree-coder=coder-${N}"

# Step 6: verify effective identity.
actual_email="$( cd "$WT_PATH" && git config user.email )"
actual_name="$(  cd "$WT_PATH" && git config user.name  )"
if [[ "$actual_email" != "$EXPECTED_EMAIL" || "$actual_name" != "$EXPECTED_NAME" ]]; then
  echo "ERR: identity verification failed!" >&2
  echo "  expected: ${EXPECTED_NAME} <${EXPECTED_EMAIL}>" >&2
  echo "  actual:   ${actual_name} <${actual_email}>" >&2
  echo "  (per-worktree config dump):" >&2
  ( cd "$WT_PATH" && git config --worktree --list 2>&1 ) | sed 's/^/    /' >&2
  exit 1
fi

# Step 7: install bridge/ deps if the sub-package exists (idempotent — npm ci
# is a no-op when node_modules already matches the lockfile). Closes the
# recurring "bridge tests fail with `Cannot find module 'electron'`" gotcha
# on every fresh worktree — bridge/ has its OWN package.json + node_modules
# and root `npm ci --prefer-offline` doesn't reach into it. Surfaced by
# coder-5's monitor-popup-fullbottom-redesign SHIP-NOTICE 2026-05-26T~15:55Z
# (open follow-up #2) + coder-3 bridge-v1006 bundle-publish + auditor's
# bundle-size verification — all ate the same gotcha before this step landed.
# Documented at [[project_worktree_test_harness_node_modules]].
if [[ -f "$WT_PATH/bridge/package.json" ]]; then
  echo "[setup-coord-worktree] installing bridge/ deps (npm ci --prefer-offline)..."
  if ( cd "$WT_PATH/bridge" && npm ci --prefer-offline ); then
    echo "[setup-coord-worktree] ✓ bridge deps installed"
  else
    echo "[setup-coord-worktree] ERR: bridge npm ci failed (exit $?)" >&2
    echo "[setup-coord-worktree] recover: cd ${WT_PATH}/bridge && npm ci --prefer-offline" >&2
    exit 1
  fi
else
  echo "[setup-coord-worktree] no bridge/package.json — skipping bridge npm ci"
fi

cat <<DONE

[setup-coord-worktree] ✓ identity verified: ${actual_name} <${actual_email}>
[setup-coord-worktree] DONE.

Next:
  cd ${WT_PATH}
  npm install --prefer-offline  # if not already installed (bridge handled automatically above)
  # commits in this worktree are now identity-guarded by scripts/git-hooks/pre-commit
DONE
