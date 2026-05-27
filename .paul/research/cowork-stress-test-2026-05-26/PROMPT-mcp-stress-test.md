# Cowork stress test — MCP server (centralreform.live)

> **Drafted 2026-05-26 against deployed surface at origin/master `32dca1a6df`** —
> tool inventory + Zod-schema params verified directly from `tools/list` + source.
> See `MCP-INVENTORY.md` in this directory for the full deployed-surface map.
>
> **Verify-before-write checklist applied per `[[feedback_cowork_prompt_verify_before_write]]`:**
> (1) tool inventory cross-checked deployed↔source (108↔108, zero drift) ✓
> (2) every param cited below cross-checked against deployed Zod input schema ✓
> (3) filesystem paths verified via `git ls-tree origin/master` ✓
> (4) memory rules distinguished as proposal-shape vs deployment-shape (see "Memory corrections" §) ✓
> (5) SHA-bound claims tied to `32dca1a6df` ✓

---

## You are cowork-Claude

You are a single-thread cowork-Claude test session. Your job is to find bugs in the
deployed MCP server at `https://www.centralreform.live/api/mcp`. You have ~75 minutes
of real wall-clock work (per `[[feedback_cowork_real_harness]]` — NOT 6-8h walk-away).
Be focused; quantity of probes matters less than depth of evidence on each finding.

### Setup

1. **Endpoint:** `https://www.centralreform.live/api/mcp`
2. **Bearer:** Daniel will paste a root admin bearer token (`crl_live_...`) into your session at start.
   Use it for the Authorization header on every JSON-RPC call.
3. **Instance id:** Generate a short unique id for this run, e.g. `cowork-mcp-20260526a`.
   You'll use this as the `uidPrefix` for all test fixtures you create. **Mandatory** —
   parallel sibling sessions in other tabs are doing the same; a global cleanup with no
   `prefix` will sweep their fixtures and yours.
4. **Cleanup contract** (read TWICE before starting):
   - Create test accounts via `create_test_account({ role, uidPrefix: "<your-id>" })`.
   - At end-of-run, sweep your fixtures via `cleanup_all_test_data({ prefix: "<your-id>" })`.
     ⚠️ **NOTE THE NAME MISMATCH**: create-side is `uidPrefix`, cleanup-side is `prefix`.
     Same value, different param name. Verified against source 2026-05-26.
   - If you orphan an account you can't sweep, list it in your final report under
     "Manual cleanup needed" — don't call cleanup without `prefix` to "tidy up", you'd
     trample the sibling sessions.

### Out of scope (hard boundaries)

- ⛔ **NO live X32 monitor writes** unless `get_bridge_health` returns `x32Connected: true`
  AND Daniel confirms (in-band) that the desk is intentionally on. Memory
  `[[project_band_ipads_incognito_state]]` + the monitor recovery protocol both treat
  the live desk as not-to-be-touched without explicit Daniel go-ahead. `set_send_level` /
  `set_send_mute` / `set_bus_fader` / `set_matrix_fader` / `set_matrix_mute` against a
  cold desk fabricate phantom commands. **Probe these tools at the validation envelope
  layer only** (intentionally bad params → expect refuse-envelope; bad uid → expect role
  envelope). Do **NOT** push faders.
- ⛔ **NO destructive writes against real setlists or library entries.** The catalog +
  setlists are PROD. All writes go through fixtures you created or `dryRun:true`.
- ⛔ **NO mint-bearer chain.** `mint_admin_bearer` works root-depth-1 only — don't try to
  mint from your bearer (depth cap rejects it); that's expected behavior, not a bug, and
  not worth a finding row unless the error envelope is wrong.
- ⛔ **NO writes to `setlists/*` belonging to Daniel or David** unless via `dryRun:true`.
- ⛔ **NO modifying configuration documents** (`config/monitor`, `config/storageBackup`,
  `config/bridgeHealth`).

### Envelope-shape contract (memory `[[feedback_mcp_validation_shape]]`)

★ **CRITICAL** ★ — MCP validation surfaces as `result.isError: true` with prose content in
the `content[]` array. It does **NOT** surface as JSON-RPC `error.code: -32602`. Probes
that assert the wrong shape (4th-wrong-target failure) are rejected. Concretely:

```json
// CORRECT shape for a Zod-schema-rejection or runtime-validation refusal:
{
  "jsonrpc": "2.0",
  "id": <n>,
  "result": {
    "isError": true,
    "content": [{ "type": "text", "text": "...prose error..." }]
  }
}

// WRONG — the server does NOT use this for input-validation failures:
{
  "jsonrpc": "2.0",
  "id": <n>,
  "error": { "code": -32602, "message": "..." }
}
```

Every probe below that says "expect refuse-envelope" or "expect role-envelope" is asking
for the `result.isError: true` shape. Findings that quote `-32602` are likely
misinterpreting the response — re-check.

---

## Probe categories

> The deployed surface is 108 tools. You will NOT cover every one in 75 minutes — DON'T
> try. Pick representative tools per category and probe deeply. Quote actual envelopes;
> screenshots / raw JSON > narrative.

### A — Envelope validation (~15 min, ~15-20 probes)

Pick 8 write tools spanning categories. For each, send ONE intentionally-bad-param call
and record the envelope. Targets:

1. `update_track({ setlistId: "nope", trackId: "nope", patch: {} })` — invalid IDs
2. `bulk_update_tracks({ setlistId: "<real-id>", patches: [], mode: "atomic" })` — empty array
3. `update_track({ setlistId: "<real-id>", trackId: "<real-id>", patch: { type: "garbage" } })` — invalid enum
4. `assign_monitor_bus({ busIndex: 99, uid: "nope" })` — out-of-range busIndex
5. `set_send_level({ busIndex: 1, channelIndex: 1, level: 5.0 })` — out-of-range level (must be 0..1)
6. `upload_chart({ title: "x", fileBase64: "not-base64", mimeType: "application/pdf" })` — invalid base64
7. `publish_setlist({ setlistId: "ghost-id" })` — non-existent setlist
8. `import_chart_from_drive({ driveFileId: "bogus" })` — bogus Drive id

For each, record:
- The envelope shape (isError:true vs JSON-RPC error vs something else)
- The exact text in `content[0].text`
- Whether the error is structured (richError shape with `code`/`hint`/`fields`) or bare prose

**Finding-worthy** = inconsistent envelope shape across tools, swallowed errors, or
revelation of an internal stack trace / firebase doc path.

### B — DryRun audit (~10 min, 8-10 probes)

26 tools expose `dryRun`. Probe these 6 representatives:

1. `update_song({ id: "<real-song-id>", key: "C#", dryRun: true })` — verify no write
2. `bulk_update_tracks({ setlistId: "<real-id>", patches: [...], dryRun: true })` — verify no write
3. `publish_setlist({ setlistId: "<real-id>", dryRun: true })` — verify no email + no audit row
4. `assign_monitor_bus({ busIndex: 1, uid: "test-<your-prefix>-musician-...", dryRun: true })` — verify no doc write
5. `backfill_track_mimetype({ dryRun: true })` — verify report-only
6. `dedupe_library({ dryRun: true })` — verify no merges

For each:
- Call `dryRun:true`, capture the report.
- Read back via `get_setlist` / `get_song` / `list_monitor_buses` / etc. to confirm
  the underlying doc is byte-identical (no `updatedAt` bump).
- Call again without `dryRun` (or `dryRun:false`) on a SAFE target (fixture or non-prod
  field) and confirm the report shape matches what dryRun predicted.

**Finding-worthy** = `dryRun:true` mutated state, OR the dryRun report disagreed with
the real-write report on a clean replay.

### C — Force-gate refusals (~10 min, 6-8 probes)

24 tools expose `force`. The contract per `[[feedback_dryrun_is_observability]]`:
without `dryRun:true`, destructive ops refuse unless `force:true`. Probe:

1. `dedupe_library({})` — no dryRun, no force → expect refuse-envelope describing the
   refuse-gate; quote it.
2. `dedupe_library({ force: true })` — only if you have a SAFE fixture; otherwise skip.
3. `reconcile_library({})` — refuse-envelope expected.
4. `salvage_chart_bytes({})` — refuse-envelope expected.
5. `backfill_track_mimetype({ force: true })` — admin-only behavior; verify
   trusted-leader rate-limit bypass per `[[feedback_admin_rate_limit_bypass]]`.
6. `delete_chart({ fileId: "ghost-id" })` — chart-not-found envelope (no force required;
   guard is the bonded-track check, not refuse-gate).

**Finding-worthy** = `force:false` was accepted on a destructive op, OR the refuse
envelope said something misleading (e.g. cites `dryRun:false` when the actual block was
a missing role).

### D — Role-gate confirmation (~10 min)

Use `create_test_account` with role variations:

```
A = create_test_account({ role: "admin", uidPrefix: "<your-id>" })       // bearer
B = create_test_account({ role: "band_leader", uidPrefix: "<your-id>" })
C = create_test_account({ role: "musician", uidPrefix: "<your-id>" })
D = create_test_account({ role: "member", uidPrefix: "<your-id>" })
```

(Each returns a bearer. Hold them; you'll Authorization-header-swap.)

For 3 representative tools per role tier, send a call from each role and record
the envelope:

- `delete_setlist({ setlistId: "<fixture-id>" })` from C (musician) and D (member) →
  expect role-envelope rejection; quote exact text.
- `assign_monitor_bus(...)` from C (musician) → expect role-envelope rejection.
- `bridge_resync({})` from B (band_leader) → expect SUCCESS (per
  `bridge-recovery.ts:assertEditor` — band_leader IS trusted-leader for the SAFE
  bridge ops `bridge_resync`/`bridge_reconnect`/`bridge_selftest`. Only the
  outage-causing `bridge_restart` (+ housekeeping/clear_pending) is admin-only via
  `assertAdmin`. F-018 verdict 2026-05-27: the prior "expect rejection" here was a
  STALE PROMPT, not a privilege-escalation bug — see `.coord/audits/cowork-mcp-2026-05-26-VERIFY.md`).
- `mint_admin_bearer({ purpose: "test" })` from A (admin, but NOT root since A's bearer
  was itself minted) → expect rejection (depth-1 cap).

**Finding-worthy** = a role got through that shouldn't, OR a role was rejected that
should have access per the inventory.

### E — Atomic-guard probe on chart uploads (~10 min)

Per `[[feedback_upload_atomicity]]`, PCU surfaces (upload_chart / save_scraped_chart /
finalize_chart_upload / import_chart_from_drive) must atomic-guard every Storage /
Firestore mutation. Probe:

1. Upload a small fixture PDF via `upload_chart({ title: "<your-id>-stress-1", fileBase64: "...", mimeType: "application/pdf" })`. Capture the returned `fileId`.
2. Verify via `get_song({ id: fileId })` — `defaults.key` / `defaults.bpm` populated as expected.
3. Verify via `list_library({ limit: 5, sort: "recent" })` — the new entry appears with
   matching key/bpm.
4. Use `search_chart_text({ query: "<your-id>-stress-1", scope: "metadata" })` — entry surfaces.
5. Use `search_chart_text({ query: "<text-content-from-pdf>", scope: "lyrics" })` — entry surfaces
   if `searchableText` was extracted at PCU time (per coder-2's f4-lyric-search-persistence-mod).
6. Cross-tool consistency check (per `[[project_catalog_dual_read_surfaces]]`):
   - `get_song` reads from `songs/{id}.defaults`
   - `list_library` reads from `library_index/{id}`
   - Both should agree on key + bpm. **Divergence = finding.**
7. Call `delete_chart({ fileId })` to clean up. Verify it's gone everywhere.

**Finding-worthy** = a surface returned the chart on one route but not another, OR the
five fields (key, bpm, leadMusician, title, searchableText) disagreed across routes.

### F — Edge-case input (~10 min, 6-8 probes)

1. Hebrew title: `upload_chart({ title: "אדון עולם — STRESS <your-id>", ... })` — verify
   `get_song` round-trips the title verbatim, no mojibake.
2. Arabic title: `upload_chart({ title: "أمزينج جريس — STRESS <your-id>", ... })`.
3. Emoji title: `upload_chart({ title: "🎵 STRESS <your-id> 🎶", ... })`.
4. Long title: 300-char title. Either accepted with truncation note, or refused with
   clean envelope; **either is fine** — finding is on a silent truncation with no signal.
5. Empty patch: `update_track({ setlistId: "<real-id>", trackId: "<real-id>", patch: {} })` —
   probably accepted as no-op; record envelope.
6. Null-byte injection: `update_track({ ..., patch: { notes: "abc def" } })` —
   verify the null byte survives or is sanitized cleanly; finding is on a 500 / stack
   trace / silent drop.
7. `update_track({ ..., patch: { key: "C#minor (extended)" } })` — verify key field
   accepts the variant or rejects with clean envelope.
8. `bulk_update_tracks({ setlistId: "<real-id>", patches: [<50 patches>] })` — at the
   schema limit; verify accepted or clean refuse if it's actually `<50`.

**Finding-worthy** = silent corruption, 500/stack trace, or refusal-prose that names an
internal field name.

### G — Rate-limit + trusted-leader bypass (~5-10 min)

1. Find a low-tier tool the bearer is rate-limited on (e.g. `clone_setlist` —
   description flags rate-limited).
2. Flood ~12 calls in <10 seconds; expect rate-limit envelope around call ~10 (band_leader
   should hit the limit; ROOT admin may bypass via `isTrustedLeader`).
3. If your bearer is `admin` AND root, you should NOT hit the limit — verify by quoting
   the response shape and the rate-limit headers if they're exposed.
4. Repeat with a `member` test bearer (account D from §D) — should hit the limit
   noticeably sooner if the bypass logic is correct.

**Finding-worthy** = a member bypassed the limit, OR an admin hit the limit (bypass
failed), OR the rate-limit envelope leaks the bucket-key shape.

### H — Cross-tool catalog dual-read consistency (~5-10 min)

For the chart you uploaded in §E:

1. `get_song({ id: fileId })` — read `key`, `bpm`, `defaults.leadMusician`
2. `list_library({ q: "<your-id>-stress-1" })` — read same fields
3. `search_library({ query: "<your-id>-stress-1" })` — read same fields
4. `search_chart_text({ query: "<your-id>-stress-1", scope: "metadata" })` — read same fields
5. If you bonded it onto a setlist via `add_track_to_setlist({ setlistId: "<fixture>", songId: fileId })`,
   then `get_setlist` should show the track row with key/bpm denormalized.

Then mutate via `update_song({ id: fileId, key: "Eb", bpm: 96 })`. Re-read all 5 surfaces.

**Finding-worthy** = any surface disagrees on key/bpm AFTER the mutation propagates
(give ~5 sec for projections). Per `[[project_catalog_dual_read_surfaces]]`, both songs
+ library_index must update via `applySongMetadata` — divergence is a known historical
bug class, still worth catching.

---

## Cleanup (end-of-run, ~5 min)

```
1. delete_chart({ fileId: <each upload you made> })
2. cleanup_all_test_data({ prefix: "<your-id>" })  // sweeps your test accounts + bonded fixtures
3. Verify nothing of yours remains:
   - list_test_accounts() — none matching your prefix
   - search_library({ query: "<your-id>" }) — empty
   - list_setlists({ limit: 50 }) — no fixtures matching your prefix
```

If the prefix-scoped cleanup partially fails, capture the envelope and list orphans by
fileId / setlistId / uid in your final report under "Manual cleanup needed". Daniel will
sweep them.

---

## Report format

Write findings to `.paul/research/cowork-stress-test-2026-05-26/REPORT-mcp-stress-test-<your-id>.md`.

Use this structured-row format. Findings without all columns won't be triageable.

```markdown
# MCP stress-test report — <your-id>

**Run date:** 2026-05-26T<hh:mm>Z
**Bearer role:** admin
**Bearer source:** Daniel-pasted root bearer
**Master SHA at run time:** <git log -1 origin/master via the API or skip>
**Cleanup state:** [clean / partial — list orphans]

## Summary

- Probes executed: <n>
- Findings: <n>  (BLOCKER:<n> / HIGH:<n> / MED:<n> / LOW:<n> / INFO:<n>)
- Tools touched: <n>
- Test accounts created: <n>
- Charts uploaded: <n>

## Findings

### F-001 — <one-line title>
- **SUT (system under test):** <tool name>
- **Severity:** BLOCKER | HIGH | MED | LOW | INFO
- **Repro:** <exact JSON-RPC call + Authorization-bearer-role>
- **Expected:** <what the inventory + memory rules predicted>
- **Actual:** <what came back; paste the envelope verbatim, redact bearer if any leaked>
- **Hypothesis:** <where in the codebase you suspect the bug, OR "unclear">

### F-002 — ...
```

**Severity calibration:**
- **BLOCKER** — data loss, role bypass, prod-write from an unprivileged role, 500 with
  stack trace, atomic-guard violation that left a Storage object orphaned from its
  Firestore row.
- **HIGH** — silent corruption, dual-read divergence, refuse-gate missing on a destructive
  op, envelope leaks internal field names or doc paths.
- **MED** — envelope shape inconsistency, dryRun returned a misleading report,
  rate-limit fired late / wrong-tier.
- **LOW** — error prose unclear, schema description out of date, redundant validation
  layer.
- **INFO** — observation worth a follow-up but not bug-shaped (e.g. "23 backfill tools
  but no dryRun on `backfill_heal_metadata`'s `force` counterpart").

---

## Memory corrections found during pre-flight (apply to MEMORY.md as needed)

These are gaps Daniel's supervisor / coder-7 surfaced while drafting this PROMPT:

1. `[[project_mcp_status]]` cites "24 tools live" — actual deployed surface is **108**.
2. `[[feedback_sandbox_test_isolation]]` says "matching uidPrefix at cleanup_all_test_data" —
   actual cleanup param is `prefix`, not `uidPrefix`. (Same value semantics; just different
   field name.)

Bake these corrections into your cowork session's working knowledge BEFORE you start.

---

## What I (cowork-Claude) am NOT being asked to do

- **Not** running the website / iPad. (That's a SEPARATE cowork PROMPT —
  `PROMPT-web-stress-test.md` in this directory.)
- **Not** fixing bugs. Find them; ship them to the report; supervisor + a coder lane
  triage.
- **Not** doing full-tool coverage. 108 tools × 75 min = ~40s per tool, which is not
  enough for evidence-worthy findings. Pick a representative subset per category and
  go DEEP.
- **Not** modifying any source. PROMPT lane is research-only.

Go.
