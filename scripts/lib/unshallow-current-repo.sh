#!/usr/bin/env bash
# scripts/lib/unshallow-current-repo.sh
#
# Defines `unshallow_current_repo()` — idempotent shallow-clone defense
# for the git repo containing $PWD. Run BEFORE `git worktree add` or any
# git-history-dependent reasoning.
#
# Why: a shallow parent .git makes `git show --stat <sha>`,
# `git log -- <path>`, `merge-base --is-ancestor`, and `rev-parse <sha>^`
# silently LIE at the shallow boundary. Worktrees share the parent .git/,
# so the trap propagates to every coder fired off a shallow checkout.
# See feedback_auditor_shallow_clone_check_before_panic +
#     feedback_supervisor_verify_commit_diff_not_subject.
#
# Strategy (per dispatch):
#   1. Probe `git rev-parse --is-shallow-repository`. If false → return 0.
#   2. Try `git fetch --unshallow origin`.
#   3. If still shallow, `rm -f $(git-common-dir)/shallow` then
#      `git fetch origin --depth=2147483647`.
#   4. If still shallow, echo FATAL + return non-zero.
#
# Designed to be `source`-d (bash function) so the same code runs both
# inside setup-coord-worktree.sh AND inside the regression smoke test.

unshallow_current_repo() {
  local label="${1:-unshallow}"

  if ! command -v git >/dev/null 2>&1; then
    echo "[${label}] FATAL: git not on PATH" >&2
    return 2
  fi

  if [[ "$(git rev-parse --is-inside-work-tree 2>/dev/null)" != "true" ]]; then
    echo "[${label}] FATAL: not inside a git working tree (cwd=$(pwd))" >&2
    return 2
  fi

  if [[ "$(git rev-parse --is-shallow-repository 2>/dev/null)" != "true" ]]; then
    echo "[${label}] parent .git already non-shallow — no action"
    return 0
  fi

  echo "[${label}] parent .git is SHALLOW — running unshallow defense"
  local before_depth
  before_depth="$(git rev-list --count HEAD 2>/dev/null || echo unknown)"
  echo "[${label}]   before: is-shallow-repository=true, depth=${before_depth}"

  # Attempt 1: standard --unshallow against origin.
  if git fetch --unshallow origin 2>&1; then
    echo "[${label}]   attempt-1: 'git fetch --unshallow origin' returned 0"
  else
    echo "[${label}]   attempt-1: 'git fetch --unshallow origin' failed (continuing to fallback)" >&2
  fi

  # Attempt 2: rm .git/shallow + deep fetch.
  if [[ "$(git rev-parse --is-shallow-repository 2>/dev/null)" == "true" ]]; then
    local common_dir shallow_file
    common_dir="$(git rev-parse --git-common-dir)"
    shallow_file="${common_dir}/shallow"
    echo "[${label}]   still shallow — attempt-2: removing ${shallow_file} + deep fetch"
    rm -f -- "${shallow_file}"
    if git fetch origin --depth=2147483647 2>&1; then
      echo "[${label}]   attempt-2: deep fetch returned 0"
    else
      echo "[${label}]   attempt-2: deep fetch failed (continuing to final probe)" >&2
    fi
  fi

  # Final verdict.
  if [[ "$(git rev-parse --is-shallow-repository 2>/dev/null)" == "true" ]]; then
    echo "[${label}] FATAL: shallow-clone defense failed — is-shallow-repository still true after --unshallow + rm shallow + deep fetch." >&2
    echo "[${label}]   Manual recovery: git fetch origin --no-shallow-since=1970-01-01" >&2
    echo "[${label}]   Or re-clone without --depth from the remote." >&2
    return 1
  fi

  local after_depth
  after_depth="$(git rev-list --count HEAD 2>/dev/null || echo unknown)"
  echo "[${label}]   after:  is-shallow-repository=false, depth=${after_depth}"
  echo "[${label}] ✓ unshallow defense complete"
  return 0
}
