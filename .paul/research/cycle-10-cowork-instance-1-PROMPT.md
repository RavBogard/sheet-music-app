# Cycle-10 Cowork — Instance 1: MCP post-fix verification + Cat-M

> **Drafted 2026-05-27 against deployed surface at origin/master `97c294c621`** (FU-1 + R-search
> deltas re-checked at `fb9a137b4c`) — every tool name + Zod param + source path below verified
> via `git show origin/master:<path>` / `git ls-tree origin/master` per
> `[[feedback_cowork_prompt_verify_before_write]]`. Read `cycle-10-cowork-PARENT.md` ONCE first.
> Full deployed-surface map: `.paul/research/cowork-stress-test-2026-05-26/MCP-INVENTORY.md`.
>
> **Verify-before-write checklist applied:** (1) 9 fix-touched tools confirmed in source ✓
> (2) every regression-PROBE param cross-checked against deployed source ✓ (3) fix SHAs
> mapped from `git log` ✓ (4) memory rules tagged proposal-shape vs deployment-shape ✓
> (5) SHA-bound claims tied to `97c294c621`/`fb9a137b4c` ✓

---

## You are cowork-Claude (cycle-10, instance 1)

Single-thread cowork-Claude session. Your job is **post-fix verification** of the 2026-05-27
MCP fix wave on the deployed server at `https://www.centralreform.live/api/mcp`, plus first
exercise of the new Cat-M harness probes. ~75 minutes real wall-clock (per
`[[feedback_cowork_real_harness]]` — NOT a walk-away). **Your default outcome is a clean
all-HELD regression table with zero findings** — you are confirming fixes, not hunting new
bugs. Depth of evidence on each regression PROBE > breadth.

### Setup

1. **Endpoint:** `https://www.centralreform.live/api/mcp`
2. **Bearer:** Daniel pastes a root admin bearer (`crl_live_...`) at start. Authorization
   header on every JSON-RPC call. Never write the raw value into any file under
   `sheet-music-app/`.
3. **Instance id / uidPrefix:** `c10i1` (lowercase, ≤6 chars). **Mandatory** — every
   `create_test_account({role, uidPrefix:"c10i1"})`. ★ **Cleanup-side param is `prefix`, not
   `uidPrefix`** — same value, different name (verified at `97c294c621`).
4. **Boot pre-flight (HARD-BLOCK → BLOCKER supervisor + stop on any failure):**
   - `tools/list` → confirm these 9 fix-touched tools present: `upload_chart`, `get_song`,
     `add_track_to_setlist`, `get_setlist`, `dedupe_library`, `salvage_chart_bytes`,
     `backfill_track_mimetype`, `archive_nonchart_artifacts`, `update_song`.
   - `create_test_account({uidPrefix:"c10i1", role:"musician"})` sanity mint →
     `cleanup_all_test_data({prefix:"c10i1"})` sanity sweep (confirm the param asymmetry).

### Envelope-shape contract — ★ CRITICAL ★

MCP validation surfaces as `result.isError:true` with prose in `content[].text`. It does
**NOT** surface as JSON-RPC `error.code:-32602` (memory `[[feedback_mcp_validation_shape]]`).
Any finding that quotes `-32602` for an input-validation refusal is misreading the response —
re-check. "expect refuse-envelope" everywhere below = the `isError:true` shape.

### Out of scope (hard boundaries)

- ⛔ **NO live X32 monitor writes** unless `get_bridge_health` → `x32Connected:true` AND Daniel
  confirms the desk is intentionally on. Probe `set_send_level`/`set_send_mute`/`set_bus_fader`/
  `set_matrix_fader`/`set_matrix_mute` at the validation-envelope layer only (bad params →
  refuse-envelope). Do NOT push faders.
- ⛔ **NO destructive writes against real setlists/library entries.** All writes go through
  `c10i1`-fixtures you created or `dryRun:true`.
- ⛔ **NO `publish_setlist` to real recipients** (gate-probe via fixtures + dryRun only).
- ⛔ **NO config-doc writes** (`config/monitor`, `config/storageBackup`, `config/bridgeHealth`).
- ⛔ **NO source modification.** Research-only. No worktree, no branch, no commit.
- ⛔ **F-002 lyric-search is DROPPED from scope** — Daniel killed the feature 2026-05-27. Do
  NOT probe `search_chart_text({scope:'lyrics'})` as a feature. (Part 3 has the one allowed
  retained-scope check.)

---

## Part 1 — Regression PROBEs (the core; ~45 min)

For each row in PARENT §4, run the PROBE and record HELD / REGRESSED / N-A in your HANDOFF's
lead regression table. **A HELD probe produces NO finding** — only a REGRESSED one does. Run
in this order (cheap → setup-heavy):

### Group A — envelope-honesty probes (no fixtures; ~10 min)

1. **R-F001 (isError):** call any tool with a bad arg, e.g.
   `update_track({setlistId:"nope", trackId:"nope", patch:{}})`. Confirm `result.isError:true`
   + prose, NOT `-32602`. → HELD unless swallowed/wrong-shape.
2. **R-F005 (dedupe honesty):** `dedupe_library({dryRun:true})`. Confirm the report carries
   `wouldMark:N` + `committed:0` (NOT the legacy `duplicatesMarked`). Then `dedupe_library({})`
   (no dryRun, no force) → refuse-envelope, still `committed:0`. → HELD.
   **Note:** `dedupe_library`'s force-gate refusal is the FU-1 HELD case (still plain
   `refused:true`, not the rich `force_required` envelope). If you see `refused:true` here
   that's a known-open INFO, NOT a regression — see R-force below for the migrated tools.
3. **R-F007 (salvage prose):** `salvage_chart_bytes({})` (refuse) + `salvage_chart_bytes({fileId:"ghost"})`.
   Confirm the refusal prose names NO `library_index/{id}` internal Firestore path. → HELD.
4. **R-F008 (backfill force honesty):** `backfill_track_mimetype({force:true})` (NO
   `dryRun:false`). Confirm it reports `forceWithoutCommit:true` and writes 0 rows. → HELD.
5. **R-force (FU-1 Part A `force_required`, `fb9a137b4c`):** trigger a real-run refusal on each
   migrated tool — `backfill_track_mimetype({dryRun:false})`, `salvage_chart_bytes({fileId:"<c10i1 fixture>", dryRun:false})`,
   `archive_nonchart_artifacts({dryRun:false})` — all WITHOUT `force`. Confirm each returns the
   rich `{ok:false, error:{machine_code:"force_required", code:409}}` (surfaces `isError:true`)
   carrying a `dryRunPlan`, NOT the legacy `{ok:true,refused:true}`. → HELD unless legacy shape
   / missing plan / 500.
6. **R-F015 (input sanitize):** after Group C setup, `update_track({setlistId, trackId, patch:{notes:"a bc"}})`
   with embedded control/null bytes. Confirm stripped cleanly — no 500, no stack trace, no
   silent corruption of surrounding text. → HELD.

### Group B — dedupe canonical picker (dryRun-only; ~5 min)

7. **R-dedup (canonical picker, `d4c441f8fb`):** `dedupe_library({dryRun:true})` and inspect the
   per-group canonical picks. For any group containing BOTH a real-bytes PDF and a Google-Apps
   row (`application/vnd.google-apps.*`), confirm the **PDF is picked canonical** and the
   Google-Doc demoted (the `isGoogleAppsMime` demotion; Lane probe found 13 such groups, all
   PDF-canonical). If no mixed group exists, mark N-A. → HELD / N-A.
   ⛔ Do NOT run a real (non-dryRun) dedupe — Daniel's single-owner groups-7/9 step.

### Group C — chart upload round-trip (fixtures; ~15 min)

8. `upload_chart({title:"c10i1-stress-1", fileBase64:"<tiny valid PDF base64>", mimeType:"application/pdf", key:"G", bpm:84})`.
   Capture the returned `fileId`.
9. **R-F016 (dual-read write):** `get_song({id:fileId})` → confirm `defaults.key:"G"` +
   `defaults.bpm:84` present (the fix routes `upload_chart` key/bpm through `applySongMetadata`
   into `songs/{id}.defaults`, not just `library_index`). Original bug returned null. → HELD.
10. Cross-read coherence (`[[project_catalog_dual_read_surfaces]]`): `list_library({q:"c10i1-stress-1"})`
    + `search_library({query:"c10i1-stress-1"})` → both agree on key/bpm with `get_song`.
    Divergence = finding.
11. **R-F017 (bond bpm denorm):** `create_setlist({title:"c10i1-stress-setlist", isTest:true})`,
    then `add_track_to_setlist({setlistId, songId:fileId})`. `get_setlist({setlistId})` →
    confirm the track row carries BOTH `key:"G"` AND `bpm:84` (the F-017 fix added `bpm` to
    `ResolvedTrackBond`). → HELD unless bpm (or key) missing.

### Group D — unicode + bulk-archive (fixtures; ~10 min)

12. **R-F010 (Unicode dedup, `d2c4936197`):** upload three fixtures with non-Latin titles:
    `c10i1 אדון עולם`, `c10i1 أمزينج جريس`, `c10i1 🎵🎶`. After each, `get_song` round-trips the
    title verbatim (no mojibake) AND `dedupe_library({dryRun:true})` does NOT fuzzy-collide them
    with each other or with `c10i1-stress-1` (the NFKC + `/[^\p{L}\p{N}]/gu` normalize → distinct
    `normalizedName`). → HELD unless any two collide.
13. **R-arch (bulk soft-archive idempotence, `5c0674ab9a`):** `archive_nonchart_artifacts({dryRun:true})`
    twice. Confirm the candidate set is identical across the two calls (idempotent) and a
    known-archived row does NOT reappear in `reconcile_library({dryRun:true})`'s scan (reconcile
    skips `archived` status). → HELD unless non-idempotent or archived rows leak. ⛔ dryRun-only.

---

## Part 2 — Cat-M harness probe baseline (~10 min)

Run the Lane-C MCP probes once and fold the result into your HANDOFF:
```
npm run stress -- --surface=mcp --bearer="<your admin bearer>" --run-id=c10i1-mcp
```
This runs `cycle-4/harness/probes/*.mjs` (`server-tools-list`, `get-bridge-health`,
`list-setlists`, `role-gate-musician-refusal`) → emits `REPORT-stress-c10i1-mcp.md` in
`cycle-4/harness/out/`. Copy that REPORT into your artifacts dir. The role-gate probe mints
`test-musician-*` under uidPrefix `stress-c7` and revokes by uid — distinct from your `c10i1`.
Any probe finding here is a Cat-M finding; a clean run = 4 probes executed, 0 findings (Lane-C
baseline: 109 tools, bridge v10.0.6, 20 setlists, musician refusal envelope confirmed).

---

## Part 3 — search_chart_text retained-scopes + FU-1 known-opens (document only, ~5 min)

**R-search [PENDING coder-4 drop-lyric-search lane]:** if the `drop-lyric-search` lane has
landed by the time you run (check `tools/list` / the deployed `chart-text-search.ts` scope
enum), verify the RETAINED scopes still work:
- `search_chart_text({query:"<c10i1-stress-1>", scope:"metadata"})` → returns the fixture.
- `search_chart_text({query:"<a chord token>", scope:"chords"})` → returns results (or a clean
  empty, no 500).
- `search_chart_text({query:"x", scope:"lyrics"})` → expect a CLEAN refuse-envelope (the scope
  was removed), NOT a 500. → HELD unless a retained scope broke or `lyrics` 500s.
If the drop lane has NOT landed yet, mark R-search N-A and note "drop-lyric-search not on master
at run SHA".

**FU-1 known-opens (INFO only, do NOT re-litigate):** the `dedupe_library` force-gate is HELD
(still `refused:true`) and FU-1 Part B (HTTP-500→4xx reclass; F-014/F-010-code-2) is BLOCKED on
finding-source. If you incidentally hit either, record ONE INFO row each citing the FU-1 queue.

---

## Cleanup (end-of-run, ~5 min) — MANDATORY before HANDOFF-COMPLETE

```
1. delete_chart({fileId}) for EACH upload (c10i1-stress-1 + the 3 unicode fixtures)
2. delete_setlist({setlistId:"<c10i1 fixture>", force:true})
3. cleanup_all_test_data({prefix:"c10i1"})   // ← prefix, NOT uidPrefix
4. Verify zero residual:
   - list_test_accounts() → none matching c10i1
   - search_library({query:"c10i1"}) → empty
   - list_setlists({limit:50}) → no c10i1 fixtures
```
If prefix-scoped cleanup partially fails, capture the envelope + list orphans by
fileId/setlistId/uid under "Manual cleanup needed". Daniel sweeps.

---

## Report format

Write to `.paul/research/cycle-10-cowork-instance-1-HANDOFF.md`. **Lead with the regression
table**, then any new findings.

```markdown
# Cycle-10 Cowork Instance-1 HANDOFF — MCP post-fix verification

**Run date:** 2026-05-3?T<hh:mm>Z
**Bearer role:** admin (Daniel-pasted root) — crl_live_***redacted***
**Master SHA at run:** <from a deployed probe or git log>
**Cleanup state:** [clean / partial — list orphans]

## Regression verdict: [ALL HELD / N REGRESSED]

| PROBE | Fix | Verdict | Evidence (envelope excerpt / repro) |
|-------|-----|---------|-------------------------------------|
| R-F001 | isError propagation | HELD/REGRESSED/N-A | … |
| R-F005 | dedupe wouldMark/committed | … | … |
| R-F007 | salvage prose | … | … |
| R-F008 | backfill forceWithoutCommit | … | … |
| R-force | FU-1 force_required (3 tools) | … | … |
| R-F010 | Unicode dedup | … | … |
| R-F015 | input sanitize | … | … |
| R-F016 | dual-read write | … | … |
| R-F017 | bond bpm denorm | … | … |
| R-arch | bulk-archive idempotence | … | … |
| R-dedup | canonical picker | … | … |
| R-search | retained scopes post-drop | … | … |
| Cat-M | harness probe baseline | … | 4 probes / N findings |

## Summary
- Probes executed: <n>
- Findings: <n> (BLOCKER:<n> / HIGH:<n> / MED:<n> / LOW:<n> / INFO:<n>)
- Charts uploaded: <n> / deleted: <n> · Test accounts: <n> / swept: <n>

## Findings  (only for REGRESSED probes + genuinely new issues; FU-1 known-opens = INFO)
### C10I1-001 — <title>
- **SUT:** <tool>
- **Severity:** BLOCKER|HIGH|MED|LOW|INFO
- **Repro:** <exact JSON-RPC call + bearer role>
- **Expected:** <what the fix predicted>
- **Actual:** <envelope verbatim; redact any bearer>
- **Hypothesis:** <suspected source location, or "unclear">

## Repros  (prod-SHA-stamped transcripts for every load-bearing finding)

## Manual cleanup needed  (only if a fixture was created-but-not-deleted)
```

**Severity calibration** (same as 5/26): BLOCKER = data loss / role bypass / prod-write from
unprivileged role / 500+stack / atomic-guard orphan. HIGH = silent corruption / dual-read
divergence / missing refuse-gate / envelope leaks internal path. MED = envelope shape
inconsistency / misleading dryRun report / wrong-tier rate-limit. LOW = unclear prose / stale
schema desc. INFO = the FU-1 known-opens + non-bug observations.

Finally: ACK + HANDOFF-COMPLETE to `.coord/inbox/supervisor.md` signed
`from cycle-10-cowork-instance-1`, citing the regression verdict + findings count +
load-bearing IDs.

Go.
