# Orphan-track sweep — dry-run findings (DECISION PENDING — supervisor)

**Status:** DRY-RUN ONLY. No deletes executed. Escalated to supervisor for go/no-go (Daniel: "report to boss and let boss decide"). 2026-05-21 · coder-1.

## What this is

Lane C-2 (delete the 22 byte-less `upload-*` orphans) hit a wall: 5 charts refused `delete_chart` with `chart_in_use` because of **dangling `tracks` docs whose parent setlist had been DELETED** (pre-v60-07-02 cascade-gap residue). I cleared the 8 that blocked my 5 charts (option A, shipped @ `594a61ecf`). Daniel then asked to chase the broader residue. This is the dry-run of a **generalized sweep**.

## Dry-run result (Firebase admin SDK, prod, authoritative)

`scripts/sweep-orphan-tracks-deleted-setlists.mjs` scanned the whole top-level `tracks` collection and checked each referenced `setlistId` against `setlists/{id}`:

- **Total track docs:** 565
- **Tracks with no `setlistId`:** 0
- **Distinct setlistIds referenced:** 23
- **DEAD setlists (referenced by tracks but `setlists/{id}` does not exist):** **9**
- **DANGLING tracks (parent deleted):** **224** (~40% of the whole `tracks` collection)

Breakdown by dead setlist:

| dead setlistId | dangling tracks | in lane-C-2's 6? |
|---|---|---|
| `CTAi6kgkTUpGYMO1Ffx7` | 44 | yes |
| `xr1cd7h4Yutje9ej3iem` | 43 | yes |
| `P64x0MxFzJ3BWfrb2GYs` | 42 | **NEW** |
| `htxUSjxtg4Py6pKLQgj5` | 37 | yes |
| `ZR8PcmFuDvM8gdYErMFm` | 26 | **NEW** |
| `WoguRLMMTOv24o1G2ew3` | 15 | yes |
| `5ZOswikr7CKqm7Zp7zje` | 15 | yes |
| `OaqXciKwYesUuYcYuU7X` | 1 | **NEW** |
| `kQNvssixRlHQRB6gtWqt` | 1 | **NEW** |

(`pvL81pSCXJiRhGsbeEvi` from lane-C-2 is absent here = its only dangling tracks were the 2 Niggun ones I already purged.)

## Why this matters / safety

- All 9 parent setlists are confirmed deleted via **admin-SDK doc reads** (`.exists === false`) — NOT the owner-scoped MCP `get_setlist` path — so this is authoritative; every one of these 224 tracks is genuinely unreachable.
- These dangling docs **inflate `delete_chart`'s `chart_in_use` guard** (`db.collection("tracks").where("fileId","==",X)`, library-upload.ts:742) — i.e. any future chart delete can be falsely blocked by a dead-setlist track. Same root as the lane-C-2 blocker.
- Deleting them is safe: parent setlists are gone, so nothing live references these track rows. The script only deletes tracks whose parent is confirmed-missing; it reports (does not delete) any track with no `setlistId`.

## Decision options (for supervisor)

- **A — full sweep:** delete all 224 dangling tracks across the 9 dead setlists. The real cascade-gap fix. (`--apply`.)
- **B — scope to lane-C-2's 6 only:** narrower, leaves the 4 NEW dead setlists' residue.
- **C — hold:** leave as-is; pair with a `delete_chart`-guard fix (ignore dead-parent tracks) as its own lane.

**coder-1 recommendation:** A — it's a safe, bounded, one-shot cleanup that removes ~40% dead weight from `tracks` and unblocks future chart deletes. Optionally pair with the guard fix (B-class code change) so the bug can't re-bite.

## Latent code bug (separate from the data cleanup)

`delete_chart`'s guard counts tracks of DELETED setlists. Recommend either a generalized orphan-track cron/sweep or the guard ignoring tracks whose parent setlist no longer exists. See [[feedback_enumeration_tool_scope]].
