# Cycle-10 Cowork — Instance 2: MCP post-fix verification + Cat-M (OPTIONAL secondary)

> **★ OPTIONAL secondary instance.** Per Daniel's 2026-05-28 reframe (`msg-cycle-10-usability-ipad-reframe-001`),
> cycle-10 is **usability/iPad-first** — the PRIMARY work is `cycle-10-cowork-instance-1-PROMPT.md`.
> This MCP post-fix verification is the **spin-only-if-time** secondary ("we can test the MCP too if
> you want"). Run it only if Instance 1 finishes with time/appetite, or as a separate follow-up
> session. The deterministic MCP-probe baseline (Cat-M) can alternatively ride the operational
> `npm run stress --surface=mcp` without a full cowork instance.
>
> **Drafted against deployed surface at origin/master `3155fb2881`** (the `drop-lyric-search` commit;
> repo un-shallowed, honest tools) — every tool name + Zod param + source path verified via
> `git cat-file -p` / `git ls-tree` / direct worktree read per `[[feedback_cowork_prompt_verify_before_write]]`.
> Read `cycle-10-cowork-PARENT.md` ONCE first (auth/META-003 §2, sandbox uidPrefix, ship policy §7).
> Full deployed-surface map: `.paul/research/cowork-stress-test-2026-05-26/MCP-INVENTORY.md`.
>
> **This instance is self-contained for the MCP regression matrix** (the PARENT's §4 is now the
> iPad-usability matrix; the MCP PROBE matrix lives here, below).

---

## You are cowork-Claude (cycle-10, instance 2)

Single-thread cowork-Claude session. Your job is **post-fix verification** of the 2026-05-27 MCP fix
wave on the deployed server at `https://www.centralreform.live/api/mcp`, plus first exercise of the
new Cat-M harness probes. ~75 minutes real wall-clock (`[[feedback_cowork_real_harness]]` — NOT a
walk-away). **Your default outcome is a clean all-HELD regression table with zero findings** — you
are confirming fixes, not hunting new bugs. Depth of evidence on each regression PROBE > breadth.

### Setup

1. **Endpoint:** `https://www.centralreform.live/api/mcp`
2. **Bearer:** Daniel pastes a root admin bearer (`crl_live_...`) at start (supervisor sources it via
   `node scripts/supervisor-prod-bearer.mjs` per `[[feedback_supervisor_bearer_persistence]]`).
   Authorization header on every JSON-RPC call. Never write the raw value into any file under
   `sheet-music-app/` (redact `crl_live_***redacted***`).
3. **Instance id / uidPrefix:** `c10i2` (lowercase, ≤6 chars). **Mandatory** — every
   `create_test_account({role, uidPrefix:"c10i2"})`. ★ **Cleanup-side param is `prefix`, not
   `uidPrefix`** — same value, different name (verified `src/lib/mcp/tools/test-tokens.ts`).
4. **Boot pre-flight (HARD-BLOCK → BLOCKER supervisor + stop on any failure):**
   - `tools/list` → confirm these 9 fix-touched tools present: `upload_chart`, `get_song`,
     `add_track_to_setlist`, `get_setlist`, `dedupe_library`, `salvage_chart_bytes`,
     `backfill_track_mimetype`, `archive_nonchart_artifacts`, `update_song`.
   - `create_test_account({uidPrefix:"c10i2", role:"musician"})` sanity mint →
     `cleanup_all_test_data({prefix:"c10i2"})` sanity sweep (confirm the param asymmetry).

### Envelope-shape contract — ★ CRITICAL ★

MCP validation surfaces as `result.isError:true` with prose in `content[].text`. It does **NOT**
surface as JSON-RPC `error.code:-32602` (`[[feedback_mcp_validation_shape]]`). Any finding that
quotes `-32602` for an input-validation refusal is misreading the response — re-check.

### Out of scope (hard boundaries)

- ⛔ **NO live X32 monitor writes** unless `get_bridge_health` → `x32Connected:true` AND Daniel
  confirms the desk is intentionally on. Probe `set_send_level`/`set_send_mute`/`set_bus_fader`/
  `set_matrix_fader`/`set_matrix_mute` at the validation-envelope layer only (bad params →
  refuse-envelope). Do NOT push faders.
- ⛔ **NO destructive writes against real setlists/library entries.** All writes go through
  `c10i2`-fixtures you created or `dryRun:true`.
- ⛔ **NO `publish_setlist` to real recipients** (gate-probe via fixtures + dryRun only).
- ⛔ **NO config-doc writes** (`config/monitor`, `config/storageBackup`, `config/bridgeHealth`).
- ⛔ **NO source modification.** Research-only. No worktree, no branch, no commit.
- ⛔ **OBSERVE/REPORT-ONLY pre-service** (PARENT §7.1) — Saturday 2026-05-30 is the B'nei Mitzvah; no
  risky fixes ship before it.
- ⛔ **F-002 lyric-search is DROPPED** — Daniel killed the feature 2026-05-27 (shipped at this very
  SHA `3155fb2881`). The `lyrics` scope no longer exists in `search_chart_text` (verified
  `SearchScope = "metadata" | "chords" | "all"`, `chart-text-search.ts:50`). Do NOT probe it as a
  feature — only the R-search retained-scope/clean-rejection check below.

---

## Regression-PROBE matrix (self-contained; the heart of this instance)

Each shipped fix is a PROBE. **A PROBE that behaves as the fix intended produces NO finding** (it
counts toward "probes executed"); a deviation produces a finding. Model these so a green run is
silent. All SHAs + source paths verified against `origin/master` at `3155fb2881`.

| ID | Fix (SHA) | Deployed surface (verified) | PROBE — pass = silent | Finding if… |
|----|-----------|------------------------------|------------------------|-------------|
| R-F001 | isError propagation (`1b2d5e0556`) | `src/lib/mcp/tools/index.ts` jsonResult region | a tool that errors returns `result.isError:true` + prose (NOT JSON-RPC `-32602`) | error swallowed, or `-32602` shape, or `isError` missing |
| R-F005 | dedupe honesty (`1b2d5e0556`) | `src/lib/mcp/tools/library.ts` (`wouldMark`/`committed`) | `dedupe_library({dryRun:true})` → `wouldMark:N, committed:0`; refused real-run also `committed:0` | `committed>0` on dryRun/refused, or legacy `duplicatesMarked` returns |
| R-F007 | salvage prose (`1b2d5e0556`) | `src/lib/mcp/tools/salvage-chart-bytes.ts` | refusal prose names NO `library_index/{id}` internal path | prose leaks a Firestore doc path / internal field |
| R-F008 | backfill force honesty (`1b2d5e0556`) | `src/lib/mcp/tools/backfill-track-mimetype.ts` (`forceWithoutCommit`) | `backfill_track_mimetype({force:true})` (no `dryRun:false`) → `forceWithoutCommit:true` + writes 0 | `{force:true}` alone silently commits |
| R-F010 | Unicode dedup (`d2c4936197`) | `src/lib/library/recompute-index-name-fields.ts` (`/[^\p{L}\p{N}]/gu` + NFKC) | Hebrew / Arabic / emoji titles → distinct `normalizedName`; no false fuzzy-collide | two distinct non-Latin titles collapse to same key / falsely dedup |
| R-F015 | input sanitize (`1b2d5e0556`) | `src/lib/mcp/server-tracks-write.ts` | `update_track` notes/title with control-char/null-byte → stripped cleanly, no 500/stack | 500, stack trace, or silent corruption |
| R-F016 | catalog dual-read write (`c71f41bed4`) | `src/lib/mcp/tools/song-metadata.ts` `applySongMetadata` | `upload_chart({key,bpm})` then `get_song` shows key/bpm (reaches `songs/{id}.defaults`) | `get_song` key/bpm null after upload (original F-016 bug) |
| R-F017 | bond bpm denorm (`c71f41bed4`) | `src/lib/mcp/server-songs.ts` (`bpm` on `ResolvedTrackBond`) | bond an uploaded chart onto a fixture setlist → `get_setlist` track row carries key AND bpm | bonded row missing bpm (or key, for an upload-only song) |
| R-arch | bulk soft-archive (`5c0674ab9a`) | `archive_nonchart_artifacts` registered in `index.ts`; reconcile skips `archived` | `archive_nonchart_artifacts({dryRun:true})` idempotent across 2 calls; archived rows vanish from `reconcile_library` scan | non-idempotent, or archived rows still appear in reconcile |
| R-dedup | canonical picker (`d4c441f8fb`) | `src/lib/mcp/tools/library.ts` `isGoogleAppsMime` predicate | dup group with PDF + Google-Doc → `dedupe_library({dryRun:true})` picks the real-bytes PDF canonical, demotes the Google-Doc | Google-Doc wins canonical over a real-bytes PDF |
| R-force | FU-1 Part A `force_required` (`fb9a137b4c`) | `backfill-track-mimetype.ts` / `salvage-chart-bytes.ts` / `archive-nonchart-artifacts.ts` force-gates | a real-run refusal (no `force`, no `dryRun:false`) → rich `{ok:false, error:{machine_code:"force_required", code:409}}` (surfaces `isError:true`) with a `dryRunPlan` | legacy `refused:true` shape, missing `dryRunPlan`, or 500 |
| R-search | drop-lyric-search retained scopes (`3155fb2881`) | `src/lib/mcp/tools/chart-text-search.ts` (`SearchScope = "metadata"\|"chords"\|"all"`, `:50`) | `search_chart_text({scope:"metadata"})` + `{scope:"chords"})` + `{scope:"all"})` all return results (or clean empty); `{scope:"lyrics"}` is REJECTED by the Zod enum as a refuse-envelope (`isError:true`), NOT a 500 | a retained scope broke, OR `lyrics` 500s instead of clean-rejecting |
| R-web-a11y | WCAG AA contrast | Perform/editor accents | `npm run stress --categories=J` (axe) → 0 contrast/aria violations | axe flags a contrast / aria regression |

**Known-OPEN (document as INFO, keep noise low — DO NOT fix):**
- **`dedupe_library`'s force-gate is HELD** (still plain `refused:true`, not the rich
  `force_required` envelope — supervisor decision pending). If you hit it, that's a known-open INFO,
  not a regression. R-force covers the three migrated tools only.
- **FU-1 Part B (HTTP-500→4xx reclass; F-014/F-010-code-2) is BLOCKED** on finding-source → if a
  Cat-A envelope probe hits a 500 that should be a 4xx, record ONE INFO row citing FU-1 Part B; don't
  re-litigate.

---

## Part 1 — Regression PROBEs (the core; ~45 min)

For each row above, run the PROBE and record HELD / REGRESSED / N-A in your HANDOFF's lead
regression table. **A HELD probe produces NO finding.** Run cheap → setup-heavy:

### Group A — envelope-honesty probes (no fixtures; ~10 min)

1. **R-F001 (isError):** call any tool with a bad arg, e.g.
   `update_track({setlistId:"nope", trackId:"nope", patch:{}})`. Confirm `result.isError:true` +
   prose, NOT `-32602`. → HELD unless swallowed/wrong-shape.
2. **R-F005 (dedupe honesty):** `dedupe_library({dryRun:true})` → `wouldMark:N` + `committed:0` (NOT
   legacy `duplicatesMarked`). Then `dedupe_library({})` (no dryRun, no force) → refuse-envelope,
   still `committed:0`. → HELD. **Note:** `dedupe_library`'s force-gate refusal is the FU-1 HELD case
   (still plain `refused:true`) — a known-open INFO, NOT a regression.
3. **R-F007 (salvage prose):** `salvage_chart_bytes({})` + `salvage_chart_bytes({fileId:"ghost"})` →
   refusal prose names NO `library_index/{id}` internal path. → HELD.
4. **R-F008 (backfill force honesty):** `backfill_track_mimetype({force:true})` (NO `dryRun:false`) →
   `forceWithoutCommit:true`, writes 0. → HELD.
5. **R-force (FU-1 Part A, `fb9a137b4c`):** real-run refusal on each migrated tool —
   `backfill_track_mimetype({dryRun:false})`, `salvage_chart_bytes({fileId:"<c10i2 fixture>", dryRun:false})`,
   `archive_nonchart_artifacts({dryRun:false})` — all WITHOUT `force`. Each → rich
   `{ok:false, error:{machine_code:"force_required", code:409}}` (`isError:true`) with a `dryRunPlan`,
   NOT legacy `{ok:true,refused:true}`. → HELD unless legacy shape / missing plan / 500.
6. **R-F015 (input sanitize):** after Group C setup, `update_track({setlistId, trackId, patch:{notes:"a\x00bc"}})`
   with embedded control/null bytes → stripped cleanly, no 500, no stack, no silent corruption. → HELD.

### Group B — dedupe canonical picker (dryRun-only; ~5 min)

7. **R-dedup (canonical picker, `d4c441f8fb`):** `dedupe_library({dryRun:true})`, inspect per-group
   canonical picks. For any group with BOTH a real-bytes PDF and a Google-Apps row
   (`application/vnd.google-apps.*`), confirm the **PDF is picked canonical** and the Google-Doc
   demoted (`isGoogleAppsMime`; Lane probe found 13 such groups, all PDF-canonical). No mixed group →
   N-A. → HELD / N-A. ⛔ Do NOT run a real (non-dryRun) dedupe — Daniel's single-owner step.

### Group C — chart upload round-trip (fixtures; ~15 min)

8. `upload_chart({title:"c10i2-stress-1", fileBase64:"<tiny valid PDF base64>", mimeType:"application/pdf", key:"G", bpm:84})`.
   Capture the returned `fileId`.
9. **R-F016 (dual-read write):** `get_song({id:fileId})` → confirm `defaults.key:"G"` +
   `defaults.bpm:84` present (the fix routes key/bpm through `applySongMetadata` into
   `songs/{id}.defaults`). Original bug returned null. → HELD.
10. Cross-read coherence (`[[project_catalog_dual_read_surfaces]]`): `list_library({q:"c10i2-stress-1"})`
    + `search_library({query:"c10i2-stress-1"})` → both agree on key/bpm with `get_song`. Divergence
    = finding.
11. **R-F017 (bond bpm denorm):** `create_setlist({title:"c10i2-stress-setlist", isTest:true})`, then
    `add_track_to_setlist({setlistId, songId:fileId})`. `get_setlist({setlistId})` → track row carries
    BOTH `key:"G"` AND `bpm:84` (F-017 added `bpm` to `ResolvedTrackBond`). → HELD unless bpm/key
    missing.

### Group D — unicode + bulk-archive + retained search scopes (fixtures; ~15 min)

12. **R-F010 (Unicode dedup, `d2c4936197`):** upload three non-Latin-title fixtures:
    `c10i2 אדון עולם`, `c10i2 أمزينج جريس`, `c10i2 🎵🎶`. After each, `get_song` round-trips the title
    verbatim (no mojibake) AND `dedupe_library({dryRun:true})` does NOT fuzzy-collide them with each
    other or with `c10i2-stress-1` (NFKC + `/[^\p{L}\p{N}]/gu` → distinct `normalizedName`). → HELD
    unless any two collide.
13. **R-arch (bulk soft-archive idempotence, `5c0674ab9a`):** `archive_nonchart_artifacts({dryRun:true})`
    twice → identical candidate set (idempotent); a known-archived row does NOT reappear in
    `reconcile_library({dryRun:true})`'s scan (reconcile skips `archived`). → HELD unless
    non-idempotent or archived rows leak. ⛔ dryRun-only.
14. **R-search (drop-lyric-search retained scopes, `3155fb2881`):** verify the RETAINED scopes still
    work post-removal:
    - `search_chart_text({query:"c10i2-stress-1", scope:"metadata"})` → returns the fixture.
    - `search_chart_text({query:"<a chord token>", scope:"chords"})` → results (or clean empty, no 500).
    - `search_chart_text({query:"c10i2-stress-1", scope:"all"})` → union works.
    - `search_chart_text({query:"x", scope:"lyrics"})` → expect a CLEAN refuse-envelope (`isError:true`;
      the scope was removed from the Zod enum), NOT a 500. → HELD unless a retained scope broke or
      `lyrics` 500s.

---

## Part 2 — Cat-M harness probe baseline (~10 min)

Run the Lane-C MCP probes once and fold the result into your HANDOFF:
```
npm run stress -- --surface=mcp --bearer="<your admin bearer>" --run-id=c10i2-mcp
```
Runs `cycle-4/harness/probes/*.mjs` (`server-tools-list`, `get-bridge-health`, `list-setlists`,
`role-gate-musician-refusal`) → emits `REPORT-stress-c10i2-mcp.md` in `cycle-4/harness/out/`. Copy it
into your artifacts dir. The role-gate probe mints `test-musician-*` under uidPrefix `stress-c7` and
revokes by uid — distinct from your `c10i2`. A clean run = 4 probes executed, 0 findings (Lane-C
baseline: ~108 tools, bridge health envelope, ≥1 setlist, musician refusal envelope confirmed).

---

## Part 3 — FU-1 known-opens (document only, ~5 min)

**FU-1 known-opens (INFO only, do NOT re-litigate):** the `dedupe_library` force-gate is HELD (still
`refused:true`) and FU-1 Part B (HTTP-500→4xx reclass; F-014/F-010-code-2) is BLOCKED on
finding-source. If you incidentally hit either, record ONE INFO row each citing the FU-1 queue.

---

## Cleanup (end-of-run, ~5 min) — MANDATORY before HANDOFF-COMPLETE

```
1. delete_chart({fileId}) for EACH upload (c10i2-stress-1 + the 3 unicode fixtures)
2. delete_setlist({setlistId:"<c10i2 fixture>", force:true})
3. cleanup_all_test_data({prefix:"c10i2"})   // ← prefix, NOT uidPrefix
4. Verify zero residual:
   - list_test_accounts() → none matching c10i2
   - search_library({query:"c10i2"}) → empty
   - list_setlists({limit:50}) → no c10i2 fixtures
```
If prefix-scoped cleanup partially fails, capture the envelope + list orphans by fileId/setlistId/uid
under "Manual cleanup needed". Daniel sweeps.

---

## Report format

Write to `.paul/research/cycle-10-cowork-instance-2-HANDOFF.md`. **Lead with the regression table**,
then any new findings.

```markdown
# Cycle-10 Cowork Instance-2 HANDOFF — MCP post-fix verification

**Run date:** 2026-05-2?T<hh:mm>Z
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
| R-search | retained scopes post drop-lyric-search | … | … |
| Cat-M | harness probe baseline | … | 4 probes / N findings |

## Summary
- Probes executed: <n>
- Findings: <n> (BLOCKER:<n> / HIGH:<n> / MED:<n> / LOW:<n> / INFO:<n>)
- Charts uploaded: <n> / deleted: <n> · Test accounts: <n> / swept: <n>

## Findings  (only REGRESSED probes + genuinely new issues; FU-1 known-opens = INFO)
### C10I2-001 — <title>
- **SUT:** <tool>
- **Severity:** BLOCKER|HIGH|MED|LOW|INFO
- **Repro:** <exact JSON-RPC call + bearer role>
- **Expected:** <what the fix predicted>
- **Actual:** <envelope verbatim; redact any bearer>
- **Hypothesis:** <suspected source location, or "unclear">

## Repros  (prod-SHA-stamped transcripts for every load-bearing finding)

## Manual cleanup needed  (only if a fixture was created-but-not-deleted)
```

**Severity calibration** (MCP): BLOCKER = data loss / role bypass / prod-write from unprivileged
role / 500+stack / atomic-guard orphan. HIGH = silent corruption / dual-read divergence / missing
refuse-gate / envelope leaks internal path. MED = envelope shape inconsistency / misleading dryRun /
wrong-tier rate-limit. LOW = unclear prose / stale schema desc. INFO = the FU-1 known-opens +
non-bug observations.

Finally: ACK + HANDOFF-COMPLETE to `.coord/inbox/supervisor.md` signed
`from cycle-10-cowork-instance-2`, citing the regression verdict + findings count + load-bearing IDs.

Go.
