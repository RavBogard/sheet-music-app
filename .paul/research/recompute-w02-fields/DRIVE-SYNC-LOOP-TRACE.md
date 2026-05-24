# Drive-sync RENAME-detection loop concern — TRACE

**Lane:** `recompute-w02-fields-on-rename-and-edit` (Wave-2 ingest-mutator-matrix F-7)
**Author:** coder-5
**Date:** 2026-05-24
**Base SHA:** `1aea77464`

## Concern (from coder-4, REVISED by auditor)

> "drive-sync poller's `handleExistingFile` may loop if `rowName` stays
>  stale after a UI rename. Auditor explicitly punted exhaustive trace
>  to this fix-lane owner — verify during your diagnose phase."

The intuition: if `/api/library/rename` PATCH or `editEnrichment` mutate
`library_index.{name,nameLower,normalizedName,...}` but Drive's view of
the file stays the same, the next drive-sync tick might compare a stale
`rowName` against the un-changed Drive `newTitle` and decide a rename is
needed every tick → infinite oscillation.

## Verdict: NOT REAL

Drive-sync's RENAME branch is **double-gated** by an originalName check
that UI mutations never touch. The loop is structurally impossible.

## Trace

`handleExistingFile` is defined at `src/lib/drive-sync/poller.ts:357`.
The relevant local bindings:

```ts
const rowName       = typeof row.name === "string" ? row.name : ""
const driveName     = chooseFileName(file)         // from Drive's `name` field
const newTitle      = dropExt(driveName)
const nameChanged   = driveName !== row.originalName && newTitle !== rowName
//                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^   AND
//                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^   (left conjunct)
```

The branch only fires when `nameChanged === true`, which requires
**both** `driveName !== row.originalName` (left conjunct) and `newTitle
!== rowName` (right conjunct). Note: `originalName` is the Drive file's
canonical filename as last seen by drive-sync — written ONLY by
drive-sync itself at `poller.ts:444` (REPLACE branch) and `poller.ts:483`
(RENAME branch).

### Mutation channels we care about

| channel | writes `name`? | writes `originalName`? | writes `nameLower`? | writes the rest of W-02? |
|---|---|---|---|---|
| PCU `processChartUpload` (initial upload) | yes | yes | yes | yes |
| drive-sync RENAME / REPLACE | yes | yes | yes | partial (nameLower + normalizedName only) |
| `/api/library/rename` PATCH (pre-F-7) | no — only `displayName` | no | no | no |
| `/api/library/rename` PATCH (post-F-7, this lane) | yes | no | yes | yes |
| `editEnrichment` title-branch (pre-F-7) | yes | no | yes | no (3 of 5 stale) |
| `editEnrichment` title-branch (post-F-7, this lane) | yes | no | yes | yes |

**Key observation:** the UI mutation channels (`/api/library/rename`,
`editEnrichment`) never touch `originalName`. Drive's `driveName` only
changes when the file is renamed *in Drive itself*, which also bumps
Drive's `modifiedTime` so the file re-enters the modified-since query
window at `poller.ts:548`. So:

- **Pre-F-7 UI rename only:** `name` stays old (handler wrote only
  `displayName`), Drive's `name` stays old. `driveName === originalName`
  → left conjunct false → `nameChanged === false` → RENAME branch
  doesn't fire. **No loop**, but the row's W-02 fields are stale (the
  actual F-7 bug, fixed in this lane).
- **Post-F-7 UI rename / editEnrichment:** `name` updates to the new
  title, Drive's `name` stays old. `originalName` stays at Drive's old
  filename → `driveName === originalName` is **still true** → left
  conjunct false → RENAME branch doesn't fire. Drive-sync correctly
  defers to the UI rename. **No loop.**
- **Drive-side rename (operator renames in Drive):** Drive's
  `modifiedTime` advances, file re-enters the modified-since query;
  `driveName !== originalName` (left conjunct true), `newTitle !==
  rowName` (right conjunct true, modulo coincidence) → RENAME fires
  ONCE → after the write `originalName === driveName` and `rowName ===
  newTitle` → next tick `nameChanged === false`. **Single rename, no
  loop.**
- **Race: Drive renamed AND UI renamed (different new names):** Drive
  wins on the next tick — drive-sync overwrites the UI rename. This is
  the documented overwrite scenario and converges in one step (next
  tick: `nameChanged === false`). **No loop.** Whether Drive *should*
  win is a separate policy question not in scope for F-7.

### What about REPLACE (md5-advanced) interaction?

REPLACE's nameChanged-detection at `poller.ts:438` uses the same
`nameChanged` boolean. If md5 advanced AND the UI renamed the row,
REPLACE writes its own freshly computed `name`/`nameLower`/`normalizedName`
based on the Drive name. UI rename gets overwritten — same single-step
convergence. **No loop.**

### `modifiedTime` no-op branch

`poller.ts:496`: when nothing material changed but Drive's
`modifiedTime` advanced, drive-sync writes `driveModifiedTime` only
(NOT `name` / W-02 fields). Doesn't trigger any subsequent rename
condition. **No loop.**

## Adjacent finding (out-of-scope for F-7)

Drive-sync's inline name-field compute at `poller.ts:441-443` (REPLACE)
and `poller.ts:480-482` (RENAME) writes only `name` + `nameLower` +
`normalizedName`. It does **not** recompute `stem` + `titleSpecificity`.
So a Drive-side rename leaves 2 of 5 W-02 fields stale on the row —
same shape as `editEnrichment`'s pre-F-7 bug, just on the Drive path.

The dispatch hard-bounds drive-sync out of this lane ("⛔ FINDING-3 +
FINDING-5 — same router code"). Recording here as a follow-up
candidate: a Wave-3+ lane could wire drive-sync's RENAME + REPLACE
branches through `recomputeIndexNameFields` for full parity. Until
then, Drive-side renames will keep 2 W-02 fields stale — a partial-fuzzy-
dedup-blind state for rows renamed in Drive, same shape as
pre-F-7 `editEnrichment`.

## Conclusion

- **Loop concern:** structurally impossible — `nameChanged` is
  double-gated by `originalName` which UI mutations never touch.
- **F-7 fix surface:** no drive-sync changes required in this lane.
- **Follow-up surfaced:** drive-sync RENAME + REPLACE branches still
  skip `stem` + `titleSpecificity` on a Drive-side rename. Not in scope
  for F-7; suggest a follow-up lane to thread the helper through
  drive-sync once Wave-2 quiesces.

## Evidence

- `src/lib/drive-sync/poller.ts` (lines 357-503 in `1aea77464`)
- `src/app/api/library/rename/route.ts` (this lane's edit — does not
  touch `originalName`)
- `src/lib/library/review-queue.ts:503-549` (this lane's
  `editEnrichment` edit — does not touch `originalName`)
- `src/lib/library-upload.ts:540-583` (PCU's `originalName` write —
  the only non-drive-sync write to that field; happens once at
  initial upload, never on rename)
