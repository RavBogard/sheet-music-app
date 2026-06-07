# Probe 1 — Clone last week's Shabbat + tweak

## Source
- Setlist: `UnjLqKTtS4lNKQfMY6hB` "Shabbat Morning — Parashat Emor — May 2"
- Owner: Daniel Bogard (admin)
- 30 tracks, mixed types (song/header/prayer/transition/reading), templateType="shabbat_morning"

## Operations (in order)

1. `clone_setlist({sourceSetlistId, newName:"c9i2-CLONE-emor-weekly-flow-test", newEventDate:"2030-01-04"})` →
   `{ok:true, setlistId:"69be5383-a5b0-4470-aa40-2995c1938616", trackCount:30, version:1}` — owned by Daniel admin (no test-uid namespacing — see ergonomics narrative)
2. Verified clone: 30/30 tracks, order contiguous 0..29, every row's `songId/fileId/fileName/type/key/notes` preserved verbatim. `templateType` carried. `eventDate` set to 2030-01-04 per param. No `sourceSetlistId` field on the doc itself (only echoed in clone response).
3. `remove_track(trackId="f29d403f-…-Leslie-Cohen-Hallelujah", lastSeenVersion:1)` → `{ok:true}`. Track-level OC gate accepted.
4. `remove_track(trackId="5a870f1b-…-Adon-Olam-mp3", lastSeenVersion:1)` → `{ok:true}`. Second remove with lastSeenVersion:1 still succeeded → confirms OC gate is per-track, not per-setlist.
5. `add_track_to_setlist({type:"song", songId:"d22779d6-…-Shalom-Rav", leadMusician:"David Lazaroff", notes:"…"})` → `{ok:true, trackId, order:28}`. Title/fileName auto-hydrated from library row.
6. `add_track_to_setlist({type:"song", songId:"cf704b73-…-Hashkiveinu", leadMusician:"Daniel Bogard"})` → order:29.
7. `add_track_to_setlist({type:"note", title:"c9i2 probe — note row …"})` → order:30. Type fidelity for "note" rows confirmed.
8. `swap_chart({trackId:"bbae76d4-…-Modeh-ani-Keira", newSongId:"2fc76c49-…-Modeh-Ani-Klepper-Freelander"})` → `{ok:true}`. Version bumped 1→2. **title force-synced from "Modeh ani - Keira" (hand-curated) → "Modeh Ani (Klepper-Freelander)" (catalog title)** — see UX-001 finding.
9. `reorder_setlist(lastSeenVersion:7, orderedTrackIds:[…31 ids…])` → `{ok:true}`. Setlist-level OC gate. New rows moved into Closing section between header and Aleinu.
10. `verify_setlist_charts(setlistId)` →
    `{bondedCount:15, okCount:11, missingCount:4, unreachableCount:0, unbonded:16, phantomBonds:0}`.

## Findings from Probe 1

### POSITIVE — clone fidelity
30-track clone with mixed row types round-tripped perfectly. Order contiguous, all per-row fields preserved verbatim, chart bonds copied byte-for-byte (including the awkward source bond where "Barchu" row points to `Ahava raba.pdf` — a chart-naming inconsistency in source data, NOT a clone bug).

### POSITIVE — track-level + setlist-level OC works
`lastSeenVersion` on `remove_track` is per-track (both removes against `:1` succeeded); on `reorder_setlist` it's per-setlist (the version-7 gate worked because intervening writes bumped the setlist version). This matches the documented surface.

### HIGH — search_library returns rows whose chart blobs are missing (C9I2-001)
3 of 3 songs I added/swapped via `search_library({query})` results bonded successfully but verify_setlist_charts immediately flagged them `status:"missing"` with `Drive 404: File not found`. The library_index/songs collection has active rows pointing to UUID-style fileIds that don't exist in Firebase Storage NOR in Drive. The catalog row's `status:"active"` is misleading — these are catalog ghosts. A band_leader picking songs from search results will silently produce broken setlists; the breakage only surfaces at publish-preflight or gig-packet time. Affected songIds I observed: `2fc76c49-023f-4eaf-a063-d5f69e22ab72`, `d22779d6-bd3f-436c-8d5a-cc6daa3d92e6`, `cf704b73-5f35-45fe-901f-a8b68d4fdc22`. The pattern correlates with UUID-shaped songIds (vs. Drive-shaped IDs which all resolved OK). Intersects with axis 3 (library hygiene) — flagging here because it BLOCKS-GREEN the authoring flow's "easy & intuitive" bar.

### MED — swap_chart with default syncMetadata:true clobbers hand-curated titles (C9I2-002)
The source row carried title "Modeh ani - Keira" — a meaningful tag (Keira is a person/leader, per setlist context). After `swap_chart` with default `syncMetadata:true`, title became "Modeh Ani (Klepper-Freelander)" — the catalog title. The tool docs DO call this out ("default true means a clean swap"; "title falls back to NOTE-1 (only auto-refreshes when the row was using the OLD song's title)"). But the NOTE-1 fallback didn't apparently trigger — the row's title was NOT the old song's catalog title (which would've been "Modeh ani - Klepper"); it was custom "Modeh ani - Keira". Either NOTE-1's "row was using OLD song's title" detector is too loose (fired on substring match?), OR the default behavior is just hostile to hand-curated titles. UX-friction finding: a band_leader doing routine chart swaps will silently lose their personalization.

### MED — clone_setlist doesn't carry isTest flag or test-uid ownership (C9I2-003)
The instance-2 prompt says (PARENT §2) to use `uidPrefix:"c9i2"` for test isolation so `cleanup_all_test_data({prefix})` can sweep my fixtures. But the wired MCP bearer is the admin bearer (Daniel's uid), so when I `clone_setlist`, the clone's `ownerId` is Daniel's real uid, NOT a `test-c9i2-*` uid. Implication: `cleanup_all_test_data({prefix:"c9i2"})` will NOT sweep my clone. The only way to remove it is explicit `delete_setlist(id)`. Also: `clone_setlist` has no `isTest` parameter, so the clone could show up on `/perform` listing despite being a test fixture (mitigated here by far-future eventDate 2030-01-04 + "c9i2-CLONE-" name prefix triggering the name heuristic on the writer side — but that's coincidental, not contractual). Recommend either (a) clone_setlist accept `isTest:true`, or (b) document that cowork sweeps using the admin bearer must `delete_setlist` by id rather than rely on prefix-sweep.

### LOW — templateType case/separator inconsistency
Source setlist + clone carry `templateType:"shabbat_morning"` (snake_case). The instance-2 prompt examples use `"shabbat-morning"` (kebab-case). `list_templates({templateType:"shabbat-morning"})` would miss prod data. Not a bug, but worth normalizing.

### INFO — no rabbi field set on real prod Shabbat setlist
The May 2 Parashat Emor setlist has no `rabbi` field; the clone propagates that gap. This will degrade suggest_band's rabbi-aware ranking (which reads `setlist.rabbi` + `config/congregation.scheduling.rabbiProfiles[]`). Captured for Probe 5.

## Post-tweak state at end of Probe 1
- 31 tracks, order 0..30 contiguous
- version: 7+ (further bumped by reorder)
- 11 charts healthy / 4 missing — a useful natural fixture for downstream probes
- Vocal Lead populated on rows 26 + 27 (the two added rows) — leadMusician field accepts and persists free-text values
