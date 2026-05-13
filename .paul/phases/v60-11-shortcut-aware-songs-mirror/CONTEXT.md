# Phase Context

**Phase:** v60-11 — Shortcut-aware songs mirror (+ subscribe.ts self-heal)
**Generated:** 2026-05-13
**Status:** Ready for planning
**Origin:** v60-09-01 post-push UAT diagnosis (handoff 2026-05-13). Follow-up phase, NOT in ROADMAP.md at v6.0 creation — emergent from production state inspection. v6.0 milestone-close gate.

## Goals

- **Goal 1 — Make Drive-shortcut songs pickable.** Roughly 134 of the 498 `library_index` docs are Google Drive shortcuts (e.g. "Lechu Goldman" at `library_index/1jgs72zwhfEvqsqeeCFMw8Th7Zsk0mVJj`, `mimeType: "application/vnd.google-apps.shortcut"`). The v54-01-01 bootstrap's strict MIME filter (PDF + MusicXML only) intentionally excluded shortcuts from `songs/*` (count: 364). Library section + `/perform/{id}` work fine because they read `library_index` directly + serve the resolved Storage PDF. Only the chart-binder picker (ChartBindPopover + AddRowPlaceholder), which queries `songs/*`, is blind to them. UAT-confirmed gap.
- **Goal 2 — Self-heal v60-09 listener after SW deploys.** `src/lib/songs/subscribe.ts:101-103` error handler logs `warn` but does NOT call `recoverFromFirestoreShutdown(err)` from `@/lib/firebase`. The 5 other snapshot listeners in the codebase (`use-monitor-connection.ts`, `use-safe-firestore-sync.ts`, `alert-store.ts`, `firestore-monitor-client.ts`, `notification-store.ts`) all do. After a service-worker deploy, if the songs listener dies with "Firestore shutting down" it stays dead silently — users must manually reload. ~3 LOC fix; folded into this phase per handoff recommendation.
- **Goal 3 — Backfill the 134 missing shortcut docs into `songs/*` once,** so the existing library doesn't require a full cron-sync re-tick before becoming pickable. Production diagnostic (`scripts/diag-lechu-goldman.ts`) already confirmed the count and shape.

## Approach

**Path (locked from handoff Option 2 — drop the MIME filter at the songs/* mirror layer specifically):**

- Modify the `songs/*` mirror to write **every** `library_index` entry regardless of MIME type. The picker's `status !== 'archived'` Dexie filter (v60-09's existing field) becomes the only filter that matters; MIME-type-implicit purity is no longer the gate.
- Two writer surfaces likely affected (to confirm in research):
  - `scripts/bootstrap-songs.ts` — current source of the MIME filter, 364 count.
  - `src/app/api/cron/sync/route.ts` (or wherever Drive → `library_index` runs) — handoff notes it writes `library_index` but does NOT mirror to `songs/*`. New mirror logic lives here so future shortcuts auto-flow.
- Title source for new shortcut songs: use `library_index.name` as-is (after `.pdf` suffix strip, matching existing bootstrap normalization). Storage already serves the resolved PDF for shortcuts via the `storageCopiedAt` step (2026-05-12), so no extra Drive resolve is needed for the picker's purpose.
- **subscribe.ts self-heal:** add `recoverFromFirestoreShutdown(err)` to the error handler at `src/lib/songs/subscribe.ts:101-103`. Match the call shape of the 5 sibling listeners. New emulator test for the error path keeps HFG counter at 0/3 (no clause-(b) waiver).
- **Backfill:** one-off script run (likely `scripts/backfill-shortcuts-songs.ts` or scoped re-invocation of bootstrap-songs without `--no-shortcuts`) writing only the 134 missing docs. Idempotent — only ADD, never delete or rewrite existing `songs/*` docs (sticky memory must survive).

## Constraints

- **Issue 2 (setlist-missing cascade after deploys) is OUT OF SCOPE.** Separate diagnostic pending Daniel clearing site data on his iPad/Mac and reporting persistence. If still broken, follow-up phase (v60-12 or similar) for client-Firestore-resilience hardening.
- **HFG counter must hold at 0/3.** subscribe.ts error path gets an emulator-backed test before merge (force a `Firestore shutting down` synthetic error, assert `recoverFromFirestoreShutdown` is invoked and listener re-subscribes).
- **No engine touches** — write path goes through `db.songs.put` server-authoritative pattern established in v60-09, not `applyEdit`.
- **No deletion or rewrite of existing songs/* docs.** Backfill must be append-only. Sticky memory (recent[] + defaults) propagation lives in songs/{fileId}; clobbering breaks Daniel's muscle-memory.
- **LOC budget ~50-100 production + ~30 test** per handoff estimate. Smallest-fix bias.
- **v6.0 milestone-close gate.** Once v60-11 LOOP COMPLETE + PENDING-UAT, milestone can close pending worship-cycle UAT + Issue 2 outcome.
- **Friday/Shabbat cadence.** No risky deploys Thu PM → Sun. Today is Wed 2026-05-13 — push window open through Thu AM.
- **/ui-ux-pro-max gate:** NOT applicable — data-layer only. No UI surface changes (picker UX already done in v60-09).

## Open Questions

- **Q1 — Cron-sync writer location:** does `/api/cron/sync/route.ts` itself mirror to `songs/*`, or does it only write `library_index` and rely on bootstrap-songs.ts as a separate manual step? Answer determines whether the MIME-filter-drop is one site or two. *(Research at /paul:plan entry — grep `cron/sync` + audit library_index writers.)*
- **Q2 — Backfill mechanism:** new dedicated script, or scoped re-run of `bootstrap-songs.ts` with a new `--include-shortcuts` flag (or simply dropping `--no-shortcuts` default)? Latter is smaller surface, but a dedicated backfill script captures the "this is a one-off correction" intent more clearly in git history.
- **Q3 — Shortcut name handling:** Daniel's library_index entries store `name` as the shortcut's display name (e.g. "Lechu Goldman.pdf"). For the 134 affected docs, does this match what Daniel expects to see in the picker, or does the shortcut target's name differ in any way that would surface in UAT? *(Spot-check 3-5 shortcut docs at planning time via diag script; if mismatch surfaces, decide whether to resolve target name or accept shortcut name.)*
- **Q4 — Cron-sync incrementality:** is `/api/cron/sync` a full-resync that would naturally pick up the 134 shortcuts on next tick once MIME filter is dropped, or is it incremental and the backfill is the only way to seed the 134? *(Determines whether backfill is mandatory or just an acceleration.)*

## Additional Context

- **Diagnostic helper already exists, uncommitted:** `sheet-music-app/scripts/diag-lechu-goldman.ts` uses admin SDK to read production directly. Safe production READS only (no writes). Daniel may want to keep it under `scripts/diag/` for future production state inspection — decide at PLAN entry whether to commit, move, or delete.
- **Production state of record (2026-05-13):**
  - `library_index` total = 498
  - `songs/*` total = 364 (v54-01-01 bootstrap count)
  - Gap = 134, predominantly Drive shortcuts excluded by MIME filter
  - Example: `library_index/1jgs72zwhfEvqsqeeCFMw8Th7Zsk0mVJj` exists, `songs/1jgs72zwhfEvqsqeeCFMw8Th7Zsk0mVJj` does not
- **v60-09 listener IS working correctly.** Per handoff Issue 1 diagnosis: the listener delivers what's in `songs/*`; the doc simply isn't there. No regression in v60-09 — this is a v54-01-01 bootstrap scope decision that needs revisiting now that v60-09 wired continuous propagation.
- **UAT verification path post-deploy:** Daniel adds "Lechu Goldman" (or any of the 134) via picker; appears in picker filter results within ~1s after backfill runs. Per v51-04 codified pattern — Daniel-loop UAT against deployed commit closes the AC.
- **Sibling listener references** (for subscribe.ts self-heal pattern match): `src/lib/firestore-monitor-client.ts`, `src/lib/hooks/use-monitor-connection.ts`, `src/lib/hooks/use-safe-firestore-sync.ts`, `src/lib/alert-store.ts`, `src/lib/notification-store.ts` — find `recoverFromFirestoreShutdown` invocation and mirror at `subscribe.ts:101`.

---

*This file is temporary. It informs planning but is not required.*
*Created by /paul:discuss, consumed by /paul:plan.*
