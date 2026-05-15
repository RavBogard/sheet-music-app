# v70-08 Best-Practice Audit — v7.0 Milestone

Synthesis of 5 parallel scope-narrowed dimension audits over the v7.0 milestone surface
(image-chart support, recordings data model, the document-driven setlist-import pipeline,
the setlist metadata editor). MCP territory excluded — separate workstream.

Full per-dimension detail: `v70-08-audit-{security,accessibility,performance,code-quality,ux-consistency}.md`.

---

## Summary

| Dimension | P0 | P1 | P2 | P3 |
|-----------|----|----|----|----|
| Security | 0 | 2 | 4 | 2 |
| Accessibility | 0 | 3 | 5 | 2 |
| Performance | 0 | 2 | 4 | 3 |
| Code quality + data integrity | 0 | 2 | 6 | 4 |
| UX consistency | 0 | 3 | 5 | 4 |
| **Raw total** | **0** | **12** | **24** | **15** |

**Cross-dimension de-duplication:** 2 findings were raised by two agents each — the
"no role gate on the 3 upstream import routes" finding (Security P1 + Code-Quality P1)
and the "`z.array(z.any())` write-route schemas" finding (Security P2 + Code-Quality P2).
The 3 Accessibility P1s are one root cause (the keyboard-unreachable dropzones cascade to
lock the whole flow) — counted as 1 unique finding here.

**Unique deduped count: P0: 0 · P1: 9 · P2: 22 · P3: 15.**

## Read-out

The v7.0 surface is in **good shape** — **zero P0 findings**. The core server-side write
path is sound: `ownerId` cannot be forged (always taken from `ctx.auth.uid`), the
`recordings` firestore.rules block is correct, the Firestore write correctness
(order fields, header interleaving, fileId binding, trackCount) all check out, rate
limiting is on every route, and there is no path-traversal or secret-leak vector.
v7.0 shipped a large surface fast and it holds up.

The recurring theme across three dimensions is the **doc-import pipeline's first three
routes** (`extract-document` / `extract-structure` / `resolve`) being gated only as
"any authenticated user" — a billed-Gemini-call + full-library-enumeration surface open
to every signed-in account, while only `commit-document` is correctly `band_leader`-gated.
That is the single finding I would prioritize first. The other P1 cluster is the
**ImporterModal**: its file-dropzones are unreachable by keyboard (which cascades to lock
the entire doc-import flow for keyboard/SR users), its "processing" screen shows
spreadsheet-only copy during document imports, and its interview "Back" button silently
throws away a 1–3 minute AI pipeline result.

**Nothing needs to be flagged to Daniel as an emergency** — the feature works at
synagogue scale and the gaps are hardening / polish / accessibility, not breakage. But
v7.0 should not close until the P1s are remediated (per constraint 12).

---

## P0 — Exploitable hole / data loss / shipped crash

**None.**

---

## P1 — Significant: prioritize for in-phase remediation

### [P1 · Security + Code Quality] No role gate on the 3 upstream doc-import routes
**Location:** `src/app/api/setlists/import/extract-document/route.ts`, `extract-structure/route.ts`, `resolve/route.ts`
Gated only by "any authenticated user" — any signed-in member can POST 25MB docs for
server-side parsing, drive billed Gemini calls (10/min), and enumerate the library via
`resolve` (which returns `{fileId, name}` pairs a `member` can't otherwise read). Only
`commit-document` is `band_leader`-gated.
**Fix:** Add `{ role: 'band_leader' }` to all three routes (the whole pipeline serves a
band-leader-only feature). The "matches import/parse" comment is not a justification.

### [P1 · Security] `recordings/file/[id]` falls back to forgeable `Sec-Fetch-*` headers
**Location:** `src/app/api/recordings/file/[id]/route.ts:22-31`, `src/lib/drive-file-auth.ts:31-37`
The recordings serving route is the sole access control for audio bytes (Admin SDK
bypasses Storage rules). It accepts a valid Bearer token **OR** browser fetch-metadata —
and the helper itself documents that `Sec-Fetch-*` is forgeable. Net effect: the
band-internal recordings collection is downgraded to "anyone with the (unguessable but
member-readable) ID."
**Fix:** Implement the session-cookie auth the helper's follow-up describes, or sign
short-lived playback URLs. If the proper fix is too large for this phase, document the
residual risk and fold-forward — but do not treat `recordings/file` as a true boundary.

### [P1 · Accessibility] ImporterModal file-dropzones unreachable by keyboard — cascades to the whole flow
**Location:** `src/components/setlist/importer/ImporterModal.tsx:355-373` (CSV), `:388-406` (Document)
Both dropzones are plain `<div onClick>` with no `tabIndex`/`role`/`onKeyDown`, and the
real `<input type="file">` is `display:none` — completely unreachable by keyboard. Because
document upload gates the entire doc-import flow, the (correctly-labelled) interview form
and preview are also keyboard-dead. No accessible name / programmatic state either.
**Fix:** Make each dropzone a real button (`role="button"`, `tabIndex={0}`, `aria-label`,
`onKeyDown`), or use `sr-only` + `<label htmlFor>` on the input (the pattern
`RecordingBindPopover` already uses correctly).

### [P1 · Performance] `getServerLibrary()` does a full uncached library scan on every resolve
**Location:** `src/lib/server-library.ts:20-81` ← `src/lib/setlist-import/resolve.ts:139`
Every interactive `/resolve` call reads the entire `library_index` collection — no
`.select()` projection, no caching, full Zod parse of every doc — then runs a Levenshtein
scan per track. O(library size) on a user-facing step, repeated on every retry, growing
unbounded.
**Fix:** `.select('name','mimeType')` projection + a short-lived server-side cache keyed
on the library's last-modified.

### [P1 · Performance] 3-route client chain re-ships full doc text; resolve fetch has no timeout
**Location:** `src/components/setlist/importer/ImporterModal.tsx:108-148`
`handleDocSubmit` makes 3 serial round-trips; the full extracted document text is shipped
down (step 1) then back up (step 2) as a pure client relay. The `resolve` fetch omits the
`timeout` option (steps 1-2 set 60s) and there is no `AbortController` — closing the modal
doesn't cancel in-flight work.
**Fix:** Add an explicit timeout to the resolve fetch + an `AbortController`. Optionally
persist the extracted text/structure server-side (keyed by an import-session id) and pass
only the id between client steps.

### [P1 · Code Quality] `commit-document` accepts any-shaped `eventDate` → `RangeError` → opaque 500
**Location:** `src/app/api/setlists/import/commit-document/route.ts:17` → `src/lib/setlist-write.ts:62-64`
`eventDate` is validated only as `z.string()`; an unparseable value reaches
`Timestamp.fromDate(new Date(value))` which throws a `RangeError` → generic 500. Latent
(ImporterModal always sends a valid `<input type=date>` value) but it is an untyped
server-side throw on a write path.
**Fix:** `z.string().refine(s => !Number.isNaN(Date.parse(s)), 'invalid date')` at the
schema boundary, mirroring the rigor already on `name`.

### [P1 · UX] Doc-import "processing" step shows spreadsheet-only copy
**Location:** `src/components/setlist/importer/ImporterModal.tsx:426-434`
During a document import the processing screen reads **"Analyzing Rows"** /
"map dynamic columns … verify Google Drive linkage" — none of which describes the doc
pipeline. It is the only thing the user sees for up to ~3 minutes, and it tells the wrong
story.
**Fix:** Branch the processing-panel copy on `isProcessingDoc` vs the CSV/URL path, or
genericize it ("Reading your file and building the setlist…").

### [P1 · UX] Interview "Back" button silently discards the entire AI pipeline result
**Location:** `src/components/setlist/importer/ImporterModal.tsx:623-625`
Interview-step "Back" → `setStep('input')`; pressing "Next" again re-runs the full 3-call,
~1-3 min pipeline and wipes any interview-form edits. Destructive step transition disguised
as ordinary back-navigation.
**Fix:** Remove the Back button from the interview step, or relabel it "Start over" and
reset doc state explicitly so the intent is honest.

### [P1 · UX] "Lead" used instead of the house term "Vocal Lead" in MobileRowCard
**Location:** `src/components/setlist/grid/MobileRowCard.tsx:292` (badge), `:418` (editor field label)
Project terminology rule is "Vocal Lead". The new ImporterModal correctly says "Vocal
Lead" — so the app is now internally inconsistent on the most-seen surface (the stage row
card).
**Fix:** Rename both labels to "Vocal Lead".

---

## P2 — Worth fixing; some pulled into the P1 plans, rest fold-forward

**Security:** doc uploads not MIME-validated before being fed to `mammoth`/`pdfjs` (+ no
PDF page cap) · `z.array(z.any())` write-route schemas defeat validation *(also raised by
Code Quality)* · `execute` route's server-side Drive fetch has no size cap · `recordings/upload`
doesn't verify `songId` exists / no `title`/`notes` length caps.

**Accessibility:** interview `<select>` is a raw element with no `focus-visible` ring ·
`<audio>` elements in RecordingBindPopover have no accessible name · ImageScoreViewer alt
text is a generic "Chart" fallback · ImageScoreViewer loading/error states not announced
(`role=status`/`alert`) · "missing chart" amber status text may fail AA contrast on the
glass background.

**Performance:** `mammoth`/`heic-convert` have no `import 'server-only'` guard ·
`extract-document` parses PDF pages strictly sequentially with no page cap *(page-cap
overlaps the Security finding above)* · `commit-document` has no `maxDuration` and
`createSetlistServerSide` does a non-atomic parent-set + separate batch-commit (combinable
into one ≤500-write batch) · `inferServiceType` is fed one large concatenated string
instead of a short-circuiting scan.

**Code quality:** large dead TanStack-table block in `SetlistGrid.tsx` (confirmed — several
hundred lines, unused imports, ~41 grid-dir tests still assert against it) · `commit-document`
route handler is untested (only the pure `commitDocumentSetlist` lib is covered) ·
`z.array(z.any())` schemas *(dup of Security)* · `Recording.durationSeconds` is in the model
+ UI but never written by the upload route · duplicated Levenshtein matcher across
`resolve.ts` and `import/parse/route.ts` · inconsistent API-error-body parsing between
ImporterModal's CSV path and doc-import path.

**UX consistency:** ImporterModal primary buttons hardcode `bg-blue-600` instead of
`bg-brand` (foreign hue vs the rest of v7.0) · preview header shows a raw ISO date string
(`2026-05-15`) instead of a formatted date · "Create Setlist" stays enabled when the
preview has zero tracks · RecordingBindPopover flashes a false "No recordings yet" while
the subscription loads · ImageScoreViewer error copy says "try refreshing" with no retry
affordance.

---

## P3 — Polish / fold-forward

**Security:** `extract-structure` returns raw Gemini output to the client (intentional) ·
Drive-imported chart `mimeType` trusted from a response header.
**Accessibility:** RecordingCell/chart-link touch targets are 40px on non-coarse pointers ·
MobileRowCard "No chart bound" uses `aria-label` on a non-interactive `<span>`.
**Performance:** preview-footer `resolved.tracks.filter()` not memoized · RecordingCell
`hasRecordings` never populated (by-design trade-off) · upload routes fully buffer files in
memory (fine at current scale).
**Code quality:** ImporterModal doc-import handlers untested · `commit.ts` `toSongInput` has
no `title` fallback while `execute` does · `extract-structure` route duplicates the lib's
empty-text check · `createApiHandler` leans on `any` defaults (bounded by the Zod schemas).
**UX consistency:** input step's 3 full-size dropzones force scroll on iPad portrait ·
mutually-exclusive import options give no "deselected" visual cue · processing step has no
cancel affordance · MobileRowCard inline-editor buttons are hand-rolled, not the shared `Button`.

---

## Routing

### In-phase remediation (P0 + P1, plus low-cost P2s that cluster naturally)

**Plan 02 — Import-route hardening (security + validation).** Backend; autonomous.
- Role-gate `extract-document` / `extract-structure` / `resolve` as `band_leader` (P1).
- Validate `eventDate` at the `commit-document` schema boundary (P1).
- Replace the `z.array(z.any())` schemas on `commit-document` + `execute` with the real
  Zod shapes — `SetlistStructureSchema` already exists, extend + reuse it (P2, cheap).
- Reject unsupported MIME early in `extract-document` + add a PDF page-count cap (P2, cheap).
- `recordings/file/[id]` weak `Sec-Fetch-*` auth (P1) — fix properly if feasible; if the
  session-cookie auth is too large for this phase, document the residual risk and
  fold-forward (it is inherited from the pre-existing `/api/drive/file` pattern).

**Plan 03 — ImporterModal accessibility + UX fixes.** Frontend; `/ui-ux-pro-max` BLOCKING.
- Make the file-dropzones keyboard-reachable + named (P1 — unblocks the whole flow).
- Branch the "processing" copy off the doc path (P1).
- Fix the destructive interview "Back" button (P1).
- Rename "Lead" → "Vocal Lead" in MobileRowCard (P1).
- Fold in cheap clustered P2s: `bg-blue-600` → `bg-brand`; format the preview ISO date;
  disable "Create Setlist" on a zero-track preview; interview `<select>` focus ring;
  `<audio>` aria-label; verify the amber status-text contrast; RecordingBindPopover
  loading state.

**Plan 04 — Doc-import performance.** Backend; autonomous.
- `getServerLibrary()` `.select()` projection + short-lived cache for the resolve path (P1).
- Add the resolve-fetch timeout + an `AbortController` to the client chain (P1).
- Fold in: `commit-document` `maxDuration` + single atomic batch write; `import 'server-only'`
  guards on `mammoth`/`heic-convert` (P2, cheap).

### Fold-forward (P2 + P3 not pulled into plans 02–04)

To v7.1 / backlog — do **not** author plans for these in v70-08:
- **Dead `SetlistGrid.tsx` TanStack-table block** — confirmed, several hundred lines + ~41
  stale tests. Sizable; deserves a dedicated cleanup phase (flagged across v70-03 already).
  *(Could optionally be pulled into v70-08 if Daniel wants the milestone to close cleaner,
  but it is genuinely P2 and out of the doc-import lane.)*
- Duplicated Levenshtein matcher (`resolve.ts` ↔ `import/parse`) — extract a shared module.
- `Recording.durationSeconds` model/writer mismatch — populate it or drop the field.
- `recordings/upload`: verify `songId` exists; add `title`/`notes` length caps.
- `execute` route Drive-fetch size cap; Drive-chart `mimeType` magic-byte sniff.
- ImageScoreViewer: required `alt` prop, `role=status`/`alert` on load/error, a Retry control.
- Test-coverage gaps: `commit-document` route handler, ImporterModal doc-import handlers.
- Touch-target 40px→44px baseline; MobileRowCard hand-rolled buttons → shared `Button`.
- Input-step scroll on iPad portrait; mutual-exclusivity visual cue; processing-step cancel.
- `extractApiError` helper to unify ImporterModal's two error-parsing idioms.
- `inferServiceType` short-circuit instead of one big concatenated string.
- `extract-structure` route's duplicate empty-text guard.
