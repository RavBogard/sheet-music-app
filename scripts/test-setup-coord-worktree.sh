#!/usr/bin/env bash
# scripts/test-setup-coord-worktree.sh
#
# Regression smoke test for the shallow-clone defense added to
# setup-coord-worktree.sh + scripts/lib/unshallow-current-repo.sh.
#
# Three scenarios:
#   T1: lib function on a shallow tmp clone → must end non-shallow, exit 0.
#   T2: full setup-coord-worktree.sh on a shallow tmp clone → must produce
#       a worktree where is-shallow-repository == false. (Acceptance #2.)
#   T3: lib function on a non-shallow tmp clone → must no-op + exit 0.
#
# Exits 0 on all-PASS, non-zero on any FAIL. Echoes PASS/FAIL lines so
# the result is grep-able. Designed to be run from the repo root.
#
# Usage:
#   bash scripts/test-setup-coord-worktree.sh

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && git rev-parse --show-toplevel)"

LIB="$SCRIPT_DIR/lib/unshallow-current-repo.sh"
HELPER="$SCRIPT_DIR/setup-coord-worktree.sh"

[[ -f "$LIB" ]]    || { echo "FAIL: missing $LIB" >&2; exit 2; }
[[ -f "$HELPER" ]] || { echo "FAIL: missing $HELPER" >&2; exit 2; }

TMPDIR="$(mktemp -d -t coord-shallow-test-XXXXXX)"
echo "[test] tmpdir: $TMPDIR"
cleanup() {
  # Best-effort tear-down; ignore errors so a half-finished test still cleans up.
  if [[ -n "${TMPDIR:-}" && -d "$TMPDIR" ]]; then
    # Drop any worktree refs pointing into TMPDIR before rm -rf, so the parent
    # repo doesn't carry stale prunable entries.
    if [[ -d "$TMPDIR/repo/.git" ]]; then
      ( cd "$TMPDIR/repo" 2>/dev/null && git worktree list --porcelain 2>/dev/null | awk '/^worktree /{print $2}' | while read -r w; do
          [[ "$w" != "$TMPDIR/repo" ]] && git worktree remove --force "$w" 2>/dev/null || true
        done ) || true
    fi
    rm -rf -- "$TMPDIR" 2>/dev/null || true
  fi
}
trap cleanup EXIT

PASS=0
FAIL=0
report() {
  local name="$1" status="$2"
  if [[ "$status" == "PASS" ]]; then
    echo "[test] PASS: $name"
    PASS=$((PASS+1))
  else
    echo "[test] FAIL: $name" >&2
    FAIL=$((FAIL+1))
  fi
}

# ---- Build a bare "remote" once, reused by all scenarios. ----
echo "[test] cloning bare origin from $REPO_ROOT"
git clone --quiet --bare "$REPO_ROOT" "$TMPDIR/origin.git" || {
  echo "FAIL: could not bare-clone canonical repo for test fixture" >&2
  exit 2
}

# Scenario fixture builder: shallow clone (depth=1) from the bare origin.
# `file://` URL forces non-local transport semantics — `--depth` is silently
# ignored on local-filesystem clones.
ORIGIN_URL="file://$TMPDIR/origin.git"
new_shallow_clone() {
  local target="$1"
  rm -rf -- "$target"
  git clone --quiet --depth=1 "$ORIGIN_URL" "$target"
  # Sanity: must actually be shallow before we hand it off to the test.
  ( cd "$target" && [[ "$(git rev-parse --is-shallow-repository)" == "true" ]] ) \
    || { echo "FAIL: fixture clone is not shallow (host git doesn't honor --depth=1?)" >&2; return 1; }
}

new_full_clone() {
  local target="$1"
  rm -rf -- "$target"
  git clone --quiet "$ORIGIN_URL" "$target"
  ( cd "$target" && [[ "$(git rev-parse --is-shallow-repository)" == "false" ]] ) \
    || { echo "FAIL: full clone reports shallow" >&2; return 1; }
}

# ============================================================
# T1: lib function on a shallow clone → must end non-shallow.
# ============================================================
echo
echo "[test] T1: lib function on artificially-shallow tmp clone"
T1_REPO="$TMPDIR/t1"
if ! new_shallow_clone "$T1_REPO"; then
  report "T1: shallow fixture build" "FAIL"
else
  (
    set +e
    cd "$T1_REPO"
    # shellcheck source=lib/unshallow-current-repo.sh
    . "$LIB"
    unshallow_current_repo "T1"
    rc=$?
    after="$(git rev-parse --is-shallow-repository)"
    if [[ $rc -eq 0 && "$after" == "false" ]]; then
      exit 0
    else
      echo "[test] T1 detail: rc=$rc, is-shallow-repository=$after" >&2
      exit 1
    fi
  )
  if [[ $? -eq 0 ]]; then report "T1: lib function deepens shallow clone" "PASS"
  else report "T1: lib function deepens shallow clone" "FAIL"
  fi
fi

# ============================================================
# T2: full setup-coord-worktree.sh on shallow tmp clone → worktree non-shallow.
# ============================================================
echo
echo "[test] T2: full setup-coord-worktree.sh on artificially-shallow tmp clone"
T2_REPO="$TMPDIR/t2"
if ! new_shallow_clone "$T2_REPO"; then
  report "T2: shallow fixture build" "FAIL"
else
  # Copy the helper + lib into the test clone so the script's self-orient
  # lands in T2_REPO rather than the canonical.
  mkdir -p "$T2_REPO/scripts/lib"
  cp "$HELPER" "$T2_REPO/scripts/setup-coord-worktree.sh"
  cp "$LIB" "$T2_REPO/scripts/lib/unshallow-current-repo.sh"

  WT_PATH_T2="$TMPDIR/t2-worktree"
  # Use a branch name unlikely to collide with anything real.
  (
    set +e
    cd "$T2_REPO"
    bash scripts/setup-coord-worktree.sh 99 "feat/test-shallow-defense-$$" "$WT_PATH_T2" origin/HEAD >"$TMPDIR/t2.log" 2>&1
    rc=$?
    if [[ $rc -ne 0 ]]; then
      echo "[test] T2 helper exit=$rc, log tail:" >&2
      tail -40 "$TMPDIR/t2.log" >&2
      exit 1
    fi
    # AC #2: the resulting worktree must report non-shallow.
    after="$(git -C "$WT_PATH_T2" rev-parse --is-shallow-repository 2>/dev/null)"
    if [[ "$after" == "false" ]]; then
      exit 0
    else
      echo "[test] T2 detail: worktree is-shallow-repository=$after (expected false)" >&2
      exit 1
    fi
  )
  if [[ $? -eq 0 ]]; then report "T2: full helper produces non-shallow worktree from shallow parent" "PASS"
  else report "T2: full helper produces non-shallow worktree from shallow parent" "FAIL"
  fi
fi

# ============================================================
# T3: lib function on a full clone → no-op, exit 0.
# ============================================================
echo
echo "[test] T3: lib function on non-shallow tmp clone (no-op case)"
T3_REPO="$TMPDIR/t3"
if ! new_full_clone "$T3_REPO"; then
  report "T3: full fixture build" "FAIL"
else
  (
    set +e
    cd "$T3_REPO"
    # shellcheck source=lib/unshallow-current-repo.sh
    . "$LIB"
    unshallow_current_repo "T3"
    rc=$?
    after="$(git rev-parse --is-shallow-repository)"
    if [[ $rc -eq 0 && "$after" == "false" ]]; then
      exit 0
    else
      echo "[test] T3 detail: rc=$rc, is-shallow-repository=$after" >&2
      exit 1
    fi
  )
  if [[ $? -eq 0 ]]; then report "T3: lib function is no-op on already-deep clone" "PASS"
  else report "T3: lib function is no-op on already-deep clone" "FAIL"
  fi
fi

echo
echo "[test] summary: PASS=$PASS  FAIL=$FAIL"
if [[ $FAIL -gt 0 ]]; then
  echo "[test] OVERALL: FAIL"
  exit 1
fi
echo "[test] OVERALL: PASS"
exit 0
