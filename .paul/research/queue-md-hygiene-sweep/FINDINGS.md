# QUEUE.md stale-row hygiene sweep — FINDINGS

**Sweep date:** 2026-05-26
**Sweep author:** coder-6
**Lane:** `queue-md-stale-row-hygiene-sweep` (Tier-0 ops; P2 NORMAL)
**Dispatch:** supervisor `msg-queue-md-stale-row-hygiene-sweep-001` 2026-05-26T~15:00Z (triggered by my own duplicate-dispatch BLOCKER on `bridge-mcp-housekeeping-tools` + 2 sibling-lane analogs).
**Base:** `origin/master @ e091ea4f96` (coder-3 v10.0.6 bundle bump).
**Worktree:** `sheet-music-app-queue-md-hygiene/`, branch `feat/queue-md-stale-row-hygiene-sweep`.

## Hygiene sweep 2026-05-26 — result

- **Rows reviewed:** 23 (per `CANDIDATES.md`)
- **Rows POPPED with SHA receipts:** 20
- **Rows STILL OPEN (real backlog candidates for supervisor):** 3
  - `6-back-4` bridge-cold-boot-integration-test
  - Backlog `Bridge-side Electron Sentry`
  - `W3-1` library-index-normalizedname-backfill (conservative STILL-OPEN; likely subsumed by W4-1 apply + algorithm pin; supervisor to reconcile semantic mapping)

## Verification methodology

For each candidate, queried in priority order until match:

1. `agents.md` — authoritative `✅ ACCEPTED+TORN` rows. (File is 601KB so grep-only; not full-read.)
2. `git log --all --oneline` — shallow-clone-aware history per `[[feedback_auditor_shallow_clone_check_before_panic]]`. `git log origin/master --oneline` alone misses commits below the shallow boundary; `--all` reveals fetched refs.
3. `.coord/shared/claims.md` — `released (was coder-N <lane> @ <sha>, LANDED)` markers as the tertiary cross-ref.

Conservative rule applied (per scope §Out-of-scope): rows that could not be confirmed shipped via any of the 3 sources stayed STILL OPEN; no speculative POPPED-marks.

Windows shell gotcha confirmed in flight: `git cat-file -e <rev>:<path>` mangles colon-paths on this box; used `git ls-tree origin/master -- <path>` and `git log --all --oneline | grep -i <keyword>` instead per `[[feedback_git_ref_path_check_windows]]`.

## Confirmed-shipped rows (POPPED)

| # | row-id | lane | ship SHA | source of truth |
|---|--------|------|----------|-----------------|
| 1 | W5-1 | storage-backup-fix-b | `29ccaec5c9` | git log `feat(storage-backup): Fix B — pre-flight breadcrumb + per-row time-budget + verbose Drive errors[] capture + startedButNotFinished alarm` + claims rows 201-208 |
| 2 | 6-back-1 | bridge-dashboard-update-ui | `b0666cabaf` | git log `feat(bridge-ui): surface "Update available" banner in dashboard window` + claims rows 346-348 |
| 3 | 6-back-2 | bridge-periodic-update-check | `bd86c83ec7` | git log `feat(bridge): periodic update check + extracted shouldInstallNow policy helper` + claims rows 340-342 |
| 4 | 6-back-3 | bridge-mcp-housekeeping-tools | `2dc4506cfb` | git log `feat(bridge-mcp): bridge_clear_acks / bridge_clear_pending_commands / bridge_get_log — admin-only housekeeping` + `git ls-tree origin/master src/lib/mcp/tools/bridge-housekeeping.ts` blob `805a143b...` + claims rows 209-211 + tools registered in `src/lib/mcp/tools/index.ts:83/2360/2371/2382`. **This is the row whose stale-state caused my duplicate-dispatch BLOCKER** and triggered this sweep. |
| 5 | 6-back-5 | bridge-tray-icon-health-color | `0bf6891193` | git log `feat(bridge): tray icon health color (Lane #9 / F-A3) — v10.0.6 accumulator candidate` + claims rows 343-345 |
| 6 | 6-back-6 | bridge-getLocalIp-virtual-adapter-test | `7ead263d52` | git log `test(bridge): reject virtual adapters in getLocalIp; extract to testable module` + claims rows 212-216 |
| 7 | 6-back-7 | AC-5 DatabaseClosedError teardown race | `398d5946aa` | git log `test(sync): fix AC-5 DatabaseClosedError teardown race` + claims row 217 |
| 8 | 6-back-8 | init-pagehide listener-race | `5b65eb7621` | git log `test(sync/init-pagehide): defeat parallel-load flake via static imports + explicit reset` + claims rows 218-219 + 226-227 |
| 9 | 6-back-9 | recomputeIndexNameFields-normalizedName-pin | `6325cc7870` | git log `feat(library): pin recomputeIndexNameFields.normalizedName to strip media extensions; backfill 241 historical rows` + claims rows 220-225 + 228-232 |
| 10 | parking-1 / parking-dup-1 | bridge-v1005-publish | `e091ea4f96` (SUPERSEDED) | Subsumed by v10.0.6 bundle ship — supervisor explicit special-case in dispatch §Source-of-truth ("`bridge-v1005-publish` row → mark SHIPPED + cite v10.0.6 release SHA `e091ea4f96` — subsumed scope; v1005 never published independently because v1006 bundle landed first"). |
| 11 | parking-2 | assertion-flake-refactor | `a3221b68f6` | git log `test(flake): consolidate parallel-load timing-baseline across 3 flake sites` + claims rows 174-178. Population follow-ups 6-back-7 (`398d5946aa`) + 6-back-8 (`5b65eb7621`) are the cohort-completion ships. |
| 12 | parking-3 | Fix A Drive 400 per-file investigation | `29ccaec5c9` (SUBSUMED) | Self-documented in the QUEUE row text: "Subsumed into Fix B's verbose error capture. No separate dispatch needed pre-Fix-B." Fix B shipped `29ccaec5c9` — Drive `errors[]` body now surfaces verbosely per the row's own resolution criterion. |
| 13 | parking-dup-2 | musicxml Build Lane B | `7d209fa374` | git log `feat(musicxml-transpose-jank): S1 scroll-restore + S4 adaptive-debounce + S7 sourceUrl-priority` + claims rows 164-167 + L55 W3 catch-all popped block ("musicxml-build-lane-b-transpose-jank ... POPPED → coder-5"). |
| 14 | tier0-audio | audio-bond-prod-verify | `d65dd7d47e` | git log `docs(audio-bond-prod-verify): Tier-0 verify-gate run closes ipad-sweep §Coverage gap` + L79 Wave-5 popped block ("audio-bond-prod-verify → coder-1 SHIPPED `d65dd7d47`"). |
| 15 | backlog-1 | MusicXML Phase-2 MED | `9784b1f493` | git log `feat(musicxml): capo panel input + detected-key header w/ leader match-button (Phase-2 MED)` + claims rows 248-252 + 264-268. Capo + detected-key features both delivered. |
| 16 | backlog-2 | F1 offline pre-cache on Perform entry | `c52d2b1427` | git log `feat(perform): F1 entry-precache fires Dexie warmup on Perform mount (queueMicrotask, idempotent with rIC)` + claims rows 169-171 + L77 Wave-5 popped block ("F1 perform-entry-precache → coder-1 SHIPPED `c52d2b142`"). |
| 17 | backlog-3 | F4 full-text chart search via MCP | `aa577c77b0` + `3355bf194a` | git log `feat(mcp): search_chart_text — full-text-ish search over PERSISTED chart-text surfaces (F4 lane)` (`aa577c77b0`) + `feat(library): persist searchableText at PCU + extend search_chart_text with lyrics scope + admin backfill (f4-lyric-search-persistence-mod)` (`3355bf194a`) — 2-commit ship covering both the MCP search + persisted lyrics scope. claims rows 279-280 + 354-356. |
| 18 | backlog-5 | "[object Object]" error UI stringification fix | `59e0448c71` | git log `feat(ui): formatError util + replace [object Object]-vulnerable err string sites` + claims rows 269-278 + 289-299. |
| 19 | backlog-6 | Audio-bonded track render-type discriminator | `a7d43a8f5c` | git log `feat(perform): viewer dispatch routes by mimetype, not track.type (audio-render-type-discriminator)` + claims rows 255-258. Adon Olam mp3 case structurally closed. |

## STILL OPEN rows (real backlog candidates for supervisor)

These rows have NO matching ship-commit in `git log --all --oneline` AND no matching `released ... LANDED` claim. They are the supervisor's actual next-dispatch material going forward.

### 1. `6-back-4` bridge-cold-boot-integration-test (P3 BACKLOG)

- **Scope:** Playwright/Spectron Electron-host test; setup-code → cred persist → first heartbeat. L-effort multi-day.
- **Spec:** `.paul/research/bridge-analysis/FINDINGS.md` §4 Lane #8.
- **Evidence of STILL-OPEN:** no `cold-boot-integration` keyword anywhere in `git log --all --oneline`; no matching claim. The bridge has shipped 6 sibling lanes (#1/#2/#3/#4/#5/#6 of TOP-10) without #10's integration test.
- **Note:** L-effort and Electron-test-experience-fit make this a deferrable dispatch.

### 2. Backlog `Bridge-side Electron Sentry` (P3)

- **Scope:** Second Sentry project (platform: Electron) for bridge crashes/errors.
- **Notes:** Deferred from `sentry-wiring` lane. v10.0.4's O1 `monitor-live/bridgeLog` already covers bridge observability remotely; only add if it leaves blind spots in practice.
- **Evidence of STILL-OPEN:** no `electron-sentry` / `bridge-side-sentry` keyword in git log. v10.0.6 release `e091ea4f96` did not add it.

### 3. `W3-1` library-index-normalizedname-backfill (P1 ingest-matrix F-4) — CONSERVATIVE STILL-OPEN

- **Scope:** "Ingest-matrix F-4 (auditor-VERIFIED; population WIDER than coder-4 described — IMP rows blind to BOTH exact AND fuzzy dedup, SLI rows blind to fuzzy only). One-shot script: dryRun→apply→redry. Mirror coder-2 `8ddcca1c5` pattern. ~60 LOC. Tier-0 ops; Daniel-single-owner."
- **Evidence of likely-subsumed:**
  - L60 catch-all popped block: "W4-1 normalizedname-backfill-apply POPPED → coder-5 (Daniel-named single-owner)".
  - git log `10f7f8183a chore(scripts): backfill library_index W-02 derivative fields for FINDING-4 (350/625 rows, Tier-0 applied)` — explicit FINDING-4 backfill, 350/625 rows, Tier-0 applied.
  - git log `6325cc7870 feat(library): pin recomputeIndexNameFields.normalizedName to strip media extensions; backfill 241 historical rows` — algorithm pin + 241 final-row backfill.
- **Why STILL OPEN conservatively:** the exact lane name `library-index-normalizedname-backfill` doesn't appear verbatim in git log or claims. The two commits + W4-1 popped row together likely cover the W3-1 scope, but the supervisor's dispatch only called out `bridge-v1005-publish` as a special-case override — not W3-1. Per scope §Out-of-scope ("NO speculative POPPED-marks — if any of the 3 sources doesn't confirm, leave the row as STILL OPEN"), I am leaving this STILL OPEN for the supervisor to confirm the semantic equivalence and POPPED-mark if appropriate.

## QUEUE.md edits

Edited the local-only `.coord/QUEUE.md` (gitignored per `.gitignore:5`, not committed):

- Each of the 20 POPPED rows wrapped with `<!-- 6-back-N <lane> POPPED 2026-05-26 → <sha> (see agents.md / git log) -->` HTML comment markers, mirroring the existing pattern at L41-42 / L46-49 / L53-56 / etc. (Row text preserved inside the comment for grep-ability.)
- Header sweep-date counter added: `**Last hygiene sweep:** 2026-05-26 by coder-6 — 20 rows POPPED / 3 rows STILL OPEN. See FINDINGS at `.paul/research/queue-md-hygiene-sweep/FINDINGS.md`.`
- §Wave-6 backlog table compressed to surface only `6-back-4` (the one STILL OPEN row in that section).
- §Daniel-gated parking duplicate (L125-130 vs L103-109) flagged for supervisor consolidation — both copies marked POPPED but the duplicate-section header carries a `<!-- DUPLICATE SECTION — consolidate with L103-109 in next refresh -->` note.

## META-OPEN-FOLLOWUP — supervisor wave-scoping discipline

Per dispatch §Bonus-follow-up: the 20-of-23 POPPED ratio (87%) is a strong signal that the supervisor's QUEUE-row maintenance has fallen behind real ship velocity by ~2 waves. Three of the four lanes the supervisor scaffolded in this turn's hygiene-miss (mine + coder-1's monitor-master-mute + coder-5's monitor-popup-fullbottom) all fired against stale QUEUE rows; the bridge-housekeeping miss (mine) was the lucky one because the BLOCKER caught it before work started. Recommend the supervisor either:

- (a) adopt a **per-SHIP-NOTICE POPPED-mark step** in the dispatch protocol (mirror existing protocol §6 "Update agents.md" with a new §7 "POPPED-mark the freed lane's QUEUE row"); OR
- (b) run this hygiene sweep periodically (~every 2 days while wave velocity ≥ 2 ships/day); OR
- (c) both.

Option (a) is structural per [[feedback_supervisor_keeps_lane_queue]]; option (b) is a safety net. I'd ship (a) immediately and re-run (b) if the next post-sweep audit shows recurrence.

## Source of truth at sweep time

- master-tip: `e091ea4f96` (2026-05-26T~14:00Z, coder-3 v10.0.6 bundle bump)
- canonical worktree: `C:/Users/dsbog/CentralReform.live/sheet-music-app/`
- this lane's worktree: `C:/Users/dsbog/CentralReform.live/sheet-music-app-queue-md-hygiene/` on `feat/queue-md-stale-row-hygiene-sweep`
- coder-6 identity verified `<coder-6@coord.local>` via per-worktree config from my own `3023b2423` enforcement ship.
