# FINDINGS — `per-worktree-git-identity-enforcement`

**Lane:** `per-worktree-git-identity-enforcement` (coder-6, Tier 1, P3 BACKLOG cohort-hygiene)
**Cut SHA:** `3355bf194`
**Phase 0 timestamp:** 2026-05-26T08:35-08:52Z

## §1 — Live race evidence (captured at lane boot)

The leak documented in `[[feedback_per_worktree_git_identity]]` reproduced live during Phase 0 diagnosis, with coder-7 (`coord-status-script` lane) as the unwitting peer.

**Timeline:**

| ISO time | event |
|---|---|
| 2026-05-26T08:18Z | coder-7 claimed `scripts/` for `coord-status-script` (per `shared/claims.md` row) |
| ~08:18Z–08:30Z | coder-7 ran (presumably) bare `git config user.email coder-7@coord.local` in their worktree → shared `sheet-music-app/.git/config` `[user]` block set to `coder-7` |
| 2026-05-26T08:35Z | coder-6 (this lane) ran bare `git config user.email coder-6@coord.local` in `sheet-music-app-git-identity/` → shared `[user]` block overwritten to `coder-6` |
| ~08:35Z–08:40Z | coder-7 (or some sibling worktree's `npm install` / re-init) wrote shared `[user]` block again → reverted to `coder-7` |
| 2026-05-26T08:40Z | coder-6 Phase 0 probe ran `git config user.email` in coder-6's worktree and got back `coder-7@coord.local` — **any commit made at this point would have been attributed to coder-7, not coder-6.** |

**Cat-output proof (08:40Z, before the `--worktree` migration):**

```
$ cat sheet-music-app/.git/config | grep -A2 '\[user\]'
[user]
	email = coder-7@coord.local
	name = coder-7

$ cd sheet-music-app-git-identity/ && git config user.email
coder-7@coord.local

$ git config --get extensions.worktreeConfig
(empty — exit 1; flag was unset)
```

## §2 — Root mechanism

1. `git worktree add` creates a new working tree with a `.git` **file** (not directory) at the worktree root: `gitdir: <abs-path-to-shared>/.git/worktrees/<name>`.
2. Both the canonical `sheet-music-app/` and every per-coder worktree share the same `.git/config` file (via `commondir`).
3. By default, `git config <key> <value>` writes to the shared `.git/config`. There is NO per-worktree config layer unless `extensions.worktreeConfig=true` is enabled.
4. ANY worktree's bare `git config user.email <val>` therefore overwrites the shared `[user]` block for ALL worktrees. Last-writer-wins; no warning, no isolation.
5. Per-worktree config requires Git's optional extension `extensions.worktreeConfig=true` on the shared `.git`. With the extension on, `git config --worktree <key> <value>` writes to `.git/worktrees/<name>/config.worktree`, and `git config <key>` reads worktree-config first with fallback to shared.
6. The original `.git/config` `[user]` block is left intact when the extension is flipped — there is no destructive migration. New `--worktree` values are strictly additive.

**Why bare `git config` keeps happening:** the historical pain memory + every coder's prior session-handoff doc instructs `git config user.email coder-N@coord.local` without `--worktree`. Until the canonical instruction changes (Phase 3 of this lane), the leak keeps reproducing.

## §3 — Design decision: script + hook (option C from dispatch)

Per the dispatch's recommended path:

- **Setup script (`scripts/setup-coord-worktree.sh`)** — proactive: enables the extension (idempotent), creates the worktree, writes `--worktree` identity, writes a `.coord/.worktree-coder` marker.
- **Pre-commit hook (`scripts/git-hooks/pre-commit`)** — reactive defense: reads the marker, asserts `git config user.email` matches `coder-N@coord.local`. Bypasses cleanly when the marker is absent (canonical / non-coord worktrees).

**Hook delivery:** husky is NOT in `package.json` (`grep -l husky package.json` → empty); `core.hooksPath` was unset at lane start. Pure bash hooks under `scripts/git-hooks/` activated via a one-time `git config core.hooksPath scripts/git-hooks` (set by the setup script, idempotent; warned-not-overwritten if `core.hooksPath` is already set to something else).

**Source of truth for expected identity = `.coord/.worktree-coder`** (NOT the worktree path regex). Rationale:
- Path-regex (`sheet-music-app-(coder-N)-…`) is fragile (worktree paths are arbitrary slugs, not coder IDs).
- The marker file is a per-worktree, untracked, plain-text artifact the setup script writes. It travels with the worktree, never poisons siblings, and the hook bypasses cleanly when absent.

**Canonical worktree bypass:** the canonical worktrees (`sheet-music-app/`, `-mcp/`, `-r1-run/`, `-auditor-validation/`, `-bridge-v1005-accumulator/`) have no `.coord/.worktree-coder` marker (the setup script is invoked only for new per-coder worktrees). The hook's `if [[ ! -f "$MARKER" ]] then exit 0` opening short-circuits cleanly. No special-case list inside the hook required.

## §4 — Out-of-scope follow-ups (not this lane)

1. **Canonical worktree identity is currently UNSET in `--global`** — `git config --global user.email` returned empty during Phase 0 probe. Once coders migrate to `--worktree`, the canonical worktrees' commits will fall back to whatever stale shared `[user]` block was last written by a per-coder lane (currently `coder-7`). Recommended one-time Daniel-action post-ship: `git config --global user.email <daniel's-real-email> && git config --global user.name <daniel's-name>` — so canonical commits attribute to Daniel, not whichever coder lost the last race. **Will be flagged in SHIP-NOTICE follow-ups; out of this lane's scope (Daniel's identity is his decision).**
2. **Existing 13 live worktrees** still on the shared-config path until each coder either re-bases through a setup-script run OR manually re-sets via `--worktree`. The CC to coder-7 (08:52Z `inbox/coder-7.md`) gives him the 3-command recovery. Supervisor can issue the same CC to coder-1/-2/-3/-4/-5 if/when they go quiet between commits. **Not this lane's responsibility to migrate the inflight cohort.**
3. **Husky adoption** — not pursued here per dispatch hard-boundary "NO new deps". If husky is added in a future lane, this hook can be migrated to a husky-managed hook trivially (the hook body is delivery-agnostic).

## §5 — Phase 1+ implementation outline

- `scripts/setup-coord-worktree.sh` (~70 LOC bash) — args `<N> <branch> <path> [<base-ref>]`; idempotent enable-extension + worktree-add + `--worktree` identity + marker-write + verify.
- `scripts/git-hooks/pre-commit` (~50 LOC bash) — marker-presence check → bypass-or-assert.
- `scripts/__tests__/setup-coord-worktree.test.mjs` (~120 LOC vitest) — 9-case suite covering setup-script effects + hook accept/reject/bypass + idempotency + bad-arg handling. Uses isolated tempdir + ephemeral `git init` so the real `.git/` is never touched.
- `.coord/CODER.md` (§Worktree setup + §During work) — replace the bare `git worktree add` recipe with `bash scripts/setup-coord-worktree.sh <N> <branch> <path>`. Document the marker + hook as second line of defense.

## §6 — Gates plan

- `npx vitest run scripts/__tests__/setup-coord-worktree.test.mjs` — must PASS in isolation.
- `npx vitest run` (full suite) — zero regressions (new files don't touch any runtime code).
- `npx tsc --noEmit` — exit 0 (no TS files added; pure bash + .mjs test).
- `rm -rf .next && SKIP_ENV_VALIDATION=1 npm run build` — GREEN.
- Manual repro: dogfood via `bash scripts/setup-coord-worktree.sh 9 throwaway/test-branch /tmp/throwaway-wt` in a sacrificial subdir; attempt mismatched-identity commit → confirm hook rejects with clear diagnostic; remove marker → confirm bypass.

## §7 — Risk register

- **R1 — `core.hooksPath` collision.** If Daniel has manually set `core.hooksPath` elsewhere, the setup script should NOT overwrite. Mitigation: only set if currently unset; warn loudly otherwise.
- **R2 — Cross-platform bash compatibility.** Windows uses Git for Windows' bundled `/bin/bash`; Linux/macOS use system bash. `set -euo pipefail` + `[[ ]]` + `case` all work in both. No bash-4-only features used.
- **R3 — Worktree race on extension flip.** Daniel-ratified retroactively per supervisor `msg-extensions-worktreeconfig-ruling-go` 08:45Z. Flip is additive; canonical's `[user]` block untouched.
- **R4 — Hook bypass for unsigned commits.** `git commit --no-verify` bypasses the hook by Git design. That's a Git affordance, not a hole — but worth knowing. The hook is a guardrail, not a security boundary.
- **R5 — Self-tests touching the real `.git/`.** Tests MUST run against an isolated tempdir `git init`, not the canonical `.git/`. Test scaffold uses `mkdtempSync` + `node:child_process.spawnSync('git', ['init', ...], { cwd: tmp })` — argv-array form, no shell injection surface.
