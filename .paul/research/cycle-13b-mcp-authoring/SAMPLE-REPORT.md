# Cycle-13b MCP authoring round-trip — REPORT  *(FICTIONAL SAMPLE — illustrates the finished shape)*

> This is a **fictional** filled-in run so Daniel + the supervisor can see what a finished
> axis-B sweep reads like. Findings are plausible-but-invented; SHAs/ids are real where they
> anchor a verified surface element, fabricated where they'd be run-time artifacts.

**Run date:** 2026-05-30T14:05Z
**Wall-clock:** ~72 min single-thread
**Master SHA at run:** `952edac4c3` (no drift beyond the 3 in PROMPT §0.5)
**Tool count observed:** 109 via `tools/list` (memory `[[project_mcp_status]]` says "24 live" — **DRIFT, amend**)
**Author personas:** Daniel (admin, via root supervisor bearer — `MCP_ADMIN_TEST_SESSION_SECRET` unset, noted) + David (band_leader, `c13b-authoring` uidPrefix)
**Source setlist (read-only reference):** `8a73c801-…` Kabbalat Shabbat (15 tracks)
**Fixture clone (write target):** `f3b9c0d1-…` — `[CYCLE13B-authoring]`; isTest:true verified at create-time
**Anchor propagation coverage:** A1 ✓  A2 ✓  A3 DEFER-TO-13a  A4 ✓
**Bug-class coverage:** write-durability ✓  cold-agent ✓  role-divergence ✓
**Cleanup state:** clean
**Authoring-surface verdict:** SURFACE-NEEDS-FIXES (F-C13B-001, F-C13B-003, F-C13B-004)

---

## §A — Authoring-surface verdict

A fresh Claude Desktop agent can author next week's setlist *mostly* correctly on the first
pass — the clone→tweak→propose→commit→publish spine is well-instrumented, with `committed`
booleans, rich `force_required` envelopes, and confidence/flags on staged proposals that a
cold agent reads and acts on. **But three surface gaps let a cold agent ship already-wrong
data silently.** The single biggest one (F-C13B-001): the `eventDate` descriptions actively
steer toward the `Z`-suffixed ISO form that lands every service at 5am — the fix exists in
`parse-event-date.ts` but is undiscoverable from any description the agent reads. Second
(F-C13B-003): a key edit via `update_song` lands in `library_index` but the agent has no
signal whether `songs.defaults` updated too, so `get_setlist` and the website can silently
disagree. Third (F-C13B-004): `list_setlists` interleaves `isTest` fixtures with real
services and gives the agent no documented way to tell them apart, so a cold agent planning
"next service" can clone a leftover test fixture. None are service-*blocking*, but all three
are SILENT — the surface's chance to warn the agent is the whole game, and it's currently
missed at these three forks.

## §B — WHAT-WE-LEARNED (surface-design principles)

1. **Every gotcha a warm agent "just knows" is a latent cold-agent trap.** The surface
   should encode the convention *in the description the agent reads*, not rely on the agent
   having learned it from a prior run or from source it never sees. The eventDate Z-trap is
   the archetype: the fix is correct, but the knowledge of *how to call it right* lives only
   in `parse-event-date.ts`. A description is the only documentation an LLM author has.

2. **A silent success is worse than a loud refusal.** The surface is excellent at loud
   refusals (`force_required` REG-003 rich envelopes, `chart_unbindable`, `stale_version`) —
   a cold agent recovers from those cleanly. It is weak where a *wrong* call *succeeds
   quietly* (the Z date, the half-applied dual-write). The design principle: prefer a
   warning field in a successful envelope over silence whenever the call could be a mistake.

3. **When two counters mean "something's off," the agent needs to know which to trust.**
   `clone_setlist.bondReviewCount`, `review_chart_bonds.mismatchCount`, and
   `preview_publish.flaggedBonds` are three different "this bond looks wrong" signals from
   three tools. A cold agent reaching the publish gate doesn't know whether
   `recommendation:'publish'` overrides a non-zero `bondReviewCount` it saw at clone-time.
   Cross-reference the counters in the descriptions, or collapse them.

4. **`force`/`dryRun` is a learnable, well-taught convention — replicate it.** The
   dryRun-is-observability + force-for-real-writes pattern is documented consistently across
   the hygiene tools and a cold agent picked it up immediately. That consistency is the model
   for fixing the gaps above: make the eventDate + dual-write conventions equally legible.

## §C — Findings

### F-C13B-001 — Cold agent sets the service to 5am by writing "the ISO format" (trailing Z)
- **Authoring beat:** eventDate
- **Bug-class:** cold-agent (× write-durability)
- **Author identity:** both · **Agent context:** cold
- **Tool:** `update_setlist({id, eventDate})` (index.ts:835); `eventDateSchema` (index.ts:138)
- **The agent's experience:**
  > "I needed 10am Saturday. The description said 'New ISO event date.' I wrote
  > `'2026-05-30T10:00:00.000Z'` — the most canonical ISO I know. It was accepted and echoed
  > back unchanged. I told Daniel it's set for 10am."
- **Misleading surface:** the `eventDate` description ("New ISO event date") steers toward the
  Z form; `eventDateSchema` accepts it silently. The naive-datetime=Chicago convention lives
  only in `parse-event-date.ts` source (agent never reads it).
- **→ A1:** service card + iCal + reminders show 5:00am for a 10:00am service.
- **Severity:** MEDIUM-HIGH (silent; fix exists but undiscoverable).
- **Affordance fix:** add to all three eventDate-accepting descriptions: "Pass a NAIVE local
  datetime ('2026-05-30T10:00', no Z) → interpreted as America/Chicago wall-clock; a trailing
  Z pins UTC and shifts the time (10:00Z = 5:00am Chicago)." Optionally have the schema warn
  (not reject, per `[[feedback_err_public_not_gated]]`) on a Z-with-time value.

### F-C13B-002 — Agent re-searches a Hebrew title 4× before finding the chart it just saw
- **Authoring beat:** tweak-track (bond) · **Bug-class:** cold-agent · **Identity:** both · **Context:** cold
- **Tool:** `search_library({query})` (index.ts:365)
- **The agent's experience:**
  > "Daniel said swap in 'Lechu Neranena.' `search_library({query:'Lechu Neranena'})` → 0
  > results. I assumed it wasn't in the library and almost told Daniel to upload it. On a
  > hunch I tried 'Lchu' → 1 hit (`Lchu_Neranena.pdf`)."
- **Misleading surface:** ACTUALLY well-handled — the description documents the C7I1-012
  non-fuzzy limitation and tells the agent to "retry with 2-3 common transliteration variants."
  A cold agent that *reads the full description* recovers. Finding logged as LOW: the warning is
  buried at the end of a very long description and the agent nearly missed it.
- **→ A1:** near-miss; would have produced a spurious "chart missing, please upload" to Daniel.
- **Severity:** LOW (documented; discoverability-of-the-warning only).
- **Affordance fix:** lift the "0 results → retry transliteration variants" hint to the FRONT
  of the description, or return a `hint` field on a 0-result response.

### F-C13B-003 — Key edit lands in library_index but the agent can't confirm songs.defaults updated
- **Authoring beat:** tweak-track · **Bug-class:** write-durability · **Identity:** both · **Context:** cold
- **Tool:** `update_song` / `edit_library_entry` (catalog-side); dual-read per `[[project_catalog_dual_read_surfaces]]` + `applySongMetadata` (song-metadata.ts:73)
- **The agent's experience:**
  > "Daniel wanted 'Adon Olam' defaulted to A♭ instead of G. I called the catalog edit; it
  > returned ok. Then `get_setlist` on a setlist using that song still showed G. I couldn't
  > tell from any response whether I'd written the wrong doc or whether bond-resolution reads
  > a third place."
- **Misleading surface:** the edit envelope doesn't report *which* of the two docs
  (`songs/{id}.defaults` vs `library_index/{id}`) it touched. A cold agent can't reason about
  dual-write parity from the response.
- **→ A1 → A2:** the leader's iPad (bond-resolution path) and the website (library_index path)
  show different keys; musician hits the wrong key in the A2 6-second window.
- **Severity:** HIGH (silent divergence on a load-bearing field).
- **Affordance fix:** have the catalog-edit envelope echo `{updated:['songs.defaults','library_index']}`
  explicitly (it should write both via `applySongMetadata`); a missing entry is a visible alarm.

### F-C13B-004 — `list_setlists` interleaves test fixtures with real services, no flag
- **Authoring beat:** discover · **Bug-class:** cold-agent · **Identity:** both · **Context:** cold
- **Tool:** `list_setlists({sort:'recent_event'})` (index.ts:301; impl setlists.ts:60-132)
- **The agent's experience:**
  > "I asked for the most recent service to clone. The top row was '[CYCLE12-saturday] probe' —
  > a leftover test fixture. Nothing in the row marked it as test; `isTest` isn't in the
  > summary. I nearly cloned the fixture as next week's starting point."
- **Misleading surface:** `list_setlists` does NO isTest filtering and the `SetlistSummary` it
  returns omits the `isTest` field entirely (verified setlists.ts:118-131) — the agent has
  neither a filter nor a flag.
- **→ A1:** authoring from a test fixture produces a junk setlist; or the agent wastes a turn
  disambiguating.
- **Severity:** MEDIUM. **Note (`[[feedback_err_public_not_gated]]`):** the fix is NOT to gate
  test rows out by default (that could hide a real row a musician needs) — it's to *surface*
  `isTest` in the summary + add an optional `includeTest:false` the agent can opt into.
- **Affordance fix:** add `isTest` to `SetlistSummary`; add an optional `includeTest?` arg
  (default true = current behavior) so an authoring agent can request real-only without any
  default-gating.

### F-C13B-005 — Agent commits a `confidence:'low'` proposal because the description doesn't say to act on it
- **Authoring beat:** propose→commit · **Bug-class:** cold-agent · **Identity:** Daniel · **Context:** cold
- **Tool:** `propose_setlist_changes` (index.ts:1244) → `commit_staged_changes` (index.ts:1328)
- **The agent's experience:**
  > "Two of my 10 staged proposals came back `confidence:'low', flags:['generic_title']`. The
  > description explained the flags are derived from titleSpecificity — but not whether 'low'
  > means *re-search before committing* or just *FYI*. I committed all 10. The two low ones
  > bonded to the wrong arrangement of Hashkivenu."
- **Misleading surface:** `propose_setlist_changes` reports confidence/flags richly but
  doesn't prescribe the agent's *action* on a low-confidence row before `commit_staged_changes`.
- **→ A2:** wrong-arrangement chart surfaces when the musician taps it mid-service.
- **Severity:** HIGH (silent mis-bond on a real authoring path — this is the `prime culprit`
  shape the `ae647fac20` work touched from the data side).
- **Affordance fix:** add to the `commit_staged_changes` description: "Before committing, walk
  any proposal with `confidence:'low'` or `flags` via `search_library` for a better songId, or
  `flag_bond` it for end-of-authoring review. Committing a low-confidence bond ships it to the
  band unreviewed."

### F-C13B-006 — David (band_leader) gets a clean `forbidden_role` on `dedupe_library` — POSITIVE
- **Authoring beat:** role-divergence · **Bug-class:** role-divergence · **Identity:** David · **Context:** cold
- **Tool:** `dedupe_library({dryRun:true})` (index.ts:1462)
- **The agent's experience (as David):**
  > "I tried `dedupe_library({dryRun:true})` to clean up before publishing. Got
  > `result.isError:true` with prose: 'admin-only.' Clear — I dropped it and moved on, told
  > David's account it's an admin task."
- **Surface:** CORRECT per `[[feedback_mcp_validation_shape]]` — refusal is `isError:true` +
  readable prose, not an opaque `-32602`. Logged as a POSITIVE finding (the role surface works).
- **→ no corruption.** **Severity:** none (confirmatory).

## §D — Cold-agent gotcha table

| Gotcha | Surface element that should teach it | Does it? | finding |
|---|---|---|---|
| eventDate naive-not-Z | update_setlist / clone / clone_from_template `eventDate`/`newEventDate` desc | ✗ steers toward Z | F-C13B-001 |
| Hebrew search not fuzzy → retry variants | search_library description | ◐ documented but buried | F-C13B-002 |
| catalog edit must hit BOTH docs | update_song/edit_library_entry envelope | ✗ no parity signal | F-C13B-003 |
| list_setlists includes test fixtures | SetlistSummary / list_setlists desc | ✗ no flag, no filter | F-C13B-004 |
| act on low-confidence proposal before commit | commit_staged_changes description | ✗ silent | F-C13B-005 |
| `newSongId` (not `songId`) on swap_chart | swap_chart description | ✓ explicit | — |
| dedupe real-run needs `force:true` | dedupe_library description | ✓ explicit + REG-003 | — |
| `committed:boolean` is the success signal on bulk_* | bulk_add/update descriptions | ✓ explicit ("load-bearing") | — |
| record_bond_correction ≠ row mutation | record_bond_correction description | ✓ explicit ("LEARNING signal, not the row mutation") | — |
| admin-only tools refuse band_leader clearly | isError + prose convention | ✓ | F-C13B-006 (positive) |

## §E — Dual-write / durability matrix

| Edit | Tool | songs.defaults? | library_index? | get_setlist reflects? | website reflects? | verdict |
|---|---|---|---|---|---|---|
| song key G→A♭ | update_song | ? (unconfirmable from envelope) | ✓ | ✗ (still G) | ✓ (A♭) | **DIVERGED** (F-C13B-003) |
| clone 15-track setlist | clone_setlist | n/a | n/a | songCount 12/trackCount 15 ✓ | n/a | ✓ (denorm correct post-ae647fac20) |
| commit 3-add/2-remove batch | commit_staged_changes | n/a | n/a | songCount + trackCount ✓ | n/a | ✓ |
| eventDate naive '…T10:00' | update_setlist | n/a | n/a | 10:00am CDT ✓ | 10:00am ✓ | ✓ (naive form correct) |
| eventDate '…T10:00Z' | update_setlist | n/a | n/a | 5:00am ✗ | 5:00am ✗ | **WRONG-BY-DESIGN** (F-C13B-001) |

## §F — Out-of-axis-B parking lot
- A musician on a *live-on-stands* setlist seeing an edit mid-service → **axis 13a** (A3 broadcast).
- The wrong-arrangement Hashkivenu chart's actual WebKit render on the iPad → **axis 13c**.
- The in-app chart-bind *picker* a band member would use to fix F-C13B-005's mis-bond → **axis 13d**.

## §G — Cleanup state
Clean. `delete_setlist(f3b9c0d1, force:true)` ✓; `cleanup_all_test_data({prefix:'c13b-authoring'})`
✓; `list_test_accounts` → 0 c13b rows; `list_setlists` → 0 `[CYCLE13B-…]`; `search_library({query:'c13b'})` → empty.

## §H — findings.jsonl (mirror)
```jsonl
{"id":"F-C13B-001","beat":"eventDate","bug_class":"cold-agent","author_identity":"both","agent_context":"cold","anchor_arrow":"A1","severity":"medium-high","tool":"update_setlist","surface_element":"eventDate description + eventDateSchema","fix_hint":"teach naive-not-Z in description"}
{"id":"F-C13B-002","beat":"tweak-track","bug_class":"cold-agent","author_identity":"both","agent_context":"cold","anchor_arrow":"A1","severity":"low","tool":"search_library","surface_element":"description (buried)","fix_hint":"lift transliteration-retry hint to front / return hint on 0 results"}
{"id":"F-C13B-003","beat":"tweak-track","bug_class":"write-durability","author_identity":"both","agent_context":"cold","anchor_arrow":"A1->A2","severity":"high","tool":"update_song","surface_element":"edit envelope omits dual-write parity","fix_hint":"echo updated:[songs.defaults,library_index]"}
{"id":"F-C13B-004","beat":"discover","bug_class":"cold-agent","author_identity":"both","agent_context":"cold","anchor_arrow":"A1","severity":"medium","tool":"list_setlists","surface_element":"SetlistSummary omits isTest; no filter","fix_hint":"add isTest to summary + optional includeTest (no default gating)"}
{"id":"F-C13B-005","beat":"propose-commit","bug_class":"cold-agent","author_identity":"daniel","agent_context":"cold","anchor_arrow":"A2","severity":"high","tool":"commit_staged_changes","surface_element":"description silent on low-confidence action","fix_hint":"prescribe walk/flag low-confidence before commit"}
{"id":"F-C13B-006","beat":"role-divergence","bug_class":"role-divergence","author_identity":"david","agent_context":"cold","anchor_arrow":"none","severity":"none","tool":"dedupe_library","surface_element":"isError+prose refusal","fix_hint":"none (positive)"}
```
