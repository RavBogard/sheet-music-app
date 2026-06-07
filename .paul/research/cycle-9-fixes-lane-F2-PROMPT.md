# Cycle-9-fixes — Lane F2 (catalog hygiene + roster correctness)

**You are coder-2.** Sign `from coder-2`.
**Anchor:** branch off `origin/master` @ current tip `552e79aa1` in a FRESH
`git worktree` (`sheet-music-app-cycle9-fixes-f2/`). NOT the canonical checkout.
Your old hardening-A worktree stays held for teardown — leave it.
**Bearer:** pool row `ASSIGNMENT=cycle-9-fixes-f2`. Mark `burned` on SHIP.
**Tier:** Tier-1 (real src + deployed verify). Deployed REPROs required.
**Source of truth:** `.paul/research/cycle-9-sweep-TRIAGE.md` §1/§2.

---

## Mission — 6 tasks (catalog hygiene + roster)

### Task 1 — C9I2-001: broken-bond rows in search / add_track  `[HIGH]`
`search_library` returns (and `add_track` will bind) `library_index` rows that
are `status:'active'` but whose chart bytes 404 — silently producing dead charts
in the weekly authoring flow. Investigate the existing chart-status machinery
(`verifySetlistCharts` / `getChartStatus` / `needsSync` already detect dead/
missing bytes) and reuse it to: filter or clearly flag dead-byte rows in
`search_library` results, AND warn/refuse on `add_track` binding a dead-byte row.
Don't invent a new detection path if one exists. REPRO: a known dead-byte row
(e.g. the broken `Lechu Goldman` shortcut) no longer silently returns as a clean
bindable result.

### Task 2 — C9I3-002: shortcut rows need re-bond (not transient)
`reconcile_library` still misclassifies 2 `application/vnd.google-apps.shortcut`
rows (`Tu Bishvat.pdf`, `Lechu Goldman.pdf`) as `transient` — retry can't heal
them. Add a `needsRebond` bucket, OR auto-resolve the shortcut target via the
cycle-6 Lane-1 shortcut-resolver helper (`87f4708fa`). REPRO: `reconcile_library
({dryRun:true})` classifies those 2 as `needsRebond` (or resolves them).

### Task 3 — C9I3-004: storageUrl ≠ actualStoragePath for text/image
`library_index.storageUrl` (via `extForContentType`) writes `.txt/.png/.jpg`
suffixes that don't exist at the real Storage path (`actualStoragePath` returns
no extension for those mimes) → consumers reading `storageUrl` directly get 404.
Align `storageUrl` to the real path. Files: `index-row-builder` / `library-upload.ts`.
REPRO: a text/image row's `storageUrl` resolves (no 404).

### Task 4 — C9I3-005: upload reverse-orphan window
HEIC + MuseScore conversion paths upload `originals/{fileId}.{ext}` BEFORE the
Firestore batch, but the compensating-delete only removes `realStoragePath` — not
the `originals/` artifact. Extend the compensating-delete to cover the originals
blob so a Firestore-commit failure leaves no reverse orphan. File:
`src/lib/library-upload.ts` (`processChartUpload` guard). REPRO: a forced
Firestore-failure injection (or a clear unit/emulator test) shows originals/ is
rolled back.

### Task 5 — C9I4-001: `list_musicians_on_date` blind to ISO eventDate  `[latent-HIGH]`
Every current setlist stores `eventDate` as an ISO STRING; the tool's range
query only matches Firestore Timestamps, so "who's playing on date X" returns
`matchedSetlists:[]` for every real setlist. The follow-up grep noted in
`src/lib/mcp/tools/roster.ts:402-415` was never implemented — implement it (match
ISO-string eventDate rows in the date window too). REPRO: a date with a real
setlist (e.g. `2026-05-13` → `Ikl0sS4XcZil0Z04viAu`) returns that setlist.

### Task 6 — C9I4-004: instrument normalization in suggest_band
Free-text `instrument` values ("Guitar"/"Drums") don't count toward
`suggest_band` coverage even though those musicians play them. `suggest_musicians`
already loose-matches — apply the same normalization in `suggest_band`'s
coverage-gap check. File: `roster.ts`. REPRO: a setlist needing guitar coverage
counts a "Guitar" free-text musician as filling it.

---

## Coordination

- **Shared file with Lane F1: `src/lib/mcp/tools/library.ts`.** You touch the
  `searchLibrary` projection region (Task 1); F1 touches the `dedupe_library`
  handler (~688). Different functions — claim YOUR region in
  `.coord/shared/claims.md` + HEADS-UP `inbox/coder-1.md`. Cherry-pick onto fresh
  origin/master if it diverges (narrow-lane caveat).
- `roster.ts` is F2-exclusive (Tasks 5+6). `library-upload.ts` / reconcile are F2-exclusive.

## Hard rules

Do NOT touch `bridge/**`, repo-root `mcp/`, `SetlistGrid.tsx`,
`src/lib/mcp/errors.ts`, `src/lib/mcp/error-envelopes.ts`. Do NOT tune the dedup
0.85 threshold (`[[feedback_dedup_force_override]]`).

## Gates before SHIP

1. `npm run test:emulator` green (incl. new tests for the broken-bond filter +
   list_musicians_on_date ISO match + reverse-orphan rollback).
2. `next build --webpack` clean.
3. Push to master (Vercel auto-deploy) + `firebase deploy --only firestore:indexes`
   IF you add any index (automatable per `[[feedback_firebase_cli]]`).
4. Deployed-surface REPROs (paste transcripts): dead-byte row no longer clean in
   search; reconcile needsRebond; list_musicians_on_date returns a real setlist.

## SHIP protocol

1. Clean commits. Push to `origin master` (NOT `master:main`).
2. OVERWRITE `.coord/shared/master-tip.md` with the new SHA.
3. SHIP-NOTICE to `inbox/supervisor.md` (`from coder-2`) with REPRO transcripts.
4. Mark bearer row `burned`. Hold worktree for auditor ACCEPT + supervisor teardown.

### ACK
Append `msg-from-coder-2-cycle9-F2-ack` to `inbox/supervisor.md` after worktree
setup + branch cut + read + the library.ts claim/HEADS-UP. Then start with Task 1.
