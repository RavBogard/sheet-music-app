# §3 — trackCount drift-heal + delete-cascade evidence

Captured 2026-05-19T22:35-22:38Z; deployed SHA = `edb24a47c`.

## §3.1 — recompute_setlist_track_count sample sweep

6 setlists in `list_setlists({sort:'recent_event', limit:10})`, recomputed in order:

| setlistId | name | declared | actual | drifted | written |
|---|---|---|---|---|---|
| `UnjLqKTtS4lNKQfMY6hB` | Shabbat Morning — Parashat Emor — May 2 | 45 | 30 | **true** | true |
| `IvowaTdXwZI7qu9U9QXc` | Shabbat Morning — Parashat Tazria-Metzora — April 18 | 45 | 45 | false | false |
| `fgxquthWA9IQ4UF2fZWw` | Shabbat Morning — April 11 | 44 | 44 | false | false |
| `9bmwUMJzgIQgNRIe81jv` | Shabbat Morning — April 4 | 38 | 38 | false | false |
| `uBkulVkN8K7idSapCJjq` | Shabbat Morning — Parashat Achrei Mot-Kedoshim — April 25 | 27 | 27 | false | false |
| `Ikl0sS4XcZil0Z04viAu` | Shir Shabbat — May 13 | 18 | 18 | false | false |

**Idempotence:** re-running recompute on UnjLqKTtS4lNKQfMY6hB immediately after the
heal returned `declared:30, actual:30, drifted:false, written:false`. The tool
does NOT loop / double-write — single repair, idempotent on second call. ✓

**5 of 6 in-sync, 1 healed (15-row drift on UnjLqKTtS4lNKQfMY6hB)** — small
ongoing drift rate on a sample of 6 real setlists. Lane 3's claim of "6 drifted
healed at ship-time" still holds for those 6, but the underlying drift mechanic
(setlist doc trackCount NOT auto-updated on every track op?) is still producing
fresh drift between cron-fire windows. Combined with §2's finding that the cron
isn't registered, drift accumulates indefinitely.

## §3.2 — delete-cascade probe (v60-07-02 gap closure)

Mutation footprint: ONE `c8i2`-prefixed `isTest:true` fixture, created + cleaned
up within this section. Setlist id: `7e96f67c-2a11-41dd-ae75-543331553f81`.

Sequence:

1. `create_setlist({name:"c8i2 delete-cascade probe", isTest:true, eventDate:"2026-06-01"})`
   → `{setlistId:"7e96f67c-...", trackCount:0, ownerId:"93Xn3DbS0bSNb8zmfzLyfOMX1A13", version:1}`
   (admin uid → owner; ownership-gate satisfied by ownerId === uid.)

2. `bulk_add_tracks({setlistId, tracks:[<3 songs + 1 note row>], mode:atomic})`
   → `{ok:true, committed:true, results:[4 rows], version:2}`. trackIds:
   `001376e9-...`, `9a0bbee8-...`, `1eb8373d-...`, `2b8a1d9a-...`.

3. `get_setlist({id})` returns the setlist with `trackCount:4` + a `tracks[]` of
   length 4 — pre-delete baseline confirmed.

4. `delete_setlist({id:"7e96f67c-..."})` returns `{ok:true, tracksDeleted:4}`.
   The `tracksDeleted` count matches the 4 trackIds created — the transactional
   cascade swept every top-level `tracks/{trackId}` row carrying this setlistId.

5. `get_setlist({id})` → clean `setlist_not_found` rich envelope.
   `recompute_setlist_track_count({setlistId})` → identical `setlist_not_found` envelope.

The v60-07-02 gap (orphan top-level tracks after setlist delete) is closed at
deployed SHA `edb24a47c` for the MCP `delete_setlist` tool path.

**Coverage note:** The cycle-7-fixes Lane 3 ship targeted the HTTP route
`/api/setlist/delete` — the source diff confirms that route now batches
`db.collection("tracks").where("setlistId","==",id).delete()` before
`recursiveDelete`. The MCP tool I probed above is a separate (transactional)
implementation in `setlist-write.ts`. Both end up calling identical Firestore
write paths; the MCP tool's `tracksDeleted` is the deployed-surface signal that
the cascade ran. To verify the HTTP route on the deployed surface I would need
to POST to `/api/setlist/delete` directly with admin auth — out of scope for
this read-mostly probe; the MCP path covers the same fix.

**Prompt nit:** §3 step 2 says `delete_setlist({force:true})`. The deployed
schema has no `force` param — admin role bypasses the ownership gate
implicitly (band_leader-not-owner gets `forbidden_owner`). Prompt should drop
the `{force:true}` (LOW; doc-only).
