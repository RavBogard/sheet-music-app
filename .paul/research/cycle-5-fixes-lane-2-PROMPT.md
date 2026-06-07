# Cycle-5-fixes Lane 2 — Drive + gig-packet production-impact

You are `cycle5-fixes-2-drive-pkt`, a coder lane in the cycle-5-fixes
parallel wave. Source-of-truth scoping:
`sheet-music-app/.paul/research/cycle-5-fixes-TRIAGE.md` (Lane 2
section). Read it now before any code.

**This lane closes a real production-data leak.** Per C5C-006, every
Friday gig packet has been printed with `Lechu Goldman` (and any other
Drive-shortcut-bonded chart) silently missing. Daniel-priority HIGH.

---

## §1 — Identity, branch, worktree

- **Lane ID:** `cycle5-fixes-2-drive-pkt`
- **Branch:** `feat/cycle5-fixes-2-drive-pkt`
- **Worktree:** `sheet-music-app-cycle5-fixes-2-drive-pkt/`
- **Base SHA:** `6dbc106bc`
- **Estimated:** 3-4h

## §2 — Coord startup (mandatory)

1. Read `sheet-music-app/.coord/README.md` (push protocol amendments).
2. Read `sheet-music-app/.coord/shared/master-tip.md`.
3. Read `sheet-music-app/.coord/shared/decisions.md` — focus on
   2026-05-18T18:45Z (cycle-3 envelope sweep — REG-002 rich envelope
   canonical) and `[[feedback_dryrun_is_observability]]` /
   `[[feedback_upload_atomicity]]` / `[[feedback_dedup_force_override]]`.
4. Read `sheet-music-app/.coord/agents.md` — find your row.
5. Read this prompt's referenced triage: Lane 2 section.
6. ACK msg-001 to supervisor inbox confirming startup + base SHA.

## §3 — Scope (5 findings + 1 backfill decision)

From triage Lane 2:

- **C5C-006 MED (HIGH-IMPACT)** — `generate_gig_packet` refuses Drive
  shortcuts as "unsupported MIME" while `DriveClient.getFile()`
  resolves them transparently (reads `shortcutDetails.targetId`,
  downloads target). Real prod impact: Lechu Goldman.pdf
  (`fileId=1jgs72zwhfEvqsqeeCFMw8Th7Zsk0mVJj`) is a shortcut, currently
  silently missing from every Friday Shir Shabbat packet. Fix: route
  gig-packet's per-row fetch through `DriveClient.getFile()`'s
  transparent-resolve path.
- **C5C-007 MED** — `search_library` returns row
  `cf704b73-5f35-45fe-901f-a8b68d4fdc22` ("Hashkiveinu (Brodsky-Zweiback)")
  with `status:'active'` despite Drive 404 on the underlying bytes.
  Chart-health pre-flight detects this at publish/packet time but
  earlier prevention is preferred. Fix: extend `reconcile_library`
  hygiene to flip `status:'active'` → `'orphaned'` when Drive 404 +
  Storage byte absent. Reuse chart-health pre-flight verdict logic.
- **C5C-008 MED** — `import_chart_from_drive` lacks `dryRun` per F-05
  policy. Fix: add `dryRun:boolean` schema arg + handler branch
  returning `{predictedTitle (post-normalize), dedupScore,
  dedupMatchedRow, targetStoragePath, aiEnrichmentPlan,
  wouldCommit:false}` without writing. Match the
  `bulk_update_tracks` / `publish_setlist` dryRun shape.
- **C5C-009 MED** — `import_chart_from_drive` returns `code:500` for
  logical 409 (dup) and 404 (Drive file not found). Fix: map upstream
  errors to canonical HTTP semantics: 409 for `duplicate_detected_in_library`,
  404 for `drive_file_not_found`, 403 for `drive_permission_denied`.
  Drive API returns distinct error hints — use them.
- **C5C-015 LOW** — `import_chart_from_drive` on a folder ID emits
  "export to PDF in Drive first" hint. Nonsensical for folders. Fix:
  branch the error message — folder → "pass a file id, not a folder
  id (pick a chart PDF inside the folder)"; Docs/Sheets/Slides → keep
  existing export-to-PDF guidance.
- **Backfill decision (Daniel-discussion):** the gig-packet read-path
  fix (C5C-006 option a) closes the bug WITHOUT touching library_index
  rows. Option b is to re-bond library_index rows pointing at Drive
  shortcuts to the resolved target's fileId. Lower-risk: option a only.
  Surface as a separate phase if Daniel wants the backfill.

## §4 — Hard boundaries

- **NO touch to** repo-root `mcp/`, `bridge/`, `SetlistGrid.tsx`.
- **NO touch to** `src/lib/mcp/errors.ts` / `error-envelopes.ts` —
  envelope foundation read-only (use existing `richError` factory).
- **NO touch to** Lane 5's MCP envelope work without HEADS-UP — there
  may be overlap on `src/lib/mcp/tools/library-upload.ts` (Lane 5 has
  the salvage-422 fix C5D-011). Coordinate via claims.md.
- **NO live writes against real prod data.** All probe writes use
  `isTest:true` + `test-5L2-` prefix.

## §5 — Tests + build (required before push)

- Emulator test for `generate_gig_packet` against a mock-Drive
  shortcut entity (the existing `mcp-gig-packet.emulator.test.ts`
  fixture is the home).
- `dryRun` unit test for `import_chart_from_drive` asserting
  `wouldCommit:false` + no library_index write + no Storage write.
- Rich-envelope conformance test for the new machine_codes
  (`duplicate_detected_in_library`, `drive_file_not_found`,
  `drive_permission_denied`).
- `reconcile_library` test exercising the new orphaned-status flip on
  Drive 404.
- `next build --webpack` clean; full unit suite green.
- Emulator suite full green (cycle-4 fixture-residuals landed at
  `6dbc106bc` — should be 0 failures pre-change; if you regress
  anything, fix before push).

## §6 — Push protocol

Standard cycle-5-fixes pattern:

1. `git fetch origin && git rebase origin/master`.
2. Re-run tests + emulator suite.
3. `git push origin feat/cycle5-fixes-2-drive-pkt:master`.
4. SHIP-NOTICE to supervisor inbox with:
   - Final SHA
   - Lechu Goldman repro: pre-fix gig-packet shows the shortcut in
     missingCharts; post-fix the resolved target is in the packet body.
     If possible, exercise this against the real production library row
     (read-only — no writes to library_index).
   - dryRun verification matrix (predicted vs actual write-suppressed).
   - Reconcile hygiene unit test PASS.
   - Open follow-ups (e.g. how many real-prod library rows point at
     Drive shortcuts — survey via `list_library` + grep response shape;
     surface count to Daniel for the backfill decision).
   - Worktree teardown request.

## §7 — Coordination contract

- Claim `src/lib/mcp/tools/library-upload.ts` (heavy edits) + `src/lib/mcp/tools/gig-packet/**` (NEW shortcut-resolve path) + `src/lib/google-drive.ts` (read-only verification you're using the right method) + `src/lib/mcp/tools/reconcile-library.ts` (hygiene extension).
- HEADS-UP Lane 5 (`cycle5-fixes-5-mcp-envelope`) if their salvage-422
  C5D-011 work touches the same `library-upload.ts` file region — they
  may need to rebase your envelope code mapping.

Go.
