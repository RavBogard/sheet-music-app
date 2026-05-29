#!/usr/bin/env bash
# scripts/setup-cowork-worktree.sh
#
# Set up a HARNESS-WARM cowork worktree: everything setup-coord-worktree.sh
# does (shallow-clone defense, race-immune per-worktree git identity, bridge
# deps) PLUS the Playwright/WebKit warming a cowork instance needs to actually
# RUN the iPad/offline/stickiness probe matrix — instead of grading every
# cell NOT-RUN.
#
# Background: cycle-12 run-1 graded the entire offline+stickiness matrix
# NOT-RUN because the cowork sandbox had no node_modules / no Playwright / no
# WebKit ([[feedback_cowork_harness_warm_worktree]]). run-2 was warmed by a
# manual ritual (worktree add → npm ci → playwright install webkit → cowork),
# but the sandbox lacked WebKit system libs and silently fell back to
# Chromium-with-iPad-UA (FU-c12-9), producing engine-INCORRECT iPad results.
# This script productizes that ritual and makes real-WebKit availability
# VERIFIABLE + FAIL-LOUD — never a silent substitution.
#
# Relationship to other scripts:
#   - setup-coord-worktree.sh : worktree + identity + shallow defense (REUSED).
#   - cycle-4/harness/install-harness.sh : the OLD warm ritual; uses
#       `playwright install --with-deps` which is silent on the FU-c12-9
#       missing-syslib case. This script SUPERSEDES it for cowork worktrees.
#
# Usage:
#   bash scripts/setup-cowork-worktree.sh <N> <branch> <path> [<base-ref>] [<browsers>]
#
#   <N>        coder number (positive integer)
#   <branch>   feature branch to cut, e.g. feat/c13c-webkit-cowork
#   <path>     worktree path (relative or absolute)
#   <base-ref> optional base ref (default: origin/master)
#   <browsers> optional space/comma list (default: "webkit"). The iPad matrix
#              only needs webkit; pass "webkit chromium" for a both-engine run.
#
# Example (cowork iPad/WebKit run):
#   bash scripts/setup-cowork-worktree.sh 4 feat/c13c-webkit ../sheet-music-app-c13c origin/master webkit
#
# On success: prints `HARNESS SELF-CHECK: PASS` and exit 0 — the worktree is
# genuinely warm. On a no-WebKit host it FAILS LOUD (exit 4) naming the
# missing libs + the Docker fallback, so cowork is never fired blind.

set -euo pipefail

usage() {
  cat >&2 <<'USAGE'
Usage: bash scripts/setup-cowork-worktree.sh <N> <branch> <path> [<base-ref>] [<browsers>]
  <N>        coder number (positive integer)
  <branch>   feature branch name to cut, e.g. feat/c13c-webkit-cowork
  <path>     worktree path (relative to current dir or absolute)
  <base-ref> optional base ref (default: origin/master)
  <browsers> optional browser list (default: "webkit"); e.g. "webkit chromium"
USAGE
  exit 2
}

N="${1:-}"
BRANCH="${2:-}"
WT_PATH="${3:-}"
BASE_REF="${4:-origin/master}"
BROWSERS_RAW="${5:-webkit}"

[[ -z "$N" || -z "$BRANCH" || -z "$WT_PATH" ]] && usage
if ! [[ "$N" =~ ^[0-9]+$ ]]; then
  echo "ERR: <N> must be a positive integer, got: '$N'" >&2
  exit 2
fi

# Normalize the browser list: accept comma or space separated, dedup whitespace.
BROWSERS="$(echo "$BROWSERS_RAW" | tr ',' ' ' | xargs)"
[[ -z "$BROWSERS" ]] && BROWSERS="webkit"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SETUP_COORD="${COWORK_SETUP_COORD_CMD:-$SCRIPT_DIR/setup-coord-worktree.sh}"

# Overridable heavy commands (defaults are the real thing; the regression test
# stubs these to avoid a real install).
NPM_CI_CMD="${COWORK_NPM_CI_CMD:-npm ci --prefer-offline}"
PLAYWRIGHT_INSTALL_CMD="${COWORK_PLAYWRIGHT_INSTALL_CMD:-npx playwright install}"
PLAYWRIGHT_INSTALL_DEPS_CMD="${COWORK_PLAYWRIGHT_INSTALL_DEPS_CMD:-npx playwright install-deps webkit}"

echo "[setup-cowork] N=${N} branch=${BRANCH} path=${WT_PATH} base=${BASE_REF} browsers=[${BROWSERS}]"

# ---------------------------------------------------------------------------
# Step 1: delegate to setup-coord-worktree.sh for worktree + identity +
# shallow defense + bridge deps. A clean exit proves the parent is non-shallow
# (its Step-0 defense) and the worktree exists with coder-N identity.
# ---------------------------------------------------------------------------
echo "[setup-cowork] delegating worktree+identity+shallow-defense to setup-coord-worktree.sh"
bash "$SETUP_COORD" "$N" "$BRANCH" "$WT_PATH" "$BASE_REF"

if [[ ! -d "$WT_PATH" ]]; then
  echo "[setup-cowork] FATAL: worktree '$WT_PATH' missing after setup-coord-worktree.sh" >&2
  exit 1
fi

# Everything below runs inside the worktree.
cd "$WT_PATH"
WT_ABS="$(pwd)"
echo "[setup-cowork] warming harness in: ${WT_ABS}"

# ---------------------------------------------------------------------------
# Step 2: install root node_modules (committed deps incl @playwright/test).
# This is what makes `npm run stress` → e2e/*.spec.ts runnable.
# ---------------------------------------------------------------------------
echo "[setup-cowork] installing root deps: ${NPM_CI_CMD}"
if ! eval "${NPM_CI_CMD}"; then
  echo "[setup-cowork] FATAL: root dependency install failed" >&2
  echo "[setup-cowork]   recover: cd ${WT_ABS} && ${NPM_CI_CMD}" >&2
  exit 1
fi
if [[ ! -d node_modules ]]; then
  echo "[setup-cowork] FATAL: node_modules absent after install — worktree not warm" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 3: install the Playwright browser binaries the matrix needs.
# ---------------------------------------------------------------------------
echo "[setup-cowork] installing Playwright browsers: ${BROWSERS}"
# shellcheck disable=SC2086  # word-splitting BROWSERS is intentional
if ! eval "${PLAYWRIGHT_INSTALL_CMD} ${BROWSERS}"; then
  echo "[setup-cowork] FATAL: 'playwright install ${BROWSERS}' failed" >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Step 4: best-effort system-deps install (FU-c12-9). Needs sudo/apt — it WILL
# fail in a bare no-sudo cowork sandbox. That failure is informational only;
# the authoritative check is the real launch probe in Step 5. We never abort
# on the install-deps exit code alone (it can fail benignly or succeed while
# libs are still missing) — only on the ground-truth launch.
# ---------------------------------------------------------------------------
if echo " ${BROWSERS} " | grep -q ' webkit '; then
  echo "[setup-cowork] attempting WebKit system-deps install (informational; needs sudo/apt): ${PLAYWRIGHT_INSTALL_DEPS_CMD}"
  if eval "${PLAYWRIGHT_INSTALL_DEPS_CMD}"; then
    echo "[setup-cowork]   install-deps returned 0"
  else
    echo "[setup-cowork]   install-deps failed (expected in no-sudo sandboxes) — deferring to launch probe" >&2
  fi
fi

# ---------------------------------------------------------------------------
# Step 5 + 6: source the shared lib → ground-truth WebKit verify (FAIL LOUD)
# + harness self-check (PASS/FAIL).
# ---------------------------------------------------------------------------
# shellcheck source=lib/cowork-warm-worktree.sh
. "$SCRIPT_DIR/lib/cowork-warm-worktree.sh"

if echo " ${BROWSERS} " | grep -q ' webkit '; then
  if ! cowork_verify_webkit "setup-cowork"; then
    echo "[setup-cowork] aborting: WebKit is not usable on this host (see above)." >&2
    echo "[setup-cowork] worktree exists + deps installed, but it is NOT WebKit-warm — do not fire the iPad matrix here." >&2
    exit 4
  fi
fi

if ! cowork_harness_self_check "setup-cowork"; then
  echo "[setup-cowork] FATAL: harness self-check failed — runner not wired in this worktree." >&2
  exit 5
fi

cat <<DONE

[setup-cowork] ✓ harness is WARM at ${WT_ABS}
[setup-cowork] DONE.

Next:
  cd ${WT_ABS}
  npm run stress -- --dry-run            # confirm the plan
  npm run stress -- --projects=ipad-webkit,ipad-webkit-landscape
  # then fire the cowork instance against this warm worktree
DONE
