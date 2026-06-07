# Cycle-8 TRIAGE

**Composed:** 2026-05-20 (supervisor, post both-HANDOFF)
**Anchor SHA:** `edb24a47c` (origin/master; both instances probed this prod surface)
**Instances reconciled:** 2 of 2 (c8i1 credential/write-surface · c8i2 observability/data-integrity)
**Total findings:** 19 (c8i1: 7 · c8i2: 12) — 2 HIGH · 5 MED · 5 LOW · 5 INFO · 1 META · 1 by-design(no-action)

---

## §0 — Green-gate verdict

**Soft-re-entry bar (cycle-8 PARENT §6): MET.** Two independent
**regression-of-shipped-fix** findings, both HIGH, both
deployed-surface-verified by c8i2 AND statically corroborated by
supervisor against `origin/master`:

- **C8I2-001** — chart-bond cron route shipped but never registered in `vercel.json:crons[]`.
- **C8I2-002** — `suggest_band` index shipped in wrong sort direction (ASC vs required DESC); original C7I1-004 500 reproduces verbatim.

→ **cycle-8-fixes wave is justified.** Scope is small and config-dominated.

Everything else triages to **POLISH** (no green-gate impact).

---

## §1 — BLOCKS-GREEN (the two regressions)

### C8I2-001 — chart-bond cron not scheduled  `[HIGH · regression]`
- **Root cause:** Lane-3 (cycle-7-fixes) shipped `src/app/api/cron/verify-chart-bond-health/route.ts` (deployed; prod 401 + `x-matched-path`) but the Lane-3 DOD item "new cron entry in vercel.json" never executed. `git log origin/master -- vercel.json` = zero commits touching it.
- **Supervisor corroboration:** confirmed — `git show origin/master:vercel.json` has 7 crons (sync/drive-sync/enrich/ai-enrich-retry/aggregate-corrections/scheduling-reminder/admin-consistency), none for chart-bond.
- **Patch:** add `{ "path": "/api/cron/verify-chart-bond-health", "schedule": "0 15 * * 4" }` to `vercel.json:crons[]` (Thu 15:00 UTC per route docstring). Materializes on next push to master (Vercel auto-deploy).
- **Files:** `vercel.json`.

### C8I2-002 — suggest_band index wrong direction  `[HIGH · regression]`
- **Root cause:** Lane-4 (`460178e8b`) added `scheduling_assignments(status ASC, assignedAt ASC)` but the query at `roster.ts:749` is `.orderBy("assignedAt","desc")`. Firestore needs `status ASC, assignedAt DESC`. Original C7I1-004 500 reproduces at `edb24a47c`.
- **Supervisor corroboration:** confirmed — `firestore.indexes.json` shows `assignedAt ASCENDING`; `roster.ts:749` orders `desc`; the operator hint at `roster.ts:847` even reads "(status ASC, assignedAt ASC)" (wrong).
- **Patch:** flip `assignedAt` → `DESCENDING` in `firestore.indexes.json`; run `firebase deploy --only firestore:indexes --project crcmusiccharts` (automatable per `[[feedback_firebase_cli]]`); fix the hint string at `roster.ts:847`. **MUST actually deploy** — c8i2 flags Lane-4 may never have run the deploy, so the JSON edit alone won't materialize the index.
- **Files:** `firestore.indexes.json`, `src/lib/mcp/tools/roster.ts`.

---

## §2 — POLISH (defer or ride-along; not green-gating)

**Chart-bond cron cluster** (logically adjacent to C8I2-001 — once the cron fires it's immediately useful only if these ride along):
- **C8I2-004 MED** — breach formula `okCount/trackCount < 70%` false-positives on every typical Shabbat service (16/30 rows are intentional unbonded section markers → 43% even with 13/14 bonds healthy). Fix: denominator `bondedCount` + floor `bondedCount >= 3`. *Strong ride-along candidate with C8I2-001.*
- **C8I2-003 MED** — trackCount drift accumulating (`UnjLqKTtS4lNKQfMY6hB` 45→30); recompute heals but the drift-PRODUCER (non-atomic counter on some track-op path) is the real bug. Deeper than config; investigation-tier. C8I2-001 makes it chronic (no auto-heal cron running).

**Bearer-mint / MCP-envelope polish cluster:**
- **C8I1-001 MED** — `list_minted_bearers` shows cascade-dead children as `status:'active'` (corroborates auditor msg-028 OPEN-FOLLOWUP #1). Fix: derive `parent_revoked` status (one parent-read per row).
- **C8I2-006 LOW** — admin denial `machine_code` is `forbidden` on `get_web_vitals_summary` but `forbidden_role` in the bearer-mint lane (same SHA). Standardize on `forbidden_role`.
- (carry: auditor msg-028 OPEN-FOLLOWUP #2 — rate-limit query is unbounded-read; `(mintedByUid, mintedAt)` composite + range. Pairs with this cluster.)

**Template-CRUD validation polish cluster:**
- **C8I1-003 LOW** — 0-track source silently produces empty template.
- **C8I1-004 LOW** — no name-uniqueness check.
- **C8I1-005 LOW** — no name maxLength cap.

**reconcile_library cluster:**
- **C8I2-005 MED** — `transient` bucket misclassifies 2 persistent `google-apps.shortcut` rows retry can't heal (`search_library "Lechu Goldman"` → `[]`, real search-divergence pocket). Fix: `needsRebond` bucket + resolve via cycle-6 Lane-1 (`87f4708fa`) shortcut helper, OR mark orphaned. *More involved — feature-ish.*
- **C8I2-008 LOW** — `skippedNonChart.reason="drive_folder"` mislabels docs/sheets. Per-mime sub-reasons.

---

## §3 — No-action / environment / doc

- **C8I1-006** — cross-owner templating allowed BY DESIGN (caller-as-owner; admin already reads all setlists; no privilege escalation). No action.
- **C8I1-002 INFO** — rate-limit 10/day not prod-probed (budget conservation; emulator #5 + auditor msg-028 cover logic). Future auditor deployed-surface verify on a fresh probe day.
- **C8I2-007 LOW** — prompt cites non-existent `delete_setlist({force:true})`. Prompt-doc fix only, no code.
- **C8I2-009/010/011/012 INFO** — environment notes (cron first-tick was future; web-vitals sink ~7d of data; `musician_availability` composites have no live querier; dropped `setlists(isPublic)` composites confirmed dead/safe). No action.
- **C8I1-META-001 META** — Daniel's canonical working tree (`sheet-music-app/`) is parked on stale branch `fix/b1-error-envelope-sweep @ 3e1d9b4fd`, out of sync with `origin/master` (test-isolation.ts missing on disk; setlist-publish.ts 727L vs 840L in git). Workstation-state, not code. **Supervisor → Daniel:** `git checkout master` (or pull) in the canonical tree before next local probe; cowork/probes must read from `git show origin/master:` not disk.

---

## §4 — Cross-instance convergences

1. **C8I2-001 ↔ C8I2-003 ↔ C8I2-004** — chart-bond cron is the hub. Registering it (001) without fixing the breach formula (004) just produces alert-noise; and without a drift-producer fix (003) the cron is band-aiding indefinitely. Treat 001+004 as a unit.
2. **C8I1-001 ↔ C8I2-006 ↔ auditor msg-028 #1/#2** — MCP/bearer envelope + audit-view polish all converge into one cheap lane.
3. **C8I1-003/004/005** — template-CRUD input-validation, one tight cluster.

---

## §5 — Recommended lane shape

Both green-gate fixes are config + a one-line hint; the chart-bond
breach formula (C8I2-004) is a cheap, logically-coupled ride-along.
Per `[[feedback_agent_count_quality_over_quantity]]` (don't fragment),
this is a **single small lane**, not a 4-lane wave.

**Lane 1 — cycle-8-fixes (config-regressions + chart-bond sanity)** — 1 coder, ~60-90min
- C8I2-001 (vercel.json cron entry)
- C8I2-002 (firestore index DESC flip + `firebase deploy` + roster.ts:847 hint)
- C8I2-004 ride-along (breach formula `bondedCount` denominator + floor)
- File set: `vercel.json`, `firestore.indexes.json`, `src/lib/mcp/tools/roster.ts`, chart-bond cron route. No cross-lane contention (single lane).
- Deploy actions in-lane: push (Vercel auto-deploy materializes cron) + `firebase deploy --only firestore:indexes`.

**Deferred to a later POLISH lane / cycle-9** (no green-gate impact): the bearer-envelope cluster (C8I1-001 + C8I2-006 + auditor #2), template-CRUD validation (C8I1-003/004/005), reconcile clusters (C8I2-005 + C8I2-008), trackCount drift-producer root-cause (C8I2-003). Bundle opportunistically when a coder has budget.

**Verification tier:** Tier-1 (real src + config + deploy, no credential surface). Auditor binary-verdict on deployed surface: `suggest_band` returns ranked list (not 500), and vercel cron registered (`vercel.json` entry + Vercel dashboard shows the schedule).
