# W-003 — One-time library hygiene pass

**Status:** Planning doc, no code (operational plan). Derived from `setlist-system-punch-list.md` §W-003 / L-001 / L-002 / L-004 / L-005.
**Author:** Claude (planning pass, 2026-05-16)
**Sister docs:** [W-001](W-001-agentic-ux-shape.md) · [W-002](W-002-trust-calibration.md) · [W-004](W-004-bidirectional-sync.md)

---

## 1. Problem framing

The Chase session traced almost every failure back to library quality, not code: orphaned Drive files surfacing as `status: "active"`, three coexisting ID schemes (Drive-native vs UUIDv4 vs `upload-*`), generic titles that hid arrangement variants, multiple exact-duplicate entries (`Niggun 3 part choral score` at two IDs, `Oseh shalom (S&P)` at two IDs).

The tactical fixes the parallel session is shipping will add the *machinery* to detect and prevent further damage: orphan-status filtering, render verification, atomic upload guards. They will not retroactively clean up the ~500 existing rows of `library_index`. That's a one-time operational pass — partly automated (orphan sweep, SHA dedup), partly content work that only Daniel can do (enriching `Hashkivenu` → `Hashkivenu (Klepper-Freelander)`, deciding which of two `Oseh shalom (camp)` duplicates to keep).

This W is the **plan for that one-time pass**: what's automated, what's human, what's the safe order, what's the rollback story. It is not the code that does the work — most of the code lives in the tactical-fix branch already. It is the playbook.

## 2. Proposed scope

**In:**
- Sequenced four-pass cleanup:
  1. **Orphan sweep.** HEAD-check every `library_index` entry. Mark `status: "orphaned"` for any whose underlying file (Drive or Storage) 404s. Output: a CSV of orphans with last-known title + uploader + last-used setlist + current `fileId` scheme.
  2. **Exact-dedup pass.** SHA every Storage object, group by hash. For each cluster: keep the canonical entry (oldest non-orphaned, or admin-uploaded), mark siblings `status: "duplicate"`, redirect any bonded tracks to the canonical via a one-time `update_track` sweep. Output: a report.
  3. **Generic-title enrichment campaign.** Generate the worklist: every entry whose `titleSpecificity` (from W-002) is `< 0.5`. Daniel works through it manually, editing titles in batches via a new MCP tool (`update_library_entry(fileId, patch)`) or a one-time admin UI. No deadline — this is a content task.
  4. **ID canonicalization.** For every `upload-*` and UUIDv4 entry that points to a still-reachable file: leave as-is (the IDs aren't actually broken — L-001 vs L-002 was correlation, not causation). Optional: extract a follow-up if a future migration moves Storage to a different backend.
- For each pass: define preconditions, success criteria, rollback story, and which Firestore/Storage paths are touched.
- Owner assignments (orphan sweep + dedup → automated job, run by Daniel; enrichment → Daniel manually; canonicalization → deferred).
- Dependency graph against tactical fixes (see §4).
- An operational checkpoint: after pass 1 + 2 (automated), pause and let Daniel review the orphan/dedup reports before any destructive action. After pass 3 (manual enrichment), no pause needed.

**Out:**
- Building the orphan sweep tool itself — that's part of the L-001 tactical fix (parallel session owns it).
- Building the dedup tool — needs the atomic upload guard's SHA infrastructure; tactical-fix territory.
- Building `update_library_entry` MCP tool if it doesn't exist (TBD, see Q3) — that's a Wave-7 scope item, not this doc.
- Schema migration to flatten all three ID schemes to Drive-native — explicitly deferred per the punch-list (correlation, not causation; not worth the migration risk while everything still works).
- Any backfill of `composer` / `arranger` structured fields — Daniel's content work, embedded in pass 3.
- Touching the chart-access policy (per `feedback_chart_access_policy` — chart bytes stay intentionally publicly fetchable).

## 3. Explicit open questions for Daniel

1. **How long are you willing to spend on the enrichment campaign?** Honest estimate of generic-titled entries: 60–120 rows. If each takes ~30s of your time (think, type, save), that's 30–60 min total. Concentrated session vs. background batches over a week — your call.

2. **Dedup tiebreaker rule** — for a cluster of duplicates, which one wins? Options: (a) oldest = canonical (preserves history, may have stale metadata); (b) admin-uploaded = canonical (preserves provenance); (c) most-recently-used in a setlist = canonical (preserves what the band has seen). Recommend (c) for stability with the bonded-track sweep.

3. **Orphan retention** — when a row is marked `status: "orphaned"`, do we (a) keep it visible in `list_library({includeOrphaned: true})` as an audit trail, or (b) hard-delete after 30 days? Recommend (a) plus a follow-up "re-upload missing file" affordance — orphans hint at what *used* to be in the library and that's useful context.

4. **Does Daniel want a "tombstone" record for hard-deleted dupes?** When dedup collapses three Niggun entries into one, the two losers' fileIds need to either redirect or 410-Gone. Redirect is friendlier (any cached link still works); Gone is cleaner. Recommend redirect for ≥30 days then quietly delete.

5. **Bonded-track redirect — automated or supervised?** When dedup picks a canonical, every setlist row bonded to a non-canonical sibling needs `update_track({songId: canonical})`. Automated is fast; supervised lets you eyeball each setlist for surprises. Recommend automated for past setlists (eventDate in the past) and supervised for upcoming.

6. **Cadence after the one-time pass.** Run the orphan sweep nightly forever? Weekly? On every chart upload (as part of the atomic guard)? Recommend nightly + on every upload event; both are cheap.

7. **`update_library_entry` MCP tool — does it exist?** Quick repo grep didn't surface it. If it doesn't, pass 3 needs either (a) Daniel editing Firestore directly via the Firebase console (workable, slow), (b) a new MCP tool (~half day to build, surfaced as a separate scope item), or (c) the existing in-app library admin tabs (but you've abandoned the in-app UI). Recommend (b) — surfaces a separate small phase.

8. **Should pass 3 enrichment include adding the `composer` / `arranger` structured fields (W-002 schema)?** Doing both at once is cheap (Daniel's already opening each entry). Doing them in separate passes lets W-002 ship first without blocking. Recommend bundling — minimize the number of times Daniel opens any given row.

## 4. Dependencies on tactical fixes currently shipping

**Update 2026-05-16 (parallel session shipped):**
- ✅ **L-001 orphan-status field + filter** — shipped (commit `e4bea186c`). Pass 1 is now mostly "operate the existing tool" rather than "build it". Concretely: a one-time invocation of `verify_setlist_charts({markOrphaned: true})` for every setlist, plus a separate catalog-wide sweep that iterates `library_index` rows directly. The bulk catalog sweep may need a thin new MCP tool (`sweep_library_orphans` or similar — half a day) since `verify_setlist_charts` only walks bonded tracks within one setlist.
- ✅ **Atomic upload SHA computation** — landed `f650d94f0`. Pass 2 reuses it. Storage objects uploaded before `f650d94f0` may lack a stored SHA — a one-time `hashSweep` reads bytes and computes. Cheap because most charts are <1 MB.

**Still open:**
- **L-002 ID-canonicalization** — punch-list called for it, but the v3-pass conclusion is "old IDs aren't the actual problem; orphan-status is". Pass 4 (canonicalization) deferred indefinitely unless a hard storage migration forces it.
- **W-002 specificity field** — pass 3's worklist is "everything with specificity < 0.5". Without W-002, pass 3's input is hand-waved. Hard prereq for pass 3.
- **`update_library_entry` MCP tool (TBD)** — see Q7.

## 5. Effort estimate

**S (small) for the plan** (this doc + sequencing). **M for the automated passes 1–2** (mostly code that lives in the tactical fixes; W-003's contribution is the operational wrapper). **L for pass 3 enrichment** *in calendar time*, but it's Daniel-time, not engineering-time — 1–2 hours of focused work spread over a week.

Concretely:
- Pass 1: thin new `sweep_library_orphans` MCP tool (iterates `library_index`, runs HEAD-probe via `getChartHealth`, marks `status: "orphaned"`) since `verify_setlist_charts` only walks setlist-bonded tracks: ~0.5 day eng.
- Pass 2 orchestration tool (`dedup_library_by_sha` — uses SHA infra from `f650d94f0`, returns clusters + recommended canonical, executes only when called with `commit: true`): ~0.5 day eng.
- Pass 3 enrichment tooling (`update_library_entry` MCP tool, see Q7): ~0.5 day eng + Daniel's content time.
- Operational doc + checkpoints: ~0.25 day.
- Total engineering: ~1.5–2 days. Daniel time: ~1–2 hours of enrichment work, batched however suits you.

## 6. Suggested sequence vs. other Ws

**Run in parallel** with W-001 and W-004 once W-002 is in.

- Pass 1 (orphan sweep) — can run **immediately** after the parallel session's L-001 fix lands. No other dependencies.
- Pass 2 (dedup) — also runs immediately; independent of W-002 / W-001.
- Pass 3 (enrichment) — **gated on W-002** (needs `titleSpecificity` to produce a worklist). Once W-002 ships, pass 3 is "Daniel works through a list over a week"; doesn't block W-001 or W-004 engineering.
- Pass 4 (ID canonicalization) — deferred indefinitely unless a storage migration forces it. Track in `.paul/` deferred-issues, don't plan it now.

**If Daniel can only pick one to start:** pass 1. Orphan sweep stops the bleeding — every bond against an orphaned `songId` is a potential broken-chart-on-Friday. Even before W-001's nicer interaction shape lands, simply *filtering orphans out of search results* removes the worst-case "agent confidently bonds to a 404" failure mode.
