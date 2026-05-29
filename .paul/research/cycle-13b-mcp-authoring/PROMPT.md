# Cycle-13b Cowork — MCP authoring round-trip stress (agent-ergonomics methodology)

> **Drafted 2026-05-29 against deployed surface at origin/master `952edac4c3`** — every
> MCP tool name, arg shape (zod inputSchema), envelope field, route, harness helper, and
> line-ref cited below was verified via `git ls-tree` + reading `src/lib/mcp/tools/index.ts`
> + the impl files against that SHA, per `[[feedback_cowork_prompt_verify_before_write]]`.
> **Re-confirm at run-time** via `git log -1 origin/master` and note any drift inline in §A.
>
> **What this axis is.** Cycle-13 runs 4 parallel cowork axes (charter
> `.coord/cycle-13-CHARTER.md`). This is **axis B — Daniel's PRIMARY surface: the
> Claude-Desktop MCP authoring round-trip.** It is the actual weekly flow
> (`[[user_mcp_is_primary_author_workflow]]` + Core Workflow): Daniel (and David
> Lazaroff, 2nd band_leader) author next week's setlist by talking to Claude, which
> calls the MCP server at `/api/mcp`. Daniel does NOT touch the in-app UploadDialog /
> ScraperModal anymore. **The browser app is the band/consumer surface; the MCP surface
> is the authoring surface.** If the MCP surface is confusing, lossy, silent, or wrong,
> the band gets a broken setlist and nobody notices until the musician is staring at it.
>
> **The unit of value (read this twice).** The other 3 axes (13a leader-broadcast, 13c
> WebKit re-verify, 13d bond-hygiene/picker) shadow **the musician** with an iPad. This
> axis shadows **the authoring AGENT** — the LLM making MCP calls on Daniel's behalf. The
> finding is *a moment in the agent's reasoning where the tool surface caused it to make
> a wrong, lossy, or silent call.* These bugs are **structurally invisible to the
> musician-shadow axes**, because by the time the musician opens the iPad the data is
> *already wrong* — the authoring agent's chance to be warned has passed. That is the
> entire reason this axis exists.
>
> **You are not running this against real data carelessly.** §0 clones the real upcoming
> setlist to an `isTest`-stamped fixture; every WRITE probe hits the clone, never a real
> recipient. Authoring is mostly *reads + writes-to-a-throwaway-clone*, so the blast
> radius is naturally small — but the discipline still binds.

---

## §0 — What this axis BREAKS vs the cycle-12 PARENT (required disclosure)

The cycle-12 PARENT (`.paul/research/cycle-12-saturday-readiness/PROMPT.md`, hybrid
musician-shadow methodology) and the cycle-11 trio (M1 narrative / M2 matrix / M3
heuristic) all shadow **the musician in Perform mode**. This axis deliberately breaks
from that frame in five ways:

1. **POV flip: shadow the authoring agent, not the musician.** First-person voice is the
   *LLM author's* reasoning ("I called `clone_setlist`; the response had `bondReviewCount:
   3`; the description said it's 'advisory' — so I published without walking them. Was that
   right?"). No prior cycle has shadowed the agent. (breaks **AP-5** in a new direction.)
2. **Surface under test is MCP, not DOM.** Zero Perform-mode/iPad/WebKit probing. The
   "interface" being stress-tested is the *tool description + arg schema + response
   envelope*, which is the only UI the authoring agent ever sees. (13c owns WebKit;
   this axis owns the tool surface.)
3. **Bug = mis-call, not mis-render.** A finding is a place where a fresh agent makes the
   *wrong tool call* or *loses the user's intent silently*. (breaks **AP-1**: every card
   ties to an authoring beat + a downstream musician moment, never "the description is
   ambiguous" in the abstract.)
4. **The 3 charter bug-classes are re-cast for authoring** (§2.4): stickiness →
   *write-durability / dual-write half-application*; fresh-tablet → *cold-agent authoring*
   (a fresh Claude context with no memorized gotchas); auth-divergence → *role-scoped
   authoring* (David band_leader vs Daniel admin). (breaks **AP-7**: ≥2 author identities +
   warm-vs-cold agent context.)
5. **Findings carry a propagation arrow.** Each card names *which musician anchor moment
   (A1/A2/A4) the authoring bug corrupts downstream* — the explicit link that lets triage
   merge an axis-B authoring finding with an axis-13a/c/d musician finding. (breaks **AP-4**:
   §B WHAT-WE-LEARNED is about the authoring surface's *design*, not a bug count.)

This axis does **NOT** break **AP-2** (it is deliberately narrow — one week's authoring
round-trip, not an app-wide roam) and only partially breaks **AP-3** (markdown is
source-of-truth; an optional `findings.jsonl` mirror is secondary).

---

## §0.5 — Three drift-corrections folded in from the verify-every-ref pass

The verify pass against `952edac4c3` caught three claims in the dispatch / prior cycle
PROMPTs that the deployed code does NOT bear out. They are corrected here so the running
agent does not repeat them:

| Claim in a prior doc | Deployed reality at `952edac4c3` | Where verified |
|---|---|---|
| "`add_track` / `add_track`" | The tool is **`add_track_to_setlist`**. There is no `add_track`. | `index.ts:855` |
| "`stage_proposal({setlistId,edits})`" (cycle-12 §2.2) | The staging tool is **`propose_setlist_changes`** with `{setlistId, proposals[], ttlSec?}`. There is **no** `stage_proposal`, and the field is `proposals`, not `edits`. | `index.ts:1244` |
| "`list_setlists` (excludeTest:true default)" (dispatch §1) | `list_setlists` has **no `excludeTest` arg and does NO isTest filtering at all** — it returns every setlist, date-windowed/paged only (`_uid` is unused → no owner-scoping either). The `/perform` *landing* filters isTest via `splitPublicSetlists`, but the MCP tool does not. | `setlists.ts:60-132` |

These are not just nitpicks — drift-correction #3 is itself a finding seed (see F-C13B
sample 002): an authoring agent calling `list_setlists` gets test fixtures interleaved
with real services and no documented way to tell them apart.

---

## §1 — The deployed authoring surface (verified tool map — your reference card)

The live MCP registry at `952edac4c3` is **108 statically-registered tools** (count via
`grep -rhA1 'registerTool($' src/lib/mcp/tools/*.ts | grep -oE '"[a-z_]+"' | sort -u`;
the harness probe `97c294c621` enumerated **109** live — the +1 is a registrar-injected
tool not visible to the static scan). **MEMORY DRIFT FLAG:** `[[project_mcp_status]]` says
"24 tools live" — that is stale by ~85 tools. Cite the real number (108/109); the
SHIP-NOTICE flags this for a supervisor memory amend.

You will exercise this **authoring subset** (each verified — name → `index.ts` line →
arg shape). Use this as your call-reference; do NOT re-derive arg names from memory.

### Read / discovery
| Tool | line | key args | notes for the agent |
|---|---|---|---|
| `list_setlists` | 301 | `{from?, to?, limit?(≤200,def 20), offset?, sort?('recent_write'\|'recent_event')}` | **No isTest filter** (drift #3). `sort:'recent_event'` = "next service to plan". |
| `get_setlist` | 341 | `{id}` | returns tracks in order + per-track `version` (W-04). `setlist_not_found` richError if absent. |
| `search_library` | 365 | `{query, key?, bpmMin?, bpmMax?, limit?(≤50), includeOrphaned?, includeNonCharts?, includeUnbindable?}` | **Hebrew transliteration is NOT fuzzy-matched (C7I1-012, deferred)** — `Lechu`/`Lchu`/`Lekhu` are distinct substrings; 0 hits → retry 2-3 variants. |
| `get_song` | 410 | `{id}` | metadata only. `song_not_found` richError. |
| `list_library` | 434 | `{collection?, limit?, offset?, includeNonCharts?, includeNonChartHealthy?}` | `coverage:{}` field parity with hygiene tools. |
| `review_chart_bonds` | 1449 | `{setlistId}` | title-vs-filename token-overlap; returns `{trackId,title,fileId,chartFileName,overlapScore(0-1),mismatch}` + `mismatchCount`/`bondedCount`. Read-only. |
| `verify_setlist_charts` | 1430 | `{setlistId, markOrphaned?}` | HEAD-checks bonds (ok/missing/unreachable/unbonded). |

### Clone / template (the weekly starting point)
| Tool | line | key args | returns |
|---|---|---|---|
| `clone_setlist` | 580 | `{sourceSetlistId, newName?, newEventDate?(nullable), copyServiceNotes?(def true)}` | `{setlistId, sourceSetlistId, trackCount, ownerId, ownerName, version, bondReviewCount, bondReviewRows[{position,trackId,fileId,chartFileName,overlapScore}], staleMetadataCandidates}`. **eventDate does NOT auto-copy.** |
| `clone_setlist_from_template` | 769 | `{templateId, newName(required), newEventDate?(nullable), copyServiceNotes?}` | parity `{setlistId, sourceTemplateId, trackCount, …, bondReviewCount, bondReviewRows}`. |
| `create_template_from_setlist` | 802 | `{setlistId, name(required), templateType?, copyServiceNotes?}` | `{templateId, sourceSetlistId, …}`. |
| `list_templates` | 624 | `{templateType?, ownerUid?}` | admin+band_leader only. |
| `get_template` / `create_template` / `update_template` / `delete_template` | 648/664/712/753 | — | full CRUD; admin+band_leader. |

### Track edits (the "tweak a few songs" core)
| Tool | line | key args | notes |
|---|---|---|---|
| `add_track_to_setlist` | 855 | `{setlistId, songId?, title?, type?('song'\|'header'\|'reading'\|'prayer'\|'transition'\|'note'), key?, leadMusician?, referenceLink?, notes?, position?, force?}` | `force` overrides `chart_unbindable` (dead bytes). |
| `bulk_add_tracks` | 907 | `{setlistId, tracks[](≤50), position?, mode?('atomic'\|'best-effort'), dryRun?}` | **`committed:boolean` is the load-bearing signal.** |
| `update_track` | 1047 | `{setlistId, trackId, patch(updateTrackPatchSchema), lastSeenVersion?}` | `songId:null` unbonds; new `songId` re-bonds (fileId follows). `position` allowed inside patch here. |
| `bulk_update_tracks` | 1096 | `{setlistId, patches[](≤50), mode?, dryRun?}` | per-patch `lastSeenVersion`; `committed` load-bearing; `position` **rejected** inside patch (use `update_track`). |
| `swap_chart` | 1070 | `{setlistId, trackId, newSongId, syncMetadata?(def true)}` | atomic re-bond + title/key resync. Arg is **`newSongId`**. |
| `remove_track` | 1003 | `{setlistId, trackId, lastSeenVersion?}` | re-packs contiguous. |
| `reorder_setlist` | 985 | `{setlistId, orderedTrackIds[], lastSeenVersion?}` | must list every current id exactly once. |
| `update_setlist` | 835 | `{id, name?, eventDate(eventDateSchema), serviceType?, rabbi?, serviceNotes?, lastSeenVersion?}` | metadata only; never touches tracks. |
| `update_song` / `edit_library_entry` | 2662 / 1925 | — | catalog-side edits; see dual-read note below. |

### The W-01 propose→commit + bond-review authoring loop
| Tool | line | key args | notes |
|---|---|---|---|
| `propose_setlist_changes` | 1244 | `{setlistId, proposals[{action('add'\|'update'\|'remove'), trackId?, position?, songId?, title?, key?, leadMusician?, referenceLink?, notes?, type?}](1-50), ttlSec?(def 600,max 3600)}` | **STAGES, no writes.** Returns `{stageId, …}` + per-proposal `confidence`('high'\|'medium'\|'low')/`flags`('generic_title'\|'orphan_risk'\|'no_library_record')/`explanation`. Also a duplicate `id` field (W-01 wire-shape) — prefer `stageId`. `reorder` NOT supported as a proposal. |
| `commit_staged_changes` | 1328 | `{stageId, lastSeenVersion?}` | COMMITS atomically; deletes the stage. `{ok, setlistVersion, addedTrackIds, updatedTrackIds, removedTrackIds}` or `stale_version`/`stage_expired`/`Stage not found`. |
| `preview_publish` | 1349 | `{setlistId, audience?('band'\|'all')}` | read-only; returns `chartHealth`/`audience`/`snapshotDiff`/`flaggedBonds`/`recommendation`('hard_block'\|'review_first'\|'publish'). |
| `flag_bond` | 1368 | `{setlistId, trackId, reason}` | queues a row for review. |
| `review_flagged_bonds` | 1387 | `{setlistId}` | walks the queue + up to 5 ranked alternative songIds. |
| `record_bond_correction` | 1400 | `{setlistId, trackId, fromSongId, toSongId, reason?}` | the LEARNING signal (self-heal per `[[feedback_learning_self_healing]]`); does NOT mutate the row — use `update_track`/`swap_chart` for that. |
| `publish_setlist` | 1126 | `{setlistId, audience?, recipients?, note?, subject?, dryRun?}` | fan-out (in-app/push/email/SMS-first-publish). `dryRun` previews recipients. |

### Chart import + dedup
| Tool | line | key args | notes |
|---|---|---|---|
| `import_chart_from_drive` | 2460 | `{driveFileId, title?, collection, key?, bpm?, tags?, force?, dryRun?}` | **PREFER over `upload_chart`** (no base64; tiny body). Drive-native Docs/Sheets/Slides rejected → export to PDF first. `force` bypasses dedup. `dryRun` observability (no force needed). |
| `dedupe_library` | 1462 | `{dryRun?, force?, forceScore?(0-1)}` | admin-only. **dryRun-default; a real run without `force:true` returns the plan with `refused:true`** (`[[feedback_dryrun_is_observability]]`). Standing 0.85 strict threshold (`[[feedback_dedup_force_override]]`); `forceScore` is per-call tuning only. |

### eventDate — the highest-value authoring trap (verified, now-mitigated; you VERIFY the warning lands)
`eventDateSchema` (`index.ts:138`) is just `z.string().refine(Date.parse).optional()` — it
does NOT reject a `Z`-suffixed ISO. The semantics live in `src/lib/parse-event-date.ts`
(your just-shipped `2953cd3ce8` lineage). **The trap, verbatim from the file's own docstring:**

> Claude Desktop / authoring agents routinely construct `"2026-05-30T10:00:00.000Z"`
> thinking the trailing `Z` is "the ISO format" — when it actually pins the instant to
> UTC zero, producing 5am Chicago for a 10am service. **Live exemplar (2026-05-28):**
> Saturday B'nei Mitzvah `cd2010f4-…` stored `eventDate: "2026-05-30T10:00:00.000Z"` = 5am
> CDT, authored via MCP `clone_setlist_from_template` with a Z-suffixed ISO.

The fix: `parse-event-date.ts` now interprets a **naive** datetime (`"2026-05-30T10:00"`,
no Z) as America/Chicago wall-clock; an explicit `Z`/`±HH:MM` is *preserved* (the caller
was explicit). **This axis must verify the warning is DISCOVERABLE by a cold agent** —
i.e. does any tool *description* the agent reads (`update_setlist`, `clone_setlist`'s
`newEventDate`, `clone_setlist_from_template`'s `newEventDate`) actually steer it away from
the `Z` form, or does the agent have to read `parse-event-date.ts` source (which it never
sees) to know? **That discoverability gap is a live finding candidate, not a closed bug.**

### The dual-read catalog trap (`[[project_catalog_dual_read_surfaces]]`)
key/bpm/lead live in **two** docs: `songs/{id}.defaults` (read by `get_song`/`search_library`/
bond resolution) vs `library_index/{id}` (read by `list_library`/website/`edit_enrichment`).
`processChartUpload` writes only `library_index` → a catalog edit must hit BOTH via
`applySongMetadata` (`src/lib/mcp/tools/song-metadata.ts:73`). **Authoring stress:** when the
agent edits a song's key, does the edit land in both docs, or does the surface it used hit
only one — so `get_setlist` shows the new key but the website still shows the old (or vice
versa)? A half-applied dual-write is the authoring analog of a stickiness regression.

---

## §2 — Methodology: agent-ergonomics round-trip walkthrough

### §2.1 — The frame
Walk a **fresh Claude Desktop authoring agent** through one realistic week's setlist
authoring, end to end, and at *every MCP call* grade the ergonomics:

> Did the tool surface (its **description**, its **arg schema**, its **response envelope**,
> its **force-gate**, its **dual-write contract**) cause the agent to make a wrong call,
> lose the user's intent silently, or proceed past a problem it should have surfaced?

The "good" outcome: a cold agent with no memorized gotchas authors a correct, fully-bonded,
correctly-dated, published setlist on the first pass, warned at every fork. The "bad"
outcome: the agent ships a setlist that is *already wrong* — wrong key, wrong time, a
mis-bond, a half-applied edit — and nothing in the surface told it.

### §2.2 — The finding card shape
Every finding self-describes with this card. PROSE-FORWARD (per AP-3); optional
`findings.jsonl` mirror at end of run.

```markdown
### F-C13B-NNN — <one-line: the wrong/lossy/silent call in the agent's terms>
- **Authoring beat:** clone | tweak-track | bond/swap | import-chart | eventDate | propose→commit | bond-review | preview/publish | template
- **Bug-class (authoring re-cast):** write-durability | cold-agent | role-divergence
- **Author identity:** Daniel (admin) | David (band_leader) | both
- **Agent context:** cold (fresh session, no memorized conventions) | warm (has prior-week context)
- **Tool(s) + verified arg shape:** `propose_setlist_changes({setlistId, proposals[]})` (index.ts:1244)
- **The agent's experience (1-3 sentences, first-person LLM-author POV):**
  > "I staged 12 proposals and got back a `stageId`. Three proposals had
  > `flags:['generic_title']` and `confidence:'low'`. The description said these are
  > 'derived from titleSpecificity' but didn't tell me whether I should re-search for a
  > better songId before committing or just commit. I committed. Two of those rows
  > bonded to the wrong arrangement."
- **The misleading surface (what specifically misled the call):** description / envelope /
  schema / force-gate / dual-write — name the exact element + quote it.
- **Downstream musician impact (the propagation arrow → which anchor moment it corrupts):**
  e.g. "→ A2: the musician taps track 7 between songs and the chart is the wrong Hashkivenu;
  6-second window blown." (A1 setup-prep | A2 between-songs | A4 sanctuary-edge.)
- **Severity:** author-felt (how badly it derails authoring) × musician-felt (how badly the
  resulting data hurts the service). HIGH only if BOTH are real.
- **Affordance fix (1-3 sentences):** the description/envelope/schema change that would have
  warned the cold agent in-band. Tie to the established envelope conventions
  (`force_required` rich envelope REG-003, `dryRun`-is-observability, `committed` boolean).
```

### §2.3 — Anchor-moment mapping (charter §1 vocabulary)
Authoring is **pre-A1** — it produces the setlist that A1 (musician setup-prep) then
consumes. So almost every authoring finding's propagation arrow points at **A1** first,
then forwards into A2/A4 if the corrupt datum is touched mid-service:

| Authoring corruption | A1 setup-prep symptom | forwards to |
|---|---|---|
| half-applied key dual-write | "the leader's iPad shows G, mine shows the website's old A" | A2 (wrong key between songs) |
| eventDate `Z`-trap | service card says 5:00am | — (A1 only; cosmetic-but-confusing) |
| mis-bond committed past a low-confidence flag | "this chart is the wrong song" | A2 / A4 |
| `committed:false` misread as success | "it says 0 songs / the track I added isn't here" | A1 (empty setlist) |
| stale-version silent clobber (no `lastSeenVersion`) | David's edit silently overwrote Daniel's | A4 (cross-author shared-state) |

**A3 (mid-service key/song change) is OWNED BY AXIS 13a** — do NOT probe live broadcast
here. If an authoring beat *touches* A3 (e.g. an agent editing a setlist that's live on
stands), note it in §F parking-lot and defer to 13a.

### §2.4 — The 3 charter bug-classes, re-cast for authoring (each MUST surface as a named beat)
1. **Write-durability (← stickiness).** Did the write land *durably and completely*? Probe:
   dual-write parity (`applySongMetadata` — key edit in BOTH `songs.defaults` AND
   `library_index`); `songCount`/`trackCount` denorm after `clone_setlist`/`commit_staged_changes`
   (the `ae647fac20` leak paths); `committed:boolean` honesty on `bulk_*`/`dedupe_library`;
   eventDate persisting as the intended wall-clock after `update_setlist`.
2. **Cold-agent authoring (← fresh-tablet).** A *fresh* Claude context with zero memorized
   conventions. Does the surface guide it correctly **without** the agent having learned the
   gotchas (Z-trap, `newSongId` vs `songId`, `propose_setlist_changes` not `stage_proposal`,
   dedupe `force` semantics, Hebrew-transliteration non-fuzzy search)? Every gotcha a warm
   agent "just knows" is a cold-agent trap.
3. **Role-divergence (← auth-divergence).** David (band_leader) vs Daniel (admin). band_leader
   may clone others' setlists + CRUD templates (verified gates in the descriptions); admin-only
   tools (`dedupe_library`, the backfills, `recompute_setlist_track_count`) return
   `forbidden_role` to David. Does the agent get a *clear* remediation when it tries an
   admin-only tool as David, or an opaque refusal? (`[[feedback_mcp_validation_shape]]`:
   refusals surface as `result.isError:true` + prose, never JSON-RPC `-32602`.)

---

## §3 — Boot, sandbox, identity (HARD-BLOCK on failure → BLOCKER to supervisor, stop)

### §3.1 — Boot pre-flight
1. `git rev-parse --is-shallow-repository` → must be `false`. If `true`, `git fetch
   --unshallow origin` + re-verify (shallow-boundary commits lie — `[[feedback_supervisor_verify_commit_diff_not_subject]]`).
2. `git log -1 origin/master` → expected `952edac4c3` (± later cycle-13 sibling/fix lands).
   If advanced, re-run the §1 verify preamble against the new tip; note drift inline in §A.
3. Source the supervisor MCP bearer: `BEARER=$(node scripts/supervisor-prod-bearer.mjs)`
   (reads `SUPERVISOR_PROD_BEARER` from gitignored `.env.local` — `[[feedback_supervisor_bearer_persistence]]`).
   Assert `[ -n "$BEARER" ]` and it starts `crl_live_`. **NEVER write the bearer into any
   file under `sheet-music-app/`** — redact as `***redacted***` in the REPORT.
4. `list_setlists({sort:'recent_event'})` (admin bearer) returns ≥1 row. Capture the most
   recent real upcoming service as your clone source `<sourceSetlistId>`. (Pick the genuine
   upcoming service at run-time; do NOT hardcode a stale id.)
5. `get_setlist({id:<sourceSetlistId>})` → capture the reference shape: trackCount,
   songCount, and per-track {id, type, position, title, key, fileId, songId, leadMusician}.
   This is your before/after oracle for every write probe.

### §3.2 — Sandbox: clone the source to an `isTest` fixture (NEVER write the real one)
Verified against `clone-setlist.ts` + the auto-stamp regex `TEST_SETLIST_NAME_PATTERN =
/^\[(TEST|CYCLE\d+-|CF\d+-)/i` (`src/types/models.ts:128-142`) + `isTestUid`
(`src/lib/test-isolation.ts`). A `[CYCLE13B-…]`-prefixed name auto-stamps `isTest:true`.

```js
const clone = await mcp.call("clone_setlist", {
  sourceSetlistId: SOURCE_ID,
  newName: "[CYCLE13B-authoring] c13b weekly-authoring round-trip probe",
  // newEventDate omitted on purpose — we'll set it deliberately in §4 step E to probe the Z-trap.
  copyServiceNotes: false,
});
const fixtureId = clone.setlistId;
const cloneShape = await mcp.call("get_setlist", { id: fixtureId });
// ASSERT cloneShape.isTest === true BEFORE any write. If false → supervisor BLOCKER + stop.
// Also capture clone.bondReviewCount / clone.bondReviewRows / clone.staleMetadataCandidates
// — these ARE probes (see §4 step F).
```

### §3.3 — Identity: 2 author personas (Daniel admin + David band_leader)
Per `[[feedback_sandbox_test_isolation]]`: create-side `uidPrefix`, cleanup-side `prefix`
(same value, different name — `test-tokens.ts:193` validates `uidPrefix` against
`UID_PREFIX_RE`: lowercase alphanumeric + single hyphens, 1-32 chars). `c13b-authoring`
passes. **NEVER** call `cleanup_all_test_data` without `prefix`
(`[[feedback_self_inclusion_test_fixtures]]`).

```js
const david = await mcp.call("create_test_account", { role: "band_leader", uidPrefix: "c13b-authoring" });
// Daniel-admin persona: POST /api/auth/admin-test-session with header `x-admin-test-secret`
// (verified route.ts:56 SECRET_HEADER — NOT the long `x-mcp-admin-test-session-secret` name).
// Conditional on MCP_ADMIN_TEST_SESSION_SECRET being set in env. If unset, run admin-side
// probes with the supervisor root bearer (which is admin-scoped) and mark §A; run David's
// band_leader probes with david.token.
```
This is an **MCP-first axis** — most probes are MCP calls, NOT Playwright. You do NOT need a
harness-warm worktree (`[[feedback_cowork_harness_warm_worktree]]`) for axis B, because
there are no WebKit/iPad probes here. (Contrast 13c, which does.) The only browser touch is
the optional read-back of the public landing in §4 step H to confirm a write propagated.

---

## §4 — The round-trip walkthrough (~75 min single-thread per `[[feedback_cowork_real_harness]]`)

Run as a **cold agent**: pretend you have NO memory of CRC conventions. Read only what a
tool's description tells you. When you reach for a gotcha you "know," STOP and ask: *would a
fresh agent know this from the surface alone?* If not → that's a cold-agent finding.

| Step | Beat | ~min | What to do + what to grade |
|---|---|---|---|
| **A** | boot + clone + identity | 10 | §3. Capture `cloneShape`, `bondReviewCount`, `staleMetadataCandidates`. |
| **B** | discover last week | 8 | `list_setlists({sort:'recent_event'})` then `get_setlist`. **GRADE:** are test fixtures interleaved with real services with no flag? (drift #3 → F-002 seed.) Does `sort` behavior match the description? |
| **C** | tweak a few songs | 12 | On the **fixture**: swap 2 songs (`search_library` → `swap_chart({newSongId})`); change 1 key (`update_track({patch:{key}})`); add 1 new song row (`add_track_to_setlist({songId})`); remove 1. **GRADE:** Hebrew search 0-hits→variant-retry discoverability; `newSongId` vs `songId` naming confusion; `force` gate on a dead-bytes bond; does the key edit propagate to BOTH catalog docs (dual-read parity — read back via `get_song` AND `list_library`)? |
| **D** | propose→commit a batch | 12 | Stage 8-12 edits via `propose_setlist_changes`; inspect `confidence`/`flags`/`explanation`; `commit_staged_changes({stageId})`. **GRADE:** does the agent know whether to act on `confidence:'low'`/`flags:['generic_title']` BEFORE commit? `committed`/`addedTrackIds` honesty. Force a `stale_version` (edit the fixture out-of-band between propose and commit) and grade the recovery clarity. Force a `stage_expired` (ttlSec:1, wait) and grade the error. |
| **E** | set the event date | 8 | `update_setlist({id:fixtureId, eventDate:<value>})`. **THE Z-TRAP PROBE:** as a cold agent, what value do you construct for "this Saturday at 10am"? If you reach for `"…T10:00:00.000Z"`, does ANY description warn you off it? Set it both ways (`"…T10:00"` naive AND `"…Z"`) and read back via `get_setlist` — confirm the naive form lands as 10am Chicago and the Z form lands as 5am. **GRADE the discoverability of the warning, not just the parse behavior.** |
| **F** | review the bonds | 10 | `review_chart_bonds({setlistId:fixtureId})` + walk `bondReviewRows` from the clone. `flag_bond` a mismatch, `review_flagged_bonds`, `record_bond_correction`, then `swap_chart` to actually fix it. **GRADE:** does the agent understand `record_bond_correction` does NOT mutate the row (it's the learning signal) and a separate `swap_chart`/`update_track` is still required? (The description says so — does a cold agent catch it?) |
| **G** | preview + publish | 8 | `preview_publish({setlistId:fixtureId})` → read `recommendation`. `publish_setlist({dryRun:true})`. **GRADE:** does `recommendation:'review_first'` vs `'hard_block'` vs `'publish'` give the agent a clear go/no-go? Is `bondReviewCount` from the clone reconcilable with `flaggedBonds` from preview (two different "something's off" counters — does the agent know which to trust)? |
| **H** | role-divergence | 5 | Re-run a representative slice as **David (band_leader)**: clone, template CRUD (allowed), then attempt an admin-only tool (`dedupe_library({dryRun:true})` or `recompute_setlist_track_count`). **GRADE:** is the `forbidden_role` refusal clear + actionable (`result.isError:true` + prose, per `[[feedback_mcp_validation_shape]]`)? |
| **I** | template round-trip (optional) | 5 | `create_template_from_setlist` from the fixture → `clone_setlist_from_template` → confirm `bondReviewCount` parity. |
| **J** | cleanup + REPORT | 10 | §5 cleanup, then write §A-§F. |

Time-box each step; a cell that runs >2 min over → `⊘ deferred`, note it, move on.

---

## §5 — Cleanup (MANDATORY before HANDOFF-COMPLETE)
```js
await mcp.call("delete_setlist", { id: fixtureId, force: true });
// + any secondary clones / templates created in steps I:
await mcp.call("delete_template", { templateId: createdTemplateId });
await mcp.call("cleanup_all_test_data", { prefix: "c13b-authoring" }); // NEVER without prefix
await mcp.call("list_test_accounts", {});               // → none matching c13b-authoring
await mcp.call("list_setlists", {});                    // → no [CYCLE13B-…] rows
await mcp.call("search_library", { query: "c13b" });    // → empty
```
Any residual → list under §G "Manual cleanup needed"; Daniel sweeps.

---

## §6 — Output shape (the deliverable)
Write to **`.paul/research/cycle-13b-mcp-authoring/REPORT.md`** (ONE consolidated file;
optional `findings.jsonl` mirror for grep at the end).

```markdown
# Cycle-13b MCP authoring round-trip — REPORT
**Run date:** YYYY-MM-DDTHH:MMZ
**Wall-clock:** ~75 min single-thread
**Master SHA at run:** <git log -1 origin/master>  (expected `952edac4c3` ± drift)
**Tool count observed:** <enumerate from server tools/list> (expected ~108-109; flag if memory says 24)
**Author personas:** Daniel (admin) + David (band_leader) [or note admin-via-root-bearer if secret unset]
**Source setlist (read-only reference):** <sourceSetlistId>
**Fixture clone (write target):** <fixtureId> — `[CYCLE13B-…]`; isTest:true verified at create-time
**Anchor propagation coverage:** A1 ✓  A2 ✓  A3 DEFER-TO-13a  A4 ✓
**Bug-class coverage:** write-durability ✓  cold-agent ✓  role-divergence ✓
**Cleanup state:** clean | partial (list orphans)
**Authoring-surface verdict:** SURFACE-IS-SOUND | SURFACE-NEEDS-FIXES <list P0/P1> | SURFACE-IS-A-TRAP

## §A — Authoring-surface verdict (≤200 words)
Would a *fresh* Claude Desktop agent, with no memorized CRC conventions, author next week's
setlist correctly on the first pass using only what the tool surface tells it? What is the
single biggest place the surface lets a cold agent ship already-wrong data? Note any
verify-every-ref drift observed at run-time.

## §B — WHAT-WE-LEARNED (≥3 design principles about the authoring SURFACE)
Designer-actionable insights about the tool surface's ergonomics, NOT a bug count (AP-4).
e.g. "Every gotcha a warm agent 'just knows' is a latent cold-agent trap — the surface
should encode the convention in the description, not rely on the agent having learned it."

## §C — Findings (per the §2.2 card; tagged beat + bug-class + propagation arrow)
Each `F-C13B-NNN`. Order by severity within beat. Target 5-12; quality > quantity.

## §D — The cold-agent gotcha table (every convention a warm agent knows but the surface doesn't teach)
| Gotcha | Surface element that should teach it | Does it? | finding |
|---|---|---|---|
| eventDate naive-not-Z | update_setlist/clone newEventDate descriptions | ? | F-C13B-NNN |
| `newSongId` not `songId` on swap_chart | swap_chart description | ? | |
| dedupe real-run needs `force:true` | dedupe_library description | ? | |
| Hebrew search not fuzzy → retry variants | search_library description | ✓ (documented) | |
| record_bond_correction ≠ row mutation | record_bond_correction description | ? | |

## §E — Dual-write / durability matrix (write-durability bug-class)
| Edit | Tool | songs.defaults updated? | library_index updated? | get_setlist reflects? | website reflects? | verdict |
|---|---|---|---|---|---|---|

## §F — Out-of-axis-B parking lot (defer to 13a/13c/13d)
A3 live-broadcast frictions → 13a. WebKit/iPad render → 13c. Picker UX / bond-hygiene
sweeps → 13d. Note, do NOT promote.

## §G — Cleanup state
## §H — Optional findings.jsonl mirror
[{id, beat, bug_class, author_identity, agent_context, anchor_arrow, severity, tool, surface_element, fix_hint}]
```

### HANDOFF-COMPLETE message body (`.coord/inbox/supervisor.md`)
```
from cycle-13b-mcp-authoring
HANDOFF-COMPLETE
authoring-surface verdict: <SURFACE-IS-SOUND | SURFACE-NEEDS-FIXES <list> | SURFACE-IS-A-TRAP>
anchor-propagation: A1 ✓ A2 ✓ A3 DEFER-13a A4 ✓
bug-classes: write-durability ✓ cold-agent ✓ role-divergence ✓
tool count observed: <n> (memory says 24 — DRIFT, amend [[project_mcp_status]])
load-bearing P0/P1 findings (≤5 IDs + one-line):
  F-C13B-NNN  P0 <beat> — <one-line>
verify-every-ref drift observed at run: <list or "none beyond the 3 in §0.5">
cleanup: clean | partial — list orphans
report: .paul/research/cycle-13b-mcp-authoring/REPORT.md
```

---

## §7 — Anti-patterns explicitly broken (charter §3)
- **AP-1 (class-violation).** Every card ties to an authoring beat + a downstream musician
  anchor moment via the propagation arrow. A card that reduces to "this description is
  ambiguous" with no mis-call and no downstream impact is rejected to §F.
- **AP-3 (JSONL primary).** REPORT.md is source-of-truth; `findings.jsonl` is an optional §H mirror.
- **AP-4 (findings-as-only-output).** §A verdict + §B surface-design principles + §D cold-agent
  gotcha table + §E dual-write matrix carry the design-level insight.
- **AP-5 (audit stance) — broken in a NEW direction.** First-person voice is the *authoring
  agent's* reasoning, not a code-reviewer's. The agent's confusion IS the data.
- **AP-7 (single-state).** 2 author identities (Daniel admin / David band_leader) × warm-vs-cold
  agent context.

Does NOT break **AP-2** (deliberately narrow: one week's round-trip, not an app-wide roam)
and only partially breaks **AP-3** (markdown primary + optional jsonl).

---

## §8 — Operational rules + hard out-of-scope
**Binding:**
- ⛔ No writes to the real source setlist — every write hits the `[CYCLE13B-…]` fixture clone.
- ⛔ No bearer/secret in any file under `sheet-music-app/` — redact `***redacted***`.
- ⛔ NEVER `cleanup_all_test_data` without `prefix`.
- ⛔ No live X32/monitor writes (`/monitor` not in this axis).
- ⛔ `[[feedback_err_public_not_gated]]`: never propose GATING data from musicians. If a finding
  recommends a filter (e.g. "list_setlists should hide test fixtures"), frame it as
  *authoring-noise reduction with an explicit include-flag*, never as a privacy gate.
- ⛔ `[[feedback_no_saturday_framing]]`: no Saturday/downbeat/service-gate framing. The upcoming
  service is just the realistic clone source, not a deadline.

**Hard out-of-scope (do NOT probe):**
- Repo-root `mcp/`, `bridge/`, `SetlistGrid.tsx`, `src/lib/mcp/errors.ts`,
  `src/lib/mcp/error-envelopes.ts` (do-not-touch zones).
- A3 live leader→band broadcast (axis 13a owns it).
- WebKit/iPad Perform-mode render (axis 13c owns it).
- Chart-bind picker UX + bond-hygiene sweeps (axis 13d owns it).
- F-002 lyric-search (feature dropped at `3155fb2881`).

---

## §9 — Success criterion (auditor checks before ACCEPT)
The cowork RUN "ran successfully" iff:
- Every step A-H ran (I/J optional/mandatory-cleanup) with a verdict per step.
- All 3 authoring bug-classes surfaced as named beats (zero-finding on a class is acceptable
  *data* — but the probe must have run).
- §D cold-agent gotcha table has a ✓/✗ per row.
- §A verdict is decisive (SURFACE-IS-SOUND / SURFACE-NEEDS-FIXES / SURFACE-IS-A-TRAP) with
  one sentence per P0.
- §B has ≥3 surface-design principles.
- Cleanup §5 verified empty (or §G lists orphans).
- HANDOFF-COMPLETE landed in supervisor inbox; tool-count drift flagged.

**Auditor verification** (Tier-0 doc for THIS prompt-design lane; Tier-1 for the eventual
cowork RUN): per-finding reproducibility on a fresh agent fire. Sample 2-3 P0/P1 findings —
re-issue the exact MCP call and confirm the misleading surface element is real
(`[[feedback_auditor_deployed_surface_verification]]`).

---

## §10 — Sign-off
The cowork instance signs the supervisor inbox HANDOFF-COMPLETE `from cycle-13b-mcp-authoring`.
The auditor reads the REPORT against (a) verify-every-ref pass (b) all 3 bug-classes probed
(c) §A verdict + §B principles present (d) cleanup verified.

Go.

— from coder-2 (lane `cycle-13b-mcp-authoring-PROMPT-design`)
