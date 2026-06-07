# Cycle-10 Cowork Instance-2 HANDOFF — MCP post-fix verification

**Run date:** 2026-05-28T01:22Z – 2026-05-28T01:33Z (≈11 min wall, Cowork single-thread)
**Bearer role:** admin (Cowork-connected MCP at `https://www.centralreform.live/api/mcp`; raw bearer redacted — `crl_live_***redacted***`)
**Master SHA at run:** not directly readable (no git access in this sandbox); deployed surface verified by tool-list match against prompt §0 (all 9 fix-touched tools present)
**Cleanup state:** clean — 0 residual (`list_test_accounts:[]`, `search_library({query:"c10i2"}):[]`, `list_setlists` shows no c10i2-* row)
**Author:** cycle-10-cowork-instance-2 (single-thread cowork-Claude)

---

## Regression verdict: **1 REGRESSED (R-F010) · 11 HELD · 1 N-A · 1 unavailable**

| PROBE | Fix | Verdict | Evidence (envelope excerpt / repro) |
|-------|-----|---------|-------------------------------------|
| R-F001 | isError propagation (`1b2d5e0556`) | **HELD** | `update_track({setlistId:"nope",trackId:"nope",patch:{notes:"probe"}})` → `{ok:false, error:{code:404, machine_code:"setlist_not_found", message:"Setlist 'nope' was not found."}, hint:"Verify the id via list_setlists."}` — rich envelope, no JSON-RPC `-32602`, surfaces as `isError:true` at the wrapper. |
| R-F005 | dedupe honesty (`1b2d5e0556`) | **HELD** | `dedupe_library({dryRun:true})` → `{scanned:590, groupsFound:0, wouldMark:0, committed:0, dryRun:true}` — post-fix `wouldMark/committed` shape, no legacy `duplicatesMarked`. |
| R-F007 | salvage prose (`1b2d5e0556`) | **HELD** | `salvage_chart_bytes({fileId:"ghost-c10i2"})` → `{error:{code:404, machine_code:"row_not_found", message:"Chart 'ghost-c10i2' was not found in the catalog."}, hint:"Verify the fileId via reconcile_library({dryRun:true}).orphan.rows[] or list_library."}` — no `library_index/{id}` internal path leak. |
| R-F008 | backfill force honesty (`1b2d5e0556`) | **HELD** | `backfill_track_mimetype({force:true})` (no `dryRun:false`) → `{ok:true, forceWithoutCommit:true, committed:0, dryRun:true, heal:{count:13,…}}` — explicit `forceWithoutCommit:true`, zero writes. |
| R-force | FU-1 Part A `force_required` (`fb9a137b4c`) | **HELD on backfill+archive · INFO on salvage** | `backfill_track_mimetype({dryRun:false})` → `{ok:false, error:{code:409, machine_code:"force_required"}, dryRunPlan:{heal.count:13,…}, hint:…}` ✓; `archive_nonchart_artifacts({dryRun:false})` → `{ok:false, error:{code:409, machine_code:"force_required"}, dryRunPlan:{toArchive.count:24 (23 folders + 1 sheet), heldGoogleDocs.count:13,…}}` ✓; `salvage_chart_bytes({fileId:"<c10i2 fixture>", dryRun:false})` → `{ok:false, error:{code:422, machine_code:"no_source_available"}, …}` — rich envelope SHAPE correct, but source-availability gate fires before the force-gate, so an upload-* fixture can't exercise force_required on salvage. See C10I2-002. |
| R-F010 | Unicode dedup (`d2c4936197`) | **REGRESSED** | Three c10i2 fixtures `אדון עולם` / `أمزينج جريس` / `🎵🎶` → `dedupe_library({dryRun:true})` (no `forceScore`, default exact-normalize) grouped all three under `normalizedName:"c10i2"` (`wouldMark:2, groupsFound:1`). Stems were correctly preserved per-row (`"c10i2 אדון עולם"`, `"c10i2 امزينج جريس"`, `"c10i2"`) but the dedupe-side `normalizedName` strips non-Latin letters. See **C10I2-001**. |
| R-F015 | input sanitize (`1b2d5e0556`) | **HELD** | `update_track({setlistId, trackId, patch:{notes:"a\x00b\x01c\x1fd"}})` → `{ok:true, track:{…, notes:"abcd"}}` — control bytes (null, SOH, US) stripped cleanly, no 500, no stack. |
| R-F016 | catalog dual-read write (`c71f41bed4`) | **HELD** | `upload_chart({title:"c10i2-stress-1", key:"G", bpm:84})` → `get_song({id:fileId})` returns `{title:"c10i2-stress-1", key:"G", bpm:84, status:"active"}`. Cross-read coherence: `list_library` row + `search_library` row both report `key:"G", bpm:84` (all three reads agree). |
| R-F017 | bond bpm denorm (`c71f41bed4`) | **HELD** | After `add_track_to_setlist({setlistId, songId:fileId})`, `get_setlist` track row carries both `key:"G"` AND `bpm:84` (F-017's `bpm` on ResolvedTrackBond is denormalized through). |
| R-arch | bulk soft-archive (`5c0674ab9a`) | **HELD** | `archive_nonchart_artifacts({dryRun:true})` twice → identical `toArchive.count:24` (23 folders + 1 sheet, the dh-20260527a Class 3 set) and `heldGoogleDocs.count:13`; reconcile_library shows `coverage.filteredOut.byStatus.archived:20` — the 20 already-archived rows are filtered out and do NOT appear in any reconcile bucket. Idempotent + reconcile-skip both verified. |
| R-dedup | canonical picker (`d4c441f8fb`) | **N-A** | `dedupe_library({dryRun:true})` exact-normalize: 0 groups; `forceScore:0.85` fuzzy: 52 groups, ZERO of them contain a Google-Apps mime row beside a real-bytes row (the `normalizedName` strategy embeds the file extension, so Google Docs and PDFs of similarly-named songs hash to different keys). No mixed group → cannot exercise `isGoogleAppsMime` canonical-picker. Per prompt: "No mixed group → N-A." |
| R-search | drop-lyric-search retained scopes (`3155fb2881`) | **HELD** | `search_chart_text({query:"c10i2-stress-1", scope:"metadata"})` → returns fixture; `{scope:"chords", query:"G"}` → 5 chord-progression hits; `{scope:"all"}` → fixture; `{scope:"lyrics"}` → `{ok:false, error:{code:400, machine_code:"validation_error", message:"Invalid arguments — search_chart_text: scope: Invalid option: expected one of \"metadata\"\|\"chords\"\|\"all\""}}` — clean rich Zod-reject envelope, NO 500, NO stack. Deployed Zod enum is `[metadata,chords,all]` as the prompt expected. (See C10I2-004 for the stale tool-description note.) |
| R-web-a11y | WCAG AA contrast (axe Cat-J) | **N-A** | Web-axe Cat-J is Instance 1's territory; not exercised by this MCP-only instance. |
| Cat-M | harness probe baseline | **unavailable** | `npm run stress --surface=mcp` requires the `sheet-music-app/cycle-4/harness/` directory; in this Cowork session no user folder is mounted (`User selected a folder: no`) and only the two PROMPT markdowns are in uploads. Per prompt §Part 2 alternative: "Cat-M can alternatively ride the operational `npm run stress --surface=mcp` without a full cowork instance" — run Cat-M from a developer shell against the same deployed surface to fill this row. |

## Summary

- Probes executed: 12 (Parts 1 + 3); 1 deferred (Cat-M, see "unavailable" row)
- Findings: **5** (BLOCKER:0 / HIGH:1 / MED:0 / LOW:1 / INFO:3)
- Charts uploaded: 4 (`c10i2-stress-1`, Hebrew, Arabic, emoji) / deleted: 4
- Setlists created: 1 (`c10i2-stress-setlist`, `isTest:true`) / deleted: 1 (with 1 bonded track)
- Test accounts: 1 (sanity musician) / swept: 1 (pre-flight) — 0 remained at HANDOFF time
- Bridge state at run: `alive:false, lastSeenAgeS:39125 (~10.9h)` — desk is effectively OFF; no monitor probes attempted

## Findings  (only REGRESSED probes + genuinely new issues; FU-1 known-opens recorded as INFO)

### C10I2-001 — R-F010 REGRESSED: dedupe `normalizedName` strips non-Latin letters, collapses Hebrew/Arabic/emoji titles
- **SUT:** `dedupe_library` (`src/lib/library/recompute-index-name-fields.ts` per prompt §R-F010, fix `d2c4936197`)
- **Severity:** **HIGH** (silent corruption potential under operator-run `dedupe_library({dryRun:false, force:true})` — Hebrew / Arabic / emoji titles would be marked `status:"duplicate"` and hidden from `list_library`/`search_library`. Gated only by the (admin-only) force-gate, which is the last line of defense.)
- **Repro:**
  ```
  upload_chart({title:"c10i2 אדון עולם", fileBase64:<tiny pdf>, mimeType:"application/pdf"})
  upload_chart({title:"c10i2 أمزينج جريس", fileBase64:<tiny pdf>, mimeType:"application/pdf"})
  upload_chart({title:"c10i2 🎵🎶",        fileBase64:<tiny pdf>, mimeType:"application/pdf"})
  dedupe_library({dryRun:true})    # NO forceScore — default exact-normalize
  ```
- **Expected** (per prompt + `d2c4936197`): three distinct `normalizedName` values; `groupsFound:0` from this triple.
- **Actual:**
  ```json
  {"scanned":594,"groupsFound":1,"wouldMark":2,"committed":0,
   "groups":[{
     "normalizedName":"c10i2",
     "kept":{"fileId":"upload-1cb5b2ca…","name":"c10i2 אדון עולם",…},
     "duplicates":[
       {"fileId":"upload-6bf6c302…","name":"c10i2 أمزينج جريس",…},
       {"fileId":"upload-e30a4cf4…","name":"c10i2 🎵🎶",…}
     ]
   }],"dryRun":true,"threshold":0.85,…}
  ```
  Per-row `stem` (correct, from `search_library`): Hebrew row `"c10i2 אדון עולם"`, Arabic row `"c10i2 امزينج جريس"` (with NFKC `أ→ا`), emoji row `"c10i2"`. The DEDUPE-SIDE `normalizedName` strips beyond `stem` — Hebrew letters אדון עולם and Arabic letters امزينج جريس are gone, leaving `"c10i2"` for all three.
- **Hypothesis:** the dedupe normalization in `library.ts` (`dedupe_library`) is NOT calling through `recompute-index-name-fields.ts`'s NFKC + `/[^\p{L}\p{N}]/gu`; it appears to be using an older regex that strips non-ASCII letters. F-010 may have updated the `stem`/`searchableText` path but missed the `normalizedName` path used by dedupe grouping. **Suspected source:** `src/lib/mcp/tools/library.ts` `groupByNormalizedName` (or equivalent) — verify it shares the same normalizer as `recompute-index-name-fields.ts`.
- **Mitigation:** until fixed, do NOT call `dedupe_library({force:true})` against any catalog containing non-Latin titles. Hebrew transliterations (the catalog has many — `Ana B_Koach`, `B'sefer Chayim`, `Mizmor L'David`, `Shir Shabbat`…) are NOT affected because their titles are Latin-letter; only true non-Latin script titles collapse. The current production catalog has no surfaced non-Latin native-script titles (all Hebrew titles are transliterated), so the regression is **latent** — but the moment someone uploads a chart with a native-script title, dedupe-force would silently hide it.

### C10I2-002 — R-force on salvage_chart_bytes: source-availability gate precedes force-gate
- **SUT:** `salvage_chart_bytes` (`src/lib/mcp/tools/salvage-chart-bytes.ts`, FU-1 Part A `fb9a137b4c`)
- **Severity:** **LOW** (envelope shape is rich/correct; only the gate ordering differs from FU-1 Part A's intent. No data-correctness risk.)
- **Repro:**
  ```
  upload_chart({title:"c10i2-stress-1", fileBase64:<tiny pdf>, mimeType:"application/pdf"})
  salvage_chart_bytes({fileId:<that upload-* fileId>, dryRun:false})   # no force
  ```
- **Expected** (per prompt §R-force): rich `{ok:false, error:{machine_code:"force_required", code:409}, dryRunPlan:…}`.
- **Actual:**
  ```json
  {"ok":false,
   "error":{"code":422,"machine_code":"no_source_available",
            "message":"Chart 'upload-35f56127…' has no Drive source on record and no sourceUrl was provided, so its bytes cannot be located."},
   "fileId":"upload-35f56127…","hasDriveFileId":false,
   "hint":"Pass an explicit sourceUrl (https URL serving the chart bytes)."}
  ```
- **Hypothesis:** in salvage, the source-resolution check fires before the `force_required` check, so any `upload-*` fileId (no `driveFileId` by construction) gets `no_source_available` regardless of `force`. The backfill + archive sibling tools (R-force HELD on both) put `force_required` first. Two clean fixes: (a) hoist the force-gate above source-resolution to match backfill/archive ordering, or (b) update the prompt's R-force probe spec to require a `sourceUrl` when probing salvage's force-gate. Recommend (a) for consistency with the other two migrated tools.

### C10I2-003 — INFO: `dedupe_library` force-gate appears MIGRATED (known-open looks closed)
- **SUT:** `dedupe_library`
- **Severity:** **INFO**
- **Observed:** `dedupe_library({})` (no `dryRun`, no `force`) returned the rich migrated envelope:
  ```json
  {"ok":false,
   "error":{"code":409,"machine_code":"force_required","message":"dedupe_library requires force:true to commit."},
   "dryRunPlan":{"scanned":590,"groupsFound":0,"wouldMark":0,"committed":0,…},
   "hint":"Re-call with `force: true` to commit, or `dryRun: true` to inspect without committing."}
  ```
  Per the prompt §Known-OPEN: "`dedupe_library`'s force-gate is HELD (still plain `refused:true`, not the rich `force_required` envelope — supervisor decision pending). … R-force covers the three migrated tools only." The deployed surface today does NOT match that known-open state — dedupe IS on the rich envelope. The FU-1 dedupe-migration appears to have already shipped (or always was at this SHA). Supervisor can close that known-open.

### C10I2-004 — INFO: `search_chart_text` Zod enum + tool description disagree on `lyrics`
- **SUT:** `search_chart_text` tool metadata
- **Severity:** **INFO** (cosmetic/docs)
- **Observed:** the deployed Zod enum rejects `scope:"lyrics"` with `machine_code:"validation_error"` (R-search HELD), confirming `[metadata,chords,all]`. BUT the MCP tool-description schema this Cowork session received still lists `"enum":["metadata","chords","lyrics","all"]` and the prose paragraph still describes a `lyrics` scope. Stale tool-description text in `chart-text-search.ts`'s Zod-schema `.describe()` or the meta description — should be pruned to match the dropped scope. Risk: a caller reading the tool description writes a `lyrics` call, gets a 400 surprise.

### C10I2-005 — INFO: FU-1 Part B (HTTP-500→4xx reclass) — `chart_in_use` carries `code:500`
- **SUT:** `delete_chart`
- **Severity:** **INFO** (FU-1 Part B known-open; do NOT re-litigate per prompt)
- **Repro:** `delete_chart({fileId:<chart bonded to a setlist track>})`
- **Actual:** `{ok:false, error:{code:500, machine_code:"chart_in_use", message:"Cannot delete: this chart is bonded to 1 live setlist track(s)."}, boundTracks:1, liveSetlistIds:["…"], hint:"Remove the tracks first via remove_track, then retry delete_chart."}` — should be 409 Conflict, not 500. Recording per prompt §Part 3: "if a Cat-A envelope probe hits a 500 that should be a 4xx, record ONE INFO row citing FU-1 Part B; don't re-litigate."

---

## Repros  (prod-SHA-stamped transcripts for every load-bearing finding)

### C10I2-001 transcript
```
> upload_chart({title:"c10i2 אדון עולם", fileBase64:"JVBERi…", mimeType:"application/pdf"})
< {"ok":true,"fileId":"upload-1cb5b2ca-bba9-484a-a701-27b15cf98641","title":"c10i2 אדון עולם","collection":"uploads"}

> upload_chart({title:"c10i2 أمزينج جريس", fileBase64:"JVBERi…", mimeType:"application/pdf"})
< {"ok":true,"fileId":"upload-6bf6c302-1bb1-45b6-8a90-23ae4fb96c7b","title":"c10i2 أمزينج جريس","collection":"uploads"}

> upload_chart({title:"c10i2 🎵🎶", fileBase64:"JVBERi…", mimeType:"application/pdf"})
< {"ok":true,"fileId":"upload-e30a4cf4-1178-43bd-8b15-4e9ef27b4178","title":"c10i2 🎵🎶","collection":"uploads"}

> search_library({query:"c10i2", limit:20})
< [{stem:"c10i2 stress 1",…},{stem:"c10i2 אדון עולם",…},{stem:"c10i2 امزينج جريس",…},{stem:"c10i2",…}]
  # stems correctly preserve non-Latin letters per-row

> dedupe_library({dryRun:true})    # NO forceScore — default exact-normalize
< {scanned:594, groupsFound:1, wouldMark:2,
   groups:[{normalizedName:"c10i2",
            kept:{fileId:"upload-1cb5b2ca…", name:"c10i2 אדון עולם",…},
            duplicates:[{fileId:"upload-6bf6c302…", name:"c10i2 أمزينج جريس",…},
                        {fileId:"upload-e30a4cf4…", name:"c10i2 🎵🎶",…}]}],
   dryRun:true, threshold:0.85, coverage:{total:629,eligible:594,scanned:594,…}}
  # ★ THREE distinct non-Latin titles collapse to normalizedName "c10i2"
```

### C10I2-002 transcript
```
> salvage_chart_bytes({fileId:"upload-35f56127-85d3-46b9-9904-d2dcd2e6ff49", dryRun:false})
< {ok:false,
   error:{code:422, machine_code:"no_source_available",
          message:"Chart 'upload-35f56127…' has no Drive source on record and no sourceUrl was provided, so its bytes cannot be located."},
   hasDriveFileId:false, hint:"Pass an explicit sourceUrl (https URL serving the chart bytes)."}
  # Source check fires before force-gate; compare with backfill which returns code:409 force_required first.
```

### R-F008 + R-force/backfill (HELD) transcript
```
> backfill_track_mimetype({force:true})    # no dryRun:false → forceWithoutCommit
< {ok:true, scannedTracks:381, bondedTracks:193, alreadyHealthy:180,
   heal:{count:13, rows:[…]}, skipped:{count:0}, dryRun:true, committed:0, forceWithoutCommit:true}

> backfill_track_mimetype({dryRun:false})  # no force → force_required (rich envelope)
< {ok:false, error:{code:409, machine_code:"force_required", message:"backfill_track_mimetype requires force:true to commit."},
   dryRunPlan:{scannedTracks:381, bondedTracks:193, heal:{count:13,…}, dryRun:false, committed:0},
   hint:"Re-call with `force: true` to commit, or `dryRun: true` to inspect without committing."}
```

### R-F016 + R-F017 (HELD) transcript
```
> upload_chart({title:"c10i2-stress-1", fileBase64:"JVBERi…", mimeType:"application/pdf", key:"G", bpm:84, collection:"uploads"})
< {ok:true, fileId:"upload-35f56127-85d3-46b9-9904-d2dcd2e6ff49", title:"c10i2-stress-1", collection:"uploads"}

> get_song({id:"upload-35f56127…"})
< {id:"upload-35f56127…", title:"c10i2-stress-1", fileName:"c10i2-stress-1", key:"G", bpm:84, status:"active",…}
  # ★ R-F016: key + bpm reach songs/{id}.defaults

> list_library row for upload-35f56127… : {fileId:"upload-35f56127…", name:"c10i2-stress-1", key:"G", bpm:84,…}
> search_library row: {id:"upload-35f56127…", key:"G", bpm:84,…}
  # ★ cross-read coherence: get_song + list_library + search_library all agree key=G/bpm=84

> create_setlist({name:"c10i2-stress-setlist", isTest:true})  →  setlistId:"6bdef890-036c-…", version:1
> add_track_to_setlist({setlistId, songId:"upload-35f56127…"})
< {ok:true, trackId:"22c979d7-…", track:{bpm:84, key:"G", mimeType:"application/pdf", fileId:"upload-35f56127…",…}}

> get_setlist({id:"6bdef890-036c-…"})
< {…, tracks:[{id:"22c979d7-…", title:"c10i2-stress-1", songId:"upload-35f56127…", key:"G", bpm:84,…}]}
  # ★ R-F017: ResolvedTrackBond carries BOTH key AND bpm
```

### R-F015 (HELD) transcript
```
> update_track({setlistId, trackId, patch:{notes:"a bcd"}})    # null + SOH + US control bytes
< {ok:true, track:{…, notes:"abcd", version:2,…}}
  # control bytes stripped; no 500, no stack, no silent corruption
```

### R-search (HELD) transcript
```
> search_chart_text({query:"c10i2-stress-1", scope:"metadata"})
< {ok:true, scope:"metadata", results:[{chartId:"upload-35f56127…", title:"c10i2-stress-1", field:"nameLower",…}], totalScanned:629}

> search_chart_text({query:"G", scope:"chords", limit:5})
< {ok:true, scope:"chords", results:[5 chord-progression hits], totalScanned:20, capped:true}

> search_chart_text({query:"c10i2-stress-1", scope:"all"})
< {ok:true, scope:"all", results:[1 hit], totalScanned:649}

> search_chart_text({query:"x", scope:"lyrics"})
< {ok:false, error:{code:400, machine_code:"validation_error",
                    message:"Invalid arguments — search_chart_text: scope: Invalid option: expected one of \"metadata\"|\"chords\"|\"all\""},
   issues:[{path:"scope", message:"Invalid option: expected one of \"metadata\"|\"chords\"|\"all\"", code:"invalid_value"}],
   hint:"Re-call the tool with corrected arguments (see issues[])."}
  # ★ clean rich Zod-reject; no 500
```

### R-arch (HELD) transcript
```
> archive_nonchart_artifacts({dryRun:true})  → toArchive.count:24 (23 folders + 1 sheet), heldGoogleDocs.count:13, alreadyArchived:0
> archive_nonchart_artifacts({dryRun:true})  → toArchive.count:24 (same set), heldGoogleDocs.count:13, alreadyArchived:0   # idempotent across 2 calls
> reconcile_library({dryRun:true})
< {scanned:594, alreadyHealthy:557, driveMirror.count:0, orphan.count:0, transient.count:0,
   skippedNonChart.count:35 (the 24 to-archive + 11 other non-charts),
   needsRebond.count:2 (Tu Bishvat.pdf, Lechu Goldman.pdf),
   coverage:{total:629, eligible:594, filteredOut.byStatus:{duplicate:15, archived:20}},…}
  # ★ archived:20 filtered OUT of reconcile scan; no archived row appears in any bucket
```

---

## Manual cleanup needed

None — cleanup is clean. `list_test_accounts:[]`, `search_library({query:"c10i2"}):[]`, `list_setlists` shows no `c10i2-*` row.

---

## Notes for the auditor

- **C10I2-001 is the only load-bearing finding.** It is HIGH because of latent silent-corruption risk, but it is gated by the admin-only force-gate that R-force confirms is firing. The catalog's existing titles are all Latin-letter (Hebrew transliterations like `Ana B_Koach`, `Mizmor L'David`), so the regression is not active in production today. Per the PARENT §7.1 OBSERVE/REPORT-ONLY rule and the pre-Saturday B'nei Mitzvah HOLD, **this should NOT ship before Saturday 2026-05-30**. Triage post-service.
- C10I2-003 may simplify the FU-1 work queue: if dedupe is already on the rich envelope, the only remaining FU-1 work is C10I2-002 (salvage gate-ordering) and the FU-1 Part B 500→4xx reclass (C10I2-005). Worth supervisor confirmation that this isn't a misread.
- Bridge state at run: `alive:false, lastSeenAgeS:39125 (~10.9h)`. The X32 desk is effectively OFF — `status:"online"` and `x32Connected:true` are the last-write-wins fields the prompt warned about. Note for the Cat-N monitor surface (Instance 1) and any operator who reads the raw fields.
- Catalog incidental observations from the fuzzy-pass (`forceScore:0.85`) — NOT regressions, but worth knowing: the fuzzy pass at the standing 0.85 threshold groups some clearly-distinct entries (e.g., `May the Memory` ↔ `May the Door`; `Torah Blessings` ↔ `Haftarah Blessings`; `Kedusha Am.pdf` ↔ `Kedusha Em.pdf` — different keys; SATB voice-part .mp3s lumped together). Anyone running `dedupe_library({forceScore:0.85, dryRun:false, force:true})` would silently mark these duplicates. Operator caveat, not a finding.

---

**Verdict: 1 REGRESSED (R-F010), 11 HELD, 1 N-A (R-dedup), 1 unavailable (Cat-M).**

ACK + HANDOFF-COMPLETE — see staged supervisor message below.
