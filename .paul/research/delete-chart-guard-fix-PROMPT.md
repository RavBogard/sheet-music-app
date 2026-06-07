# Lane: delete-chart-guard-fix — `delete_chart` over-blocks on dangling tracks of DELETED setlists

**Coder:** coder-3
**Tier:** 2 — refines the guard on a DESTRUCTIVE tool (`delete_chart`). Getting it
wrong could let a chart bonded to a LIVE setlist be deleted (breaks Perform).
Auditor will independently verify at the deployed surface that **live bonds are
still blocked** and only dead-parent (dangling) bonds stop blocking.
**Base:** `origin/master` @ `78f12b6ca` (cut a FRESH worktree off origin/master).
**Worktree:** `sheet-music-app-delete-chart-guard-fix/`  **Branch:** `feat/delete-chart-guard-fix`

---

## The bug (confirmed against origin/master, auditor-051 BUG-1)

`delete_chart`'s `chart_in_use` guard at **`src/lib/mcp/tools/library-upload.ts:742`**:

```ts
const tracksSnap = await db
    .collection("tracks")
    .where("fileId", "==", args.fileId)
    .limit(50)
    .get()
if (!tracksSnap.empty) {
    return richError(
        "chart_in_use",
        `Cannot delete: this chart is bonded to ${tracksSnap.size} setlist track(s).`,
        { fileId: args.fileId, boundTracks: tracksSnap.size },
        "Remove the tracks first via remove_track, then retry delete_chart.",
    )
}
```

It counts EVERY `tracks` doc with that `fileId` — including **dangling tracks
whose parent setlist was deleted** (parent `setlists/{track.setlistId}` →
`.exists === false`). Those orphan track docs (pre-v60-07-02 tracks-cascade gap,
C7I4-002) can't be cleared by `remove_track`/`update_track` (they 404 on the dead
parent), so the guard **falsely blocks deleting a data-loss orphan chart** even
when no LIVE setlist references it. Confirmed in Lane C-2: 5 of 22 orphan charts
were falsely blocked by 8 dangling tracks in 6 already-deleted setlists; the only
fix was a direct admin purge.

## The fix

The guard should count only tracks whose **parent setlist still exists**. A
chart is "in use" iff a LIVE setlist references it.

- For each track doc matched by `where("fileId","==",fileId)`, read its
  `setlistId` and check `setlists/{setlistId}` existence (batch the parent reads
  — `getAll(...refs)` or a small loop; the match set is `limit(50)` so bounded).
- Block (`chart_in_use`) ONLY if ≥1 matched track has a **live** parent.
  Surface the live count (and optionally the live setlist ids) in the envelope
  detail.
- If ALL matched tracks are dangling (dead parents) → **allow the delete** (the
  chart is a true orphan; no live perform view depends on it).
- Keep the `limit(50)` bound; keep the existing admin/uploader role gate and the
  `core`/`supplemental` admin gate ABOVE this guard untouched.
- Do NOT auto-purge the dangling track docs in this tool (that's the separate
  orphan-sweep work coder-1 owns) — just stop COUNTING them. (If trivial, you may
  additionally surface `danglingTracksIgnored: N` in the detail for observability,
  but no deletes of track docs here.)

Verify the `tracks` doc shape (the `setlistId` field name) against deployed
source — see `scripts/sweep-orphan-tracks-deleted-setlists.mjs` (on master) and
the assign route, which both read `tracks`/`setlistId`. Don't guess the field.

## Files
- **EDIT:** `src/lib/mcp/tools/library-upload.ts` — the `delete_chart` guard only
  (~742). Lane-private region; no shared-file claim needed unless you touch
  `index.ts` (you shouldn't — registration is unchanged).
- **TEST:** extend the delete_chart emulator test
  (`src/lib/mcp/__tests__/…` — find the existing delete_chart suite) with:
  (a) chart bonded to a LIVE setlist → still `chart_in_use` (regression);
  (b) chart bonded ONLY to a track whose parent setlist is deleted → delete
  SUCCEEDS; (c) mixed live+dangling → still blocked, count = live only.

## Hard rules
- DO NOT touch: `bridge/**`, repo-root `mcp/`, `SetlistGrid.tsx`, `errors.ts`,
  `error-envelopes.ts`. Don't touch coder-1's orphan-sweep script or coder-2's
  `SmartScoreViewer.tsx`.
- This is a guard REFINEMENT — the safety property "never delete a chart a LIVE
  setlist depends on" MUST hold. That's the auditor's #1 check.

## Gates (all required before SHIP-NOTICE)
1. `npm ci` in the fresh worktree (per-worktree).
2. unit + `npm run test:emulator` (incl. the 3 new cases) + `next build --webpack` (exit 0).
3. **Deployed prod REPRO** (needs pool ROOT bearer from Daniel): prove at the
   deployed surface that (i) `delete_chart` on a chart bonded to a LIVE setlist
   still returns `chart_in_use`; (ii) a chart bonded only to a dangling/dead-parent
   track now deletes. Use a disposable seeded fixture; clean by id, NEVER
   `cleanup_all_test_data`.
4. SHIP via narrow-lane cherry-pick → SHIP-NOTICE to auditor + copy supervisor;
   update `shared/master-tip.md`.

## Relationship to the orphan-sweep (coder-1, separate, in flight)
coder-1 is independently VERIFYING the 224 dangling tracks across 9 dead setlists
(read-only; Daniel-gated apply). This lane FIXES the guard so future orphan
deletes don't get falsely blocked; it does NOT clean the existing 224 (that's
coder-1's sweep). Disjoint files (you: library-upload.ts; coder-1: a script).
Same predicate ("does the parent setlist exist?") — feel free to read coder-1's
`scripts/sweep-orphan-tracks-deleted-setlists.mjs` for the exact parent-existence
check, but keep your change to the guard.
