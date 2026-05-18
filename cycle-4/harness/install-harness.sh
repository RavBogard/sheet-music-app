#!/usr/bin/env bash
# Cycle-5 C5B-META-002 — cowork harness bootstrap.
#
# Cowork sandboxes don't preserve node_modules across sessions, so every
# autonomous run that wants Playwright has been burning 3-5 minutes on a
# cold install. This script installs the harness's minimum runtime deps
# + the Chromium/Firefox/Webkit browsers in one shot.
#
# Run from the repo root (or a sibling worktree) BEFORE invoking any
# probe-batch.mjs / runAxe-driven cowork session.
#
# Usage:
#   bash cycle-4/harness/install-harness.sh
#
# Idempotent: re-runs are cheap; npm/playwright skip already-installed bits.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

echo "[harness-install] repo root: $REPO_ROOT"
echo "[harness-install] installing harness deps via npm"

# Deps the harness uses directly. axe-core is already a project dep; pin
# Playwright + @axe-core/playwright at the latest 1.x compatible versions.
# Using `npm i --save-dev` keeps them in devDependencies so prod bundles
# stay lean; --no-audit + --no-fund cut ~10s off the install on a cold
# cache.
npm i --save-dev --no-audit --no-fund \
    playwright \
    @axe-core/playwright \
    axe-core

echo "[harness-install] installing Playwright browsers (chromium, firefox, webkit) with system deps"
npx --yes playwright install chromium firefox webkit --with-deps

echo "[harness-install] done."
echo
echo "Next:"
echo "  node cycle-4/harness/scripts/probe-batch.mjs --base-url=https://centralreform.live ..."
echo "  Use runAxe from cycle-4/harness/lib/runAxe.mjs for axe-core sweeps."
