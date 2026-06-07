# Cycle-8 Instance 2 — Observability + data-integrity

**Read `.paul/research/cycle-8-cowork-PARENT.md` once first.** Mission-content only (≤200 lines). Bearer/uidPrefix/harness/standing-rules live in the PARENT.

**uidPrefix:** `c8i2` · **Bearer:** 1 admin bearer (root or Instance-1-minted child) · **Wall-clock:** ~75 min · **Finding ID prefix:** `C8I2-NNN` · **Read-mostly: mutations only on `isTest` fixtures.**

---

## §0 — Mission

Verify the data-integrity + observability machinery that shipped in cycle-7-fixes
ACTUALLY works in production — not just that the code compiled. These are the
features whose whole point is correctness over time, so deployed-surface
behavior is the only evidence that counts.

---

## §1 — `get_web_vitals_summary` (Lane 4 + 326bc9114 followup)

1. **Top-N path:** `get_web_vitals_summary({sinceDays:7})` → confirm `{ok:true, sinceDays, since, sampleCount, truncated, routes:[{surface, sampleCount, metrics:{LCP,CLS,INP,FCP,TTFB:{p75, sampleCount}}}]}`, top-5 by sample count. Sanity-check the numbers against `webVitalsObservations` reality (the field-RUM sink).
2. **Surface-filter path (the 326bc9114 fix):** `get_web_vitals_summary({surface:"/perform", sinceDays:30})` → MUST return a single-route rich envelope (NOT the raw `9 FAILED_PRECONDITION` GRPC leak that the original Lane 4 ship had). The `webVitalsObservations(surface, timestamp)` composite index should now be load-bearing. Try several surfaces (`/`, `/login`, `/setlists`, `/perform/setlist/[id]`).
3. **Index-missing envelope (defense-in-depth):** if you can probe a surface value that has no index coverage, confirm the `firestore_index_missing` rich envelope fires rather than a raw GRPC leak. (May not be reachable if the composite covers all surface queries — note if so.)
4. **Admin gate:** call with a non-admin (musician) test bearer → `forbidden_role` rich envelope.
5. **Validation:** `sinceDays > 90` → `validation_error` (90 = sink TTL).

---

## §2 — chart-bond cron + alerts (Lane 3)

Lane 3 shipped `/api/cron/verify-chart-bond-health` (Thursday 15:00 UTC) + a `chart_bond_alerts` firestore.rules block. The FIRST scheduled tick was **2026-05-21 15:00 UTC** — by your run it should have fired at least once.
1. Inspect the `chart_bond_alerts` collection (read-only) — did the cron actually run + write alerts? Confirm the doc shape is sane (not malformed/empty).
2. If the cron has NOT fired yet at your run time, note it as INFO + flag the first-tick verification as still-pending.
3. Cross-check: do the alerts correspond to real chart-bond-health problems, or are there false positives/negatives vs `verify_setlist_charts` on a sample setlist?

---

## §3 — trackCount drift-heal (`recompute_setlist_track_count`, Lane 3)

Lane 3 healed 6 drifted setlists + shipped a recompute tool + fixed the broken `/api/setlist/delete` cascade.
1. `recompute_setlist_track_count` on a sample of real setlists → confirm `trackCount === tracks.length` post-recompute; report any setlists still drifted.
2. Spot-check the delete-cascade fix: create a `c8i2` test setlist with tracks, delete it (`delete_setlist({force:true})`), then confirm zero orphan `tracks/{trackId}` rows with that `setlistId` remain (the v60-07-02 gap Lane 3 fixed). This is a `isTest`-fixture mutation — allowed + cleaned up.

---

## §4 — orphan baseline + reconcile residuals (Lane 3 / Lane 4 sub-task E)

The orphan-baseline was corrected 272 → **24** (`[[project_orphan_baseline]]`).
1. `sweep_orphan_test_data({dryRun:true})` → confirm the count is near the 24 baseline, not ballooning. (This also touches Lane 1's tool — read-only dryRun is fine.)
2. `reconcile_library({dryRun:true})` → inspect the `transient` bucket Lane 3 attributed to Drive-API flake. Has the daily cron cleared the ~20 residual search-divergence rows, or are they still stuck? (Lane 3 OPEN-FOLLOWUP #1.)
3. `search_library` spot-checks on a few titles → confirm no 404-to-Storage divergence on active rows.

---

## §5 — sub-task J index reconciliation (just shipped @ 8f9bc78fc)

Light verification that coder-1's index work didn't break query paths:
1. Exercise a query that depends on `musician_availability` composites (roster/scheduling read, e.g. `suggest_band` or availability listing) → confirm no `FAILED_PRECONDITION`.
2. Confirm no query that USED the now-deleted `setlists.isPublic` composites is in any active read path (they were deemed dead; verify nothing 500s).

---

## §6 — HANDOFF

Write `.paul/research/cycle-8-instance-2-HANDOFF.md` + `-findings.jsonl` + `-artifacts/`. Read-mostly discipline: any mutation must be a `c8i2`-prefixed `isTest` fixture, cleaned up + verified before HANDOFF-COMPLETE. Message to `.coord/inbox/supervisor.md` signed `from cycle-8-instance-2`.
