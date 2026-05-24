# Stale-setlist-fileids-denorm rebuild — RUNBOOK

**Status:** ✅ shipped 2026-05-24. Historical data clean as of last apply.

## What this script fixes

`setlists/{id}.fileIds[]` is a denormalized cache of every `tracks` row's
`fileId` for that setlist. The current MCP write path
(`src/lib/mcp/tools/propose-changes.ts:513-518`,
`clone-setlist.ts:283-289`, `templates.ts:807-813`, plus the
arrayUnion/arrayRemove paths in `setlist-write.ts`) maintains it
correctly going forward. But historical setlists carry stale entries
from before that logic landed, or from edit-paths that didn't update
the denorm.

This drift was load-bearing in a real bug: coder-3's wider-blast probe
Phase 4 intersected against `setlist.fileIds[]` and surfaced false
"setlist-bound" claims for fileIds whose tracks had been rebonded.
That misled the Friday hot list (caught + ratified mid-restore-lane,
2026-05-24).

## Canonical denorm shape (must match write path verbatim)

    Set<string> from track.fileId for all tracks where
      typeof track.fileId === "string" && track.fileId is non-empty

NO filter on `type`. NO inclusion of `audioFileId`. NO inclusion of any
other denorm field. Mirrors `propose-changes.ts:513-518` exactly. If
the write path's shape ever changes, this script needs to change in
lock-step.

## Usage

DRY-RUN (default):

    node scripts/rebuild-setlist-fileids-denorm.mjs \
      > .paul/research/stale-denorm-rebuild/DRY-RUN-NNN.log \
      2> .paul/research/stale-denorm-rebuild/DRY-RUN-NNN.stderr.log

APPLY (Daniel-authorized only):

    node scripts/rebuild-setlist-fileids-denorm.mjs --apply \
      > .paul/research/stale-denorm-rebuild/APPLY-NNN.log \
      2> .paul/research/stale-denorm-rebuild/APPLY-NNN.stderr.log

Idempotency check (re-dry after apply):

    node scripts/rebuild-setlist-fileids-denorm.mjs \
      > .paul/research/stale-denorm-rebuild/REDRY-NNN.log \
      2> .paul/research/stale-denorm-rebuild/REDRY-NNN.stderr.log

Expect `stale=0` on the re-dry.

## Auth

`.env.local` must contain `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`
+ `NEXT_PUBLIC_FIREBASE_PROJECT_ID`. The
`firebase-adminsdk-fbsvc@crcmusiccharts` SA covers both reads
(`tracks` collection-group, `setlists` collection) and the writes
(`setlists` update).

Copy from a Vercel-linked worktree:

    cp ../sheet-music-app-mcp/.env.local .env.local

## Sanity ceilings (non-blocking heuristics)

The script surfaces warnings when:

- `staleFraction > 5%` (5% of setlists with deltas) — sniff-test for a
  misread of the write path.
- `maxSingleSetlistFractionLost > 50%` — sniff-test for a single
  setlist wholesale losing its denorm.

These are warnings only; the script does not refuse. Operator reviews
the dry-run and decides. The 2026-05-24 first apply tripped the 5%
ceiling (11.63% = 5/43) but all 5 deltas were inspected as legitimate
historical drift (2 surgical rebond swaps; 1 multi-edit setlist; 2
setlists with `cur=0 → computed=N` pure backfills predating denorm
maintenance). Supervisor GO'd `--apply` post-HEADS-UP review.

## What the script does NOT touch

- `setlist.version` — historical-data fixup is NOT a user-facing edit;
  bumping version would invalidate optimistic-concurrency handles held
  by parallel agents for no semantic gain. We rewrite `fileIds` field
  only.
- `setlist.updatedAt` / `lastModifiedAt` / `lastModifiedBy` — same
  reasoning.
- `templates/{id}.fileIds[]` — templates have their own write semantics
  and are explicitly out of scope per the dispatch.
- `library_index` / `tracks` / `songs` — read-only against these.

## Audit trail

- `scripts/rebuild-setlist-fileids-denorm.mjs` — the script.
- `.paul/research/stale-denorm-rebuild/DRY-RUN-001.{log,stderr.log}` —
  initial dry-run that triggered the HEADS-UP (5 stale of 43).
- `.paul/research/stale-denorm-rebuild/APPLY-001.{log,stderr.log}` —
  the actual rebuild apply run (5/5 updated, 0 write errors).
- `.paul/research/stale-denorm-rebuild/REDRY-001.{log,stderr.log}` —
  post-apply idempotency check (0 deltas confirmed).
