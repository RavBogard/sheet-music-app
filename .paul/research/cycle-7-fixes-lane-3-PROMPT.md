# Cycle-7-fixes Lane 3 — Chart-bond health repair

**Read order:** `.coord/CODER.md` → `.coord/README.md` → `.coord/shared/master-tip.md` → `.coord/shared/decisions.md` → `.coord/shared/claims.md` → **`.paul/research/cycle-7-TRIAGE.md`** + **`.paul/research/cycle-7-instance-4-HANDOFF.md`** + **`.paul/research/cycle-7-instance-1-HANDOFF.md`** §REPRO-C7I1-009 → THIS FILE.

**Role:** IMPLEMENTER. Standard CODER.md §Worktree-setup.

**Bearer:** admin `crl_live_*` from pool row `ASSIGNMENT=cycle-7-fixes-lane-3`.

**Wall-clock budget:** ~120 min.

**Branch:** `feat/cycle-7-fixes-3-chart-bond`
**Worktree:** `sheet-music-app-cycle-7-fixes-3-chart-bond/`
**Cut from:** origin/master tip.

---

## §0 — Mission

Close the chart-bond health crisis. Instance 4 measured **46% chart-bond health** on the 10 highest-trackCount setlists (worst case `tIJ5DlvkeeN1CWAUTUM2` at 62% missing). Instance 1 documented the divergence root cause via C7I1-009: `search_library` returns rows marked `status:"active"` whose files are MISSING in Storage AND return 404 from Drive. The search index and the storage state have diverged.

Bonus surface: C7I4-002 — `Eitan Shabbat Morning 2/21` (setlist `b12a5221`) reports `trackCount=43` in `list_setlists` but its `tracks` subcollection is empty. Stale denormalized counter; needs writer audit.

**Friday-night impact:** 46% chart-bond means roughly half of every published setlist's chart fetches fail. Combined with Lane 2's chart-spinner-trap fix, this lane is what actually MAKES the band-stand experience reliable.

---

## §1 — Scope A — Investigate scope of divergence

Before fixing, **measure**. Use the bearer to run read-only MCP probes:

1. `dump_collection_size {collection:'library_index'}` — total row count.
2. Iterate `list_library({limit:100, offset:N})` over the full library OR query Firestore directly via Firebase admin SDK. For each row with `status:'active'`:
   - Check Storage for `upload-<uuid>` fileIds (or whatever the canonical pattern is)
   - Check Drive for legacy Drive-id fileIds via the existing `getFileWithMime` helper at `src/lib/google-drive.ts`
3. Classify:
   - **Prunable** — Drive-id row whose Drive returns 404 (file deleted upstream; row should be soft-marked `status:'missing'` or hard-deleted).
   - **Recoverable** — Storage row whose Storage GET 404s (upload attempt failed mid-write; row should be retried OR pruned).
   - **OK** — file fetches succeed.

Save the categorization to `.paul/research/cycle-7-fixes-3-bond-audit.md` (your investigation artifact).

---

## §2 — Scope B — Prune dead bonds + fix the divergence

Two-pronged fix:

**Prong 1: Server-side reconcile sweep.**
- `src/lib/mcp/tools/reconcile-library.ts` has the existing `reconcile_library` MCP tool. Run `reconcile_library({dryRun:false, scope:'library_index'})` against prod to mark or remove dead rows.
- If the tool's existing scope doesn't cover this case, EXTEND it: add a new scope option `'storage_drift'` that flags `status:'active'` rows whose file doesn't resolve.

**Prong 2: Setlist-level chart-bond audit.**
- For each currently-published setlist, run `verify_setlist_charts({setlistId})` to enumerate broken bonds.
- For each broken bond: either re-resolve via Drive shortcut chain (per `[[feedback_upload_atomicity]]` retry semantics) OR delete the orphan track + log to `bond_flags` for human review.
- Avoid mass-delete; prefer the soft-flag path so Daniel/David can review before tracks vanish.

**Acceptance:**
- Post-sweep: `verify_setlist_charts` aggregate health on the 10 highest-trackCount setlists goes from 46% to ≥80% (cycle-7 A3 target).
- Worst-case setlist `tIJ5DlvkeeN1CWAUTUM2` improves from 38% healthy to ≥80% (or its broken bonds are documented as content-recovery-needed, not infrastructure-bugs).
- `search_library` no longer returns rows whose file fetches will 404 in production (verified by sampling 50 results post-sweep).

---

## §3 — Scope C — `trackCount` writer audit + repair stale `b12a5221`

**Investigate:** `trackCount` is denormalized on setlists and maintained by writers in `src/lib/mcp/tools/setlists.ts`, `src/lib/setlist-write.ts`, `src/lib/mcp/server-tracks-write.ts`, `src/lib/setlist-firebase.ts`, `src/app/api/setlists/import/execute/route.ts`, `src/app/api/setlists/import/commit-document/route.ts`, `src/hooks/use-creation-wizard.ts` (per supervisor pre-flight grep).

**Find the writer that should have decremented trackCount when `Eitan Shabbat Morning 2/21` lost its tracks.** Two scenarios:
1. **Writer is broken** — a delete path forgot to decrement. Fix it; add test coverage.
2. **`trackCount` is dead/unmaintained field** — actually multiple writers but not all paths covered. Either consolidate writers into a single helper OR drop the denormalized counter entirely and compute on-read.

**For the specific `b12a5221` row:** repair by either (a) recomputing trackCount from actual tracks subcollection, or (b) if no tracks should exist, set `trackCount: 0`.

**Acceptance:**
- `get_setlist({id:'b12a5221'}).trackCount` matches `tracks.length` after the fix.
- Writer audit documented in HANDOFF: which writers, which delete-path was broken, how it's fixed.
- New emulator test covers the delete-path that previously skipped trackCount decrement.

---

## §4 — Add a chart-bond health cron (prevent regression)

**New cron entry:** `vercel.json` entry `/api/cron/verify-chart-bond-health` runs once daily (e.g. Thursday afternoon US Central, ahead of Friday service).

Job: enumerate setlists with `status:'published'` AND `eventDate >= now()`. For each, call `verify_setlist_charts`. If aggregate health <80% OR any individual setlist <70%, log to a new `chart_bond_alerts` Firestore collection AND send an admin push notification.

Daniel sees alerts before Friday; can re-bind broken charts via MCP or UI.

**Acceptance:**
- Cron entry present in `vercel.json`.
- Endpoint at `src/app/api/cron/verify-chart-bond-health/route.ts` runs cleanly.
- Emulator test covers the alert-emit path.
- `chart_bond_alerts` Firestore collection block in `firestore.rules` (admin-read only).

---

## §5 — REPROs (mandatory)

- **REPRO-L3-aggregate-bond-health:** post-sweep, call `verify_setlist_charts` on each of 10 highest-trackCount setlists; record per-setlist health %. Aggregate ≥80%.
- **REPRO-L3-search-storage-divergence:** sample 50 `search_library` results; for each, fetch file; expect zero 404s in Storage AND zero 404s in Drive.
- **REPRO-L3-trackCount-repair:** `get_setlist({id:'b12a5221'}).trackCount === <actual tracks count>`.
- **REPRO-L3-cron-alert:** test cron endpoint with a forced low-health setlist; verify `chart_bond_alerts` row written.

---

## §6 — Hard rules

- Don't touch `bridge/**`, repo-root `mcp/`, `SetlistGrid.tsx`, `src/lib/mcp/errors.ts`, `src/lib/mcp/error-envelopes.ts`.
- Claim shared files in `.coord/shared/claims.md` before editing. Likely contended: `firestore.rules`, `vercel.json`, `src/lib/mcp/tools/index.ts`, `src/lib/mcp/tools/reconcile-library.ts`.
- HEADS-UP Lane 2 (iPad UI) before touching `src/hooks/use-setlist-performance.ts`. Coordinate via inbox.
- HEADS-UP Lane 4 (misc) — Lane 4 may also touch `src/lib/mcp/tools/index.ts` (new MCP tool registrations); coordinate to avoid merge conflict at the registration block.

---

## §7 — HANDOFF requirements

SHIP-NOTICE `msg-from-coder-3-cycle7-fixes-3-ship` to `.coord/inbox/supervisor.md`:
- Ship SHA + branch + commit summary
- Investigation artifact at `.paul/research/cycle-7-fixes-3-bond-audit.md` with the categorized library_index sweep
- Per-acceptance PASS/FAIL with REPRO transcripts
- Bearer-burn: pool row `ASSIGNMENT=cycle-7-fixes-lane-3` → `ASSIGNMENT=burned`

---

## §8 — Bail-out conditions

- HARD-BLOCK if investigation reveals scope is >2x the budget (e.g. 80% of library_index rows are broken — that's a content-recovery project, not a code lane). Surface to supervisor; renegotiate scope down to "ship the audit infrastructure + cron + reconcile tool; defer mass-prune to follow-up".
- DEGRADED-OK if `verify_setlist_charts` is itself broken at lane SHA — document and skip the post-sweep verification; the cron can validate the fix once live.

---

*from supervisor*
