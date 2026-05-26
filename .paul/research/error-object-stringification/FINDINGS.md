# Error-object stringification FINDINGS

Lane: `error-object-stringification` (Tier 1, P3 UI polish). Goal: stop UI
surfaces from rendering `"[object Object]"` when an `unknown` error is a
rich envelope object instead of an `Error` instance.

## Scope

Per dispatch:

> Trace every `${err}` / `String(err)` / `err.toString()` near
> chart-load + library-load + setlist-import error handlers.
> Plus: `<…>{err}<` JSX patterns.

Canonical grep:

```
git grep -nE '\$\{err\b|String\(err|err\.toString\(' src/components/ src/app/
git grep -nE '<.*>\{err\}<' src/
```

Run on 2026-05-26 against worktree
`sheet-music-app-error-stringification/` cut from `9784b1f49`.

## Sites IN SCOPE (user-facing UI surfaces)

The dispatch's hard boundary is "no refactoring error-handling logic in
route handlers / MCP tools — they already return correct envelopes." So
`src/app/api/**` route handlers and all of `src/lib/**` are OUT — they
are envelope **producers** and their internal logging strings are not
user-visible. The bug is in **UI presentation layer** consumers.

Final in-scope site list (11 sites across 7 files):

| # | file:line | catch shape                                                                | classification              | target sink                     |
|---|-----------|-----------------------------------------------------------------------------|-----------------------------|---------------------------------|
|  1 | `src/app/(main)/DashboardClient.tsx:195`                       | `err instanceof Error ? \`${err.name}: ${err.message}\` : String(err)` | (c) unknown shape — Firestore subscription error  | `setSubscriptionError(msg)` (UI alert) |
|  2 | `src/app/(main)/manage/library-review/page.tsx:43`             | `err instanceof Error ? err.message : String(err)`               | (c) — SSR initial-load catch                  | `initialError` prop → Client UI alert         |
|  3 | `src/app/(main)/manage/library-review/LibraryReviewClient.tsx:75`  | same pattern                                                 | (c) — refresh-queue error                    | `setError(...)` (UI alert)                    |
|  4 | `src/app/(main)/manage/library-review/LibraryReviewClient.tsx:165` | same pattern                                                 | (c) — Approve/reject/dismiss action error    | `toast.error(...)`                            |
|  5 | `src/components/setlist/grid/SetlistMetaEditSheet.tsx:161`     | `err instanceof Error ? \`Couldn't save setlist details: ${err.message}\` : "Couldn't save setlist details"` | (a)/(b)-mixed; loses envelope.error.message for non-Error | `toast.error(...)` |
|  6 | `src/components/admin/UserRow.tsx:99`                          | `e instanceof Error ? e.message : String(e)`                     | (c) — role-update error                       | `toast.error(...)`                            |
|  7 | `src/components/admin/UserRow.tsx:126`                         | same pattern                                                 | (c) — sound-engineer toggle error             | `toast.error(...)`                            |
|  8 | `src/components/admin/UserRow.tsx:160`                         | same pattern                                                 | (c) — delete-user error                       | `toast.error(...)`                            |
|  9 | `src/components/music/PDFViewer.tsx:204`                       | `e instanceof Error ? e.message : String(e)`                     | (c) — ★ CHART-LOAD SURFACE (PDF fetch error)  | `setError(msg)` (UI alert)                    |
| 10 | `src/hooks/use-creation-wizard.ts:264`                         | `err instanceof Error ? err.message : String(err ?? '')`           | (c) — setlist-creation error                  | `toast.error(...)`                            |
| 11 | `src/hooks/use-setlist-dashboard.ts:269`                       | `err instanceof Error ? err.message : "Unknown error"`             | (b)-ish — setlist-transfer error              | `toast.error(...)`                            |

## Sites OUT OF SCOPE (verified, do not touch)

### Route handlers (envelope producers — dispatch ⛔)

14 sites in `src/app/api/**/route.ts`. These return rich envelopes that
downstream consumers should unwrap. Already-correct pattern at envelope
boundary; user-visible failure is at the consumer side.

### `src/lib/**` server-side (~80 sites)

Server-side error logging strings (`logger.error(...)`, debug fields,
audit doc fields). Not user-visible. `src/lib/library-upload.ts:267`
`src/lib/storage-backup/mirror.ts:479` carry `String(err)` in legacy
`e?.message ?? String(err)` patterns that are wire shapes — leaving
alone per dispatch.

### `src/components/music/PDFViewer.tsx:303`

`onDocumentLoadError(error: Error)` — `error` is typed `Error` by
react-pdf, so `.name`/`.message` are safe. Not at risk.

### `src/components/music/SmartScoreViewer.tsx:587`

`<p>{error}</p>` — `error` state is typed `useState<string | null>`, so
this JSX renders a string safely. Plus do-not-touch zone per
`[[project_smart_transposer_is_key_transcriber]]`.

### `src/app/login/LoginClient.tsx:104`

`<p>{error}</p>` — same: `error` state is `useState<string | null>`.
JSX-safe.

## Triage decisions

Per the dispatch's (a)/(b)/(c) breakdown, every Phase-0 hit ends up as
classification (c) once you realise the catch sees `unknown` and the
union over `(Error, RichErrorEnvelope, anything)` is the real shape. The
single `formatError(err: unknown): string` helper handles all three —
see `src/lib/format-error.ts` next phase.

**Surgical preservation for site #1** (DashboardClient): the existing
code rendered `${err.name}: ${err.message}` for the Error case (richer
than plain `.message`). To preserve that one richer-format detail while
fixing the envelope path, the replacement keeps the Error narrowing for
the prefix and falls back to `formatError(err)` for the unknown shape:

```ts
const msg = err instanceof Error ? `${err.name}: ${err.message}` : formatError(err)
```

Every other site collapses to a single `formatError(err)` call.

## Counts

- Phase-0 grep hits in scope:  **11** across 7 files
- Phase-0 grep hits out of scope (route handlers + lib + types-narrowed JSX): **~110**
- Sites needing edit:  **11**
- New files:  **2** (`src/lib/format-error.ts`, `src/lib/__tests__/format-error.test.ts`)

## Verification

After Phase 1+2 lands, the canonical grep re-run on `src/components/`
and `src/app/(main)/`, `src/hooks/` should yield zero matches outside
the new `formatError` util itself (which deliberately references the
patterns it handles in JSDoc/tests). Route handlers + lib remain
unchanged per scope boundaries.
