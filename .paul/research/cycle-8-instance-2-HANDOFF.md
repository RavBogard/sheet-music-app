# Cycle-8 Instance 2 — HANDOFF (observability + data-integrity)

**Instance:** 2 of 2 · **uidPrefix:** `c8i2` · **Sign:** `from coder-2`
**Deployed SHA probed:** `edb24a47c` (per `.coord/shared/master-tip.md`)
**Wall-clock:** 2026-05-19T22:28-22:43Z (~15 min real work; well under 75-min budget)
**Bearer:** supervisor-minted admin child (cycle-8 root); never written to any file under `sheet-music-app/`. Marked-as-burned below; will TTL-expire by 2026-05-20T~06:00Z regardless.

## §0 — Auto-revive bar status

Per PARENT §6: "Parallel-wave mode auto-revives only if cycle-8 TRIAGE surfaces
**≥3 BLOCKS-GREEN** OR **any regression-of-shipped-fix**." **Two
regression-of-shipped-fix findings landed in this instance:**

- **C8I2-001 HIGH** — Lane 3's chart-bond cron was added to the route tree but
  never registered in `vercel.json`. Vercel has nothing to schedule; the 2026-05-21
  first tick will not fire. The whole alerting machinery is dormant.
- **C8I2-002 HIGH** — Lane 4's `suggest_band` index fix added the composite in
  the WRONG sort direction (`assignedAt ASCENDING` instead of `DESCENDING`).
  The original REPRO-C7I1-004 500 reproduces verbatim at `edb24a47c`.

The auto-revive bar is met independently of Instance 1's findings.

## §1 — Findings

Severity tags only (HIGH / MED / LOW / INFO) per PARENT §4 + cycle-7 PARENT §4
discovery-not-gating rule.

### C8I2-001 — HIGH — chart-bond cron not registered in `vercel.json` (regression-of-shipped-fix)

**Lane:** §2 — chart-bond cron + chart_bond_alerts

**Steps:** inspect `git show origin/master:vercel.json` at SHA `edb24a47c`.

**Observed:** `crons[]` contains seven entries (sync / drive-sync / enrich /
ai-enrich-retry / aggregate-corrections / scheduling-reminder / admin-consistency).
NO entry for `/api/cron/verify-chart-bond-health`. The route file exists at
`src/app/api/cron/verify-chart-bond-health/route.ts` and is deployed (prod
returns 401 + `x-matched-path: /api/cron/verify-chart-bond-health` on unauth
probe). `git log origin/master --oneline -- vercel.json` returns zero commits —
vercel.json has never been touched by any cycle-7-fixes work. The Lane 3 PROMPT
explicitly listed "New cron entry in `vercel.json`" as a DOD item that
did not execute.

**Expected:** `crons[]` includes `{ "path": "/api/cron/verify-chart-bond-health",
"schedule": "0 15 * * 4" }` (Thursday 15:00 UTC per the route's docstring).

**Impact:** The whole `chart_bond_alerts` machinery is dormant. The Friday-eve
chart-health gate Lane 3 was supposed to deliver silently never executes.

**Evidence:** `artifacts/04-chart-bond-cron-evidence.md`.

---

### C8I2-002 — HIGH — `suggest_band` 500 still reproduces; Lane 4 index in wrong direction (regression-of-shipped-fix on REPRO-C7I1-004)

**Lane:** §5 — sub-task J index sanity

**Steps:** `tools/call suggest_band {setlistId: "UnjLqKTtS4lNKQfMY6hB"}` (real prod setlist).

**Observed:** `{ok: false, error: {code: 500, machine_code: "suggest_band_failed",
message: "Failed to suggest band: 9 FAILED_PRECONDITION: The query requires an index. ..."} }`.
Identical shape to the cycle-7 instance-1 REPRO-C7I1-004 finding.

Root cause: Lane 4 (`460178e8b`) added the composite in the wrong sort
direction. The query in `src/lib/mcp/tools/roster.ts:747-749` is:

```ts
.collection("scheduling_assignments")
.where("status", "==", "...")
.orderBy("assignedAt", "desc")
```

But `firestore.indexes.json` on origin/master ships:

```json
{ "collectionGroup": "scheduling_assignments", "fields": [
    { "fieldPath": "status",     "order": "ASCENDING" },
    { "fieldPath": "assignedAt", "order": "ASCENDING" }   // ← needs DESCENDING
]}
```

Firestore decodes the `create_composite` URL Lane 4 saw in prod as
`status ASC, assignedAt DESC, __name__ DESC`. The local config matched only
the first axis. The hint in roster.ts:847 even reads "(status ASC, assignedAt
ASC)" — both code and config are misaligned with the query.

**Expected:** `suggest_band` returns the ranked candidate list.

**Patch:** flip `assignedAt` to `DESCENDING` in `firestore.indexes.json`,
`firebase deploy --only firestore:indexes`, update the roster.ts:847 hint
string. Also worth checking whether Lane 4's `firebase deploy` step ever ran —
if not, even the JSON fix won't materialize the index in prod.

**Evidence:** `artifacts/08-subtask-J-index-sanity.md`.

---

### C8I2-003 — MED — trackCount drift accumulating on real published setlists (recompute heals, but cron not running)

**Lane:** §3 — trackCount drift-heal

**Steps:** `list_setlists({sort:"recent_event", limit:10})` → 6 candidates. Run
`recompute_setlist_track_count` on each.

**Observed:** 5/6 in-sync. 1 drifted: `UnjLqKTtS4lNKQfMY6hB` declared 45 / actual
30. Healed by the tool (idempotent — second call returned `drifted:false`).

**Implication:** Lane 3's claim of "6 drifted healed at ship time" still holds
for the original 6, but the underlying drift mechanic (some track-op path
doesn't update the denormalized counter atomically) is producing fresh drift
between would-be cron-fire windows. Combined with C8I2-001 (cron isn't
registered), drift accumulates indefinitely.

**Patch:** unblock C8I2-001 + add the C7I4-002 root-cause repro to the track-op
test pack. The drift-producer is the bug; recompute is a band-aid.

**Evidence:** `artifacts/06-recompute-and-delete-cascade.md`.

---

### C8I2-004 — MED — chart-bond cron breach-formula will fire false positives

**Lane:** §2 — chart-bond cron alerts cross-check

**Steps:** `verify_setlist_charts({setlistId:"UnjLqKTtS4lNKQfMY6hB"})`. Compare
the cron's per-setlist threshold formula `okCount/trackCount < 70%` to the
real bond-health ratio on a typical Shabbat-morning setlist.

**Observed:** Emor setlist: `trackCount:30, bondedCount:14, okCount:13,
missingCount:1`. 16 of 30 tracks are intentional `unbonded` section markers
(Pre Service, Birchot HaShachar, Drash, Closing, etc.). The fair "bonds
healthy" ratio is `okCount/bondedCount = 13/14 = 92.9%`. The cron's formula
returns `okCount/trackCount = 13/30 = 43.3%` → would fire a per-setlist
breach alert despite only 1 genuinely missing chart on 14 bonds.

**Expected:** any typical Shabbat-morning service has many intentional
unbonded rows; the cron will flag every one as breached, drowning real signal.

**Patch:** denominator should be `bondedCount`, with a floor like
`bondedCount >= 3` to suppress alerts on stub setlists.

**Evidence:** `artifacts/04-chart-bond-cron-evidence.md` §2.5.

---

### C8I2-005 — MED — reconcile_library `transient` bucket misclassifies persistent shortcut-bond rows

**Lane:** §4 — reconcile residuals

**Steps:** `reconcile_library({dryRun:true})`.

**Observed:** `transient.count:2` — down from Lane 3 OPEN-FOLLOWUP #1's ~20.
But the 2 surviving rows aren't Drive-API flake — they're
`application/vnd.google-apps.shortcut`-mimetype library_index rows that retry
will never heal:

```
{ fileId: "17TDzffOQT4ohO2p7yQCudUTYbj1tRg28", name: "Tu Bishvat.pdf",
  error: "library_index mimeType is application/vnd.google-apps.shortcut — re-bond to the shortcut target's fileId." }
{ fileId: "1jgs72zwhfEvqsqeeCFMw8Th7Zsk0mVJj", name: "Lechu Goldman.pdf",
  error: "library_index mimeType is application/vnd.google-apps.shortcut — re-bond to the shortcut target's fileId." }
```

`search_library "Lechu Goldman"` returns `[]` even though that file is in the
library — a real search-divergence pocket (the broken-shortcut row is filtered
out but no healthy alternate exists).

**Patch:** add a `needsRebond` bucket; resolve the shortcut target via the
cycle-6 Lane 1 (`87f4708fa`) Drive-shortcut helper and re-bond. Or mark the
two rows `orphaned` if Daniel doesn't want them auto-rebonded.

**Evidence:** `artifacts/07-orphan-and-reconcile.md`.

---

### C8I2-006 — LOW — admin-gate machine_code inconsistent (`forbidden` vs `forbidden_role`)

**Lane:** §1 — get_web_vitals_summary admin gate

**Steps:** `get_web_vitals_summary({sinceDays:7})` via prod /api/mcp with a
musician test bearer.

**Observed:** rich envelope with `machine_code: "forbidden"`, callerRole `musician`. Correct
behavior — but the bearer-mint lane (also `edb24a47c`) uses `forbidden_role`
for the same denial shape. Prompt §1.4 anticipated `forbidden_role`.

**Patch:** standardize all admin-role denials on `forbidden_role`. Trivial.

**Evidence:** `artifacts/03-web-vitals-admin-gate.json`.

---

### C8I2-007 — LOW — Instance-2 prompt §3.2 cites non-existent `force` arg on `delete_setlist`

**Lane:** §3 — delete-cascade probe

**Observed:** prompt says `delete_setlist({force:true})`. The deployed schema
has no `force` param — admin bypasses the ownership gate implicitly;
band_leader-not-owner gets `forbidden_owner`. Doc-only issue.

**Patch:** drop `{force:true}` from the prompt.

---

### C8I2-008 — LOW — reconcile_library `skippedNonChart.reason="drive_folder"` mislabels docs+spreadsheets

**Lane:** §4

**Observed:** the `reason` label `drive_folder` is applied to actual folder
mime (`application/vnd.google-apps.folder`) AND to `application/vnd.google-apps.document`
and `.spreadsheet` rows. Cosmetic; LOW.

**Patch:** sub-reasons by mime — `drive_folder` / `drive_doc` / `drive_sheet` / `audio` / `hidden_dotfile`.

**Evidence:** `artifacts/07-orphan-and-reconcile.md` §4.4.

---

### C8I2-009 — INFO — chart-bond cron first tick still in the future (overshadowed by C8I2-001)

The PARENT/dispatch noted the first scheduled tick at 2026-05-21 15:00 UTC. My
wall-clock at probe was 2026-05-19 22:33 UTC. Per §2 step 2 this would be the
"INFO + still-pending" branch — but C8I2-001 supersedes (cron will not fire on
the 21st either, because Vercel has nothing scheduled).

---

### C8I2-010 — INFO — web-vitals sink has only ~7 days of data (bootstrap recent)

`get_web_vitals_summary({sinceDays:30})` and `({sinceDays:90})` both return
`sampleCount:367` — identical to `sinceDays:7`. The field-RUM sink has only ~7
days of observations on prod (sink shipped recently). Not a bug; worth noting
when sizing CWV regression-detection windows.

---

### C8I2-011 — INFO — `musician_availability` composites have no live querier yet

`src/lib/mcp/tools/roster.ts` defers `set_unavailability` to a c1.5 phase. The
two musician_availability composites coder-1 KEPT are precautionary; no
deployed surface queries them today. Probing them is vacuously OK.

---

### C8I2-012 — INFO — dropped `setlists(isPublic, ...)` composites confirmed dead

`git grep -nE 'where\("isPublic'` against `src/**/*.ts(x)` returns zero
matches. The sole `setlist.isPublic` reference
(`src/app/api/setlist/resend-email/route.ts:68`) is a field read on an already-loaded
doc, not a Firestore query. Coder-1's DELETE recommendation is safe.

---

## §2 — Pre-flight reality

- Read `package.json`: next.js `^16.2.1` ✓
- Tools/list probe: `mint_admin_bearer`, `list_minted_bearers`, `revoke_minted_bearer`,
  `get_web_vitals_summary`, `recompute_setlist_track_count` all present at
  prod /api/mcp ✓
- `create_test_account({uidPrefix:"c8i2", role:"musician"})` mint succeeded
  (`test-c8i2-musician-477155d4`, tokenId `DXXEhNWTiL5ETTrY4FWP`); used + cleaned up.
- Probe.mjs not needed — every §1-§5 step was reachable via direct MCP tool
  calls + a single curl to `/api/mcp` for the admin-gate role-deny probe.

## §3 — Cleanup verification

`cleanup_all_test_data({prefix:"c8i2"})` returned `{removed:1,
aggregate:{mcpTokens:1, …all-zero}}`. Post-cleanup `list_test_accounts` shows
only c8i1 entries (Instance 1's territory — not touched). Post-cleanup
`sweep_orphan_test_data({uidPattern:"c8i2", dryRun:true})` returns
`orphans:[], scanned:{setlists:47, setlistTemplates:5}` — zero c8i2 residuals.

The `7e96f67c-2a11-41dd-ae75-543331553f81` setlist (the delete-cascade fixture)
was deleted in-flight via `delete_setlist` (returned `tracksDeleted:4`); post-delete
`get_setlist` returns clean `setlist_not_found`.

## §4 — Bearer burn notice

The supervisor-minted admin child bearer assigned to me at row
`ASSIGNMENT=cycle-8-instance-2` is now MARKED BURNED. I did not have edit
access to `C:\Users\dsbog\.claude\projects\C--Users-dsbog-centralreform-live\.supervisor-bearers`
from the Cowork mount (parent dir outside the mounted folder), so Daniel
should flip the row inline; or it TTL-expires by 2026-05-20T~06:00Z (8h TTL
per dispatch). I minted no admin children (Instance-1's job, not mine).

## §5 — Artifacts inventory

`.paul/research/cycle-8-instance-2-artifacts/` contains:
- `01-web-vitals-top-n.json` — get_web_vitals_summary top-N path
- `02-web-vitals-surface-filter.json` — surface filter across 5 routes + index-missing + validation
- `03-web-vitals-admin-gate.json` — musician-bearer 403 envelope
- `04-chart-bond-cron-evidence.md` — vercel.json gap + verify_setlist_charts sample
- `05-list-setlists-recent-event.json` — publishedAt:null pattern
- `06-recompute-and-delete-cascade.md` — recompute sweep + delete-cascade probe
- `07-orphan-and-reconcile.md` — orphan baseline + transient bucket misclassification
- `08-subtask-J-index-sanity.md` — `assignedAt` index direction regression

## §6 — Auditor handoff note

C8I2-001 and C8I2-002 are independently verifiable on the deployed surface:

- C8I2-001 — `curl -i https://www.centralreform.live/api/cron/verify-chart-bond-health`
  returns 401 + `x-matched-path` (route deployed); `git show origin/master:vercel.json`
  has no entry for that path.
- C8I2-002 — `tools/call suggest_band` against any non-empty setlistId reproduces
  the FAILED_PRECONDITION at prod; `git show origin/master:firestore.indexes.json`
  shows `assignedAt ASCENDING` against a query that orders DESC at
  `src/lib/mcp/tools/roster.ts:749`.

No defense-in-depth substitute needed — both are curl-able + git-pasteable.

*from coder-2*
