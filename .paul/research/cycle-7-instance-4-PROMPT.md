# Cycle-7 Instance 4 — Real-data read-only probe

**Read order:** `.coord/CODER.md` → `.coord/README.md` → `.coord/shared/master-tip.md` → `.coord/shared/decisions.md` → `.coord/shared/claims.md` → **`.paul/research/cycle-7-cowork-PARENT.md`** (full) → THIS FILE.

**Role:** PROBE instance, NOT implementer. Skip CODER.md §Worktree-setup. No branch, no ship. **READ-ONLY** — no `create_*`, `update_*`, `delete_*`, `publish_*`, `add_*`, `import_*` calls. Violation = HARD-BLOCK self-report.

**Bearer:** `<DANIEL-MINT crl_live_*>` (admin role required for `dump_collection_size`).

**uidPrefix:** NONE — instance 4 creates zero fixtures.

**Wall-clock budget:** 60 min. Boot ~10min + read sweep ~40min + HANDOFF ~10min.

---

## §0 — Mission

Cycle-5/6 probes were all synthetic — every test fixture was `isTest:true` / `test-*`-prefixed. The 272-orphan baseline per `[[project_orphan_baseline]]` was only surfaced by real-data inspection. Per recon Agent C §8.6 + Agent B §7 row 6, **real-data drift hides where synthetic doesn't go**.

This instance inspects actual production state. Read-only. Zero mutations. Surface drift before users do.

**Surfaces in scope:**

- Library health (`library_index` row hygiene; mimeType backstop coverage per `[[project_track_mimetype_gotcha]]`; orphan baseline drift from 272).
- Setlist health (real `setlists/*` cardinality + sort/order integrity + chart-bond completeness; published vs draft ratio).
- AI enrichment cache state (`aiEnrichmentCache`, `aiEnrichmentRetryQueue`, `aiCorrectionSignals`, `aiCorrectionStats` — drift from `[[project_ai_cost_baseline]]`).
- Service personnel + scheduling state (`scheduling_assignments` integrity; orphaned assignments).
- WebVitals + Sentry telemetry (real-user RUM data — fills in PARENT §3's "absolute CWV is unattainable" gap with actual production numbers).
- Template collection state (`setlistTemplates/*` post-Lane-2; user-created vs hardcoded inventory).

---

## §1 — Read-only tools available

These are the only MCP tools you may invoke. Any tool not on this list is OUT OF SCOPE for instance 4.

| Tool | Use |
|---|---|
| `list_library({limit, offset, collection?})` | Library catalog read-through |
| `dump_collection_size({collection})` | Firestore cardinality per collection — admin-only |
| `list_setlists({status?, limit, offset})` | Setlist catalog |
| `get_setlist({setlistId})` | Per-setlist drill-down |
| `list_templates({templateType?, ownerUid?})` | Lane 2 template inventory |
| `get_template({templateId})` | Per-template drill-down |
| `list_service_personnel` | Roster integrity |
| `getChartStatus({fileId})` | Per-chart health (enrichment + shortcut state) |
| `verifySetlistCharts({setlistId})` | Aggregate chart-bond health on a real setlist (read-only verify) |
| `tools/list` | Boot self-check |

Direct HTTP reads (no MCP) also acceptable: `/api/version`, `/api/library/list` (GET only), `/api/setlists/[id]` (GET only). Anything POST/PUT/DELETE on HTTP routes is forbidden.

---

## §2 — Probes

**Probe 1 — Collection cardinality snapshot.**

Run `dump_collection_size` for: `setlists`, `tracks`, `library_index`, `setlistTemplates`, `users`, `scheduling_assignments`, `aiEnrichmentCache`, `aiCorrectionSignals`, `webVitalsObservations`. Record absolute counts as the **2026-05-19 baseline**. Compare templates count to expected (Lane 2 ship + maybe a few Daniel/David-created) — if >50, surface as MED finding (likely test-data leak).

**Probe 2 — Library hygiene.**

- Total rows via `dump_collection_size('library_index')`. Compare to `[[project_orphan_baseline]]` (272 as of 2026-05-19).
- Sample 50 random rows via `list_library`. Inspect: `fileId` shape (`upload-*` vs Drive-id); `mimeType` presence per `[[project_track_mimetype_gotcha]]`; `enrichment` field state.
- Cross-ref orphan list via `reconcile_library({dryRun:true})` — IF available without `force`. Per `[[feedback_dryrun_is_observability]]`, dryRun should return full report without refuse-gate.

**Probe 3 — Setlist health.**

- Total `setlists` count vs prod-known cardinality.
- Sample 10 published setlists; for each, run `verifySetlistCharts({setlistId})`. Aggregate: how many tracks have unhealthy chart bonds? `shortcutUnresolvedCount` total?
- Sort/order integrity: do `tracks` rows for sampled setlists have contiguous positions, no gaps?
- Published vs draft ratio.

**Probe 4 — AI enrichment cache state.**

- `aiEnrichmentCache` size + age distribution (sample 50 rows via direct Firestore-listdocs if permitted, else via `list_library` and inspecting `enrichment` field).
- `aiEnrichmentRetryQueue` size — should be ~0 in steady state; >5 = MED finding indicating retry pile-up.
- `aiCorrectionSignals` + `aiCorrectionStats` cardinality. Per `[[feedback_learning_self_healing]]`, deterministic-counter self-heal — verify counts are accumulating, not zero.
- Snapshot for `[[project_ai_cost_baseline]]` update (placeholder per cycle-6 Instance D deferral).

**Probe 5 — Scheduling + roster integrity.**

- `list_service_personnel` — full roster snapshot.
- `scheduling_assignments` cardinality + sample 20 rows for orphan check (assignments referencing non-existent setlistIds or userIds).
- Cross-reference to David's weekly-flow membership.

**Probe 6 — Real-user CWV telemetry.**

- `webVitalsObservations` query for the last 7 days. Admin-readable per `[[project_v2_redesign]]`-era rule.
- p75 LCP / FID / CLS per top-5 routes (sorted by sample count). Critical for criterion 4 of the green rubric.
- This fills the absolute-CWV-unattainable gap in synthetic probes per Agent B §1 row i.

**Probe 7 — Lane 2 template adoption.**

- `list_templates` — full inventory.
- Per template: `ownerUid`, `templateType`, `version`, `updatedAt`.
- Are Daniel + David's MCP-created templates landing here, or is the collection only the 16 hardcoded liturgicals?

---

## §3 — Acceptance assertions

- **A1.** Collection cardinality snapshot captured for 9 collections; deltas vs prior cycle (if any) flagged.
- **A2.** Library orphan count delta from baseline 272 quantified; any auto-salvageable rows surfaced.
- **A3.** Sampled 10 published setlists all have ≥80% healthy chart bonds; outliers flagged.
- **A4.** `aiEnrichmentRetryQueue` size ≤5; deterministic correction-counter movement confirmed.
- **A5.** Zero orphaned `scheduling_assignments` in sample of 20.
- **A6.** Real-user CWV snapshot: p75 LCP per top-5 routes recorded; any route >2.5s flagged HIGH.
- **A7.** Template adoption: count of user-created vs hardcoded templates; pattern of David adoption visible.
- **A8.** AI cost baseline snapshot recorded into `[[project_ai_cost_baseline]]` memory placeholder.

---

## §4 — Privacy + read-only discipline

- **Do NOT screenshot user PII** (musician contact info, individual phone numbers, email addresses). Setlist/chart content is public per `[[feedback_setlist_public_policy]]` + `[[feedback_chart_access_policy]]`; user contact info is NOT.
- **Sanitize sample drills** by replacing UIDs with `<uid-N>` placeholders in HANDOFF.md.
- **Do NOT enumerate full collections** if cardinality > 500; sample randomly to a max of 100 per collection.
- **Do NOT call any write tool, even with `dryRun:true`** unless `dryRun:true` returns refuse on write-tools (in which case it's effectively a read — `[[feedback_dryrun_is_observability]]`). When in doubt: don't.

---

## §5 — What this instance does NOT probe

- Synthetic flows — Instances 1, 3, 5.
- UI deep-walk — Instance 2.
- Mutations of any kind — out of scope by definition.

---

## §6 — HANDOFF requirements

Write `.paul/research/cycle-7-instance-4-HANDOFF.md` per PARENT §4. Specific:

- One `## Probe` subsection per Probe 1–7 with sampled-data summary + drift annotations.
- A `## Cardinality table` listing all 9 collections with absolute counts.
- A `## Real-user CWV` table — top-5 routes, p75 LCP/FID/CLS.
- A `## Baselines` table — orphan count, retry queue depth, AI cost daily run rate.
- Per A1–A8: PASS/FAIL with evidence path.
- `## Repros` section: read-only probes don't strictly need prod-SHA stamping (read-side is by construction at master tip), but each finding should cite the Firestore collection + sample size.
- `.paul/research/cycle-7-instance-4-findings.jsonl` per schema.
- Sanitized artifacts under `.paul/research/cycle-7-instance-4-artifacts/`.
- Cleanup checklist: zero fixtures created → cleanup section reads "N/A — read-only instance"; bearer burned.

ACK + HANDOFF-COMPLETE to `.coord/inbox/supervisor.md` signed `from coder-4`.

---

## §7 — Bail-out conditions

- HARD-BLOCK: bearer rejected; bearer lacks admin role (admin needed for `dump_collection_size`); a load-bearing read tool missing from `tools/list`.
- DEGRADED-OK: `webVitalsObservations` collection empty (note as INFO finding "no RUM data captured 7d window"); individual probe times out (note + continue).
- **HARD-STOP on accidental write attempt** — if you find yourself about to call a non-read tool, abort the current probe, self-report to supervisor as a discipline violation, continue with remaining read-only probes.

---

*from supervisor*
