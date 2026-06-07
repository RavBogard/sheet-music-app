# Lane A — Unbond a chart without deleting the track

**Wave:** setlist-fixes (from Shavuot-Yizkor live-session bug report, 2026-05-20)
**Risk tier:** 1 (standard — write-path/data-integrity, but no auth/rules/credential surface)
**Base SHA:** `a5fcc3132` (current master tip — verify against `.coord/shared/master-tip.md`)
**Lane id:** `setlist-fixes-a-unbond`
**Est:** ~1.5–2.5 hr

Closes **Bug 2 + Bug 5** (same fix) and the doc half of **Bug 6**.

---

## Why

Daniel hit this live: he wanted to keep the "Aleinu" row in a setlist but remove its
chart bond. There is no supported way. `update_track` with `songId: null` is rejected by
Zod (`patch.songId: expected string, received null`), so the only workaround is delete +
re-add as a free-text row — which loses position and takes two calls. A row must be able
to exist without a chart. This is a fundamental CRUD gap.

## Scope (verified targets)

### 1. Accept `null` in the patch schema — `src/lib/mcp/tools/index.ts`
- The shared patch surface is `bulkTrackPatchSchema` at **`index.ts:~104-112`**; `songId`
  is `z.string().optional()` on line **~111**. Change to `z.string().nullable().optional()`
  with a `.describe(...)` explaining that `null` clears the bond (keeps the row).
- This base schema is reused by BOTH `update_track` and `bulk_update_tracks`, so the one
  change covers both tools. Confirm by reading where `bulkTrackPatchSchema` is spread.
- Verify no other field in the patch needs nulling — scope is `songId` only.

### 2. Unbond write semantics — `src/lib/mcp/server-tracks-write.ts`
- `UpdateTrackPatch` type at **`:~320-340`**: widen `songId?: string` (line ~326) to
  `songId?: string | null`.
- `updateTrack` at **`:~361`**, re-bond branch at **`:~439-446`**
  (`if (patch.songId !== undefined && patch.songId !== peekData.songId)`). Add an explicit
  **unbond branch** for `patch.songId === null`:
  - Clear `songId`, `fileId`, **and** `fileName` on the track doc
    (use `FieldValue.delete()` — match how the file already imports `FieldValue`).
  - Recompute / pull the row's old `fileId` OUT of the parent setlist's denormalized
    `fileIds[]` aggregate. The re-bond branch already rebuilds `fileIds[]` from post-patch
    track state (**`:~566-646`**) — route the unbond through that same canonical rebuild so
    the cleared row drops out of `fileIds[]`. Do NOT hand-roll a second aggregate path.
  - Preserve everything else on the row: `title`, `key`, `leadMusician`, `notes`,
    `position`/`order`, `type`, `bpm`, `referenceLink`.
- `createTrack`/`addTrackToSetlist` pre-validates `songId` as a string before
  `getSongById` (see `setlist-write.ts:~338-345`). `add_track` does NOT need an unbond path
  (you add an unbonded row by just omitting `songId`) — but make sure your schema change
  doesn't make `add_track` accept a meaningless `songId: null`. If the add path shares the
  schema, treat `null` there as "omitted" (no bond), not an error.

### 3. Bug 6 — version-churn DOCS only (no behavior change)
- Version-echo is ALREADY returned on writes (`setlist-write.ts:~613-628`) and `swap_chart`
  already bypasses the gate (`:~470`). Do NOT add a `force` bypass to `update_track` —
  optimistic concurrency is load-bearing for multi-user.
- Just tighten the `update_track` / `bulk_update_tracks` tool **descriptions** in `index.ts`
  to state: every write bumps the setlist version and echoes it back; callers must chain the
  returned `version`, not a stale `get_setlist` value. One or two sentences.

## Out of scope / hard rules
- Do NOT touch `bridge/**`, repo-root `mcp/`, `SetlistGrid.tsx`,
  `src/lib/mcp/errors.ts`, `src/lib/mcp/error-envelopes.ts`.
- Do NOT change the dedup threshold or any search logic (that's Lane D).
- Stay out of `clone-setlist.ts` / `liturgical-templates.ts` / `library.ts` (other lanes).

## Shared-file coordination
- You and **Lane B** (`setlist-fixes-b-bond-review`) both edit `src/lib/mcp/tools/index.ts`,
  but in disjoint regions (you: patch schema ~line 108 + tool descriptions; B: a new
  `registerTool` block ~line 1030 + an import). You each work in your OWN worktree, so you
  do NOT block each other during dev. Claim `index.ts` in `.coord/shared/claims.md` with a
  note `(worktree-isolated; ship-order coord only)` and HEADS-UP Lane B's inbox.
- **Ship via the narrow-lane cherry-pick caveat** (`master-tip.md` §Narrow-lane): the local
  master is a shallow clone, so `git fetch origin && git reset --hard origin/master &&
  git cherry-pick <your-sha>` — NOT a full rebase. Whoever ships second cherry-picks onto
  the first's tip; the index.ts regions are disjoint so it should be conflict-free.

## Tests + ship
- New tests for: `update_track({songId:null})` clears songId+fileId+fileName, preserves
  title/key/position, and removes the fileId from the parent `fileIds[]`; `bulk_update_tracks`
  unbond on multiple rows; re-bond after unbond still works. Prefer the emulator test path
  (`*.emulator.test.ts`) since this is a Firestore-aggregate mutation — an in-memory adapter
  will miss the `fileIds[]` reconcile (see `[[feedback_harness_real_firestore]]`).
- Gates before push: `npm run test` (unit, 0 fail), `npm run test:emulator` (0 fail),
  `next build --webpack` with `SKIP_ENV_VALIDATION=1` (exit 0).
- Push `git push origin feat/setlist-fixes-a-unbond:master`, OVERWRITE `master-tip.md`,
  post a SHIP-NOTICE to `.coord/inbox/auditor.md` (Tier-1 → coder↔auditor direct per the
  2026-05-19 auditor-flow decision) AND a copy to `.coord/inbox/supervisor.md`.

## Deployed-surface REPRO (required in SHIP-NOTICE)
Against `https://www.centralreform.live/api/mcp` with your lane bearer: create a test
setlist, add a bonded row, call `update_track({setlistId, trackId, patch:{songId:null}})`,
then `get_setlist` and show the row retains title/position with `songId`/`fileId` gone, and
`verify_setlist_charts` reports it `unbonded` (not `missing`). Paste the before/after.
