# Cycle-13d — DESIGN-NOTES (methodology rationale)

Lane `cycle-13d-bond-hygiene-and-picker-PROMPT-design` · author coder-5 · base `952edac4c3`.

---

## 1. Why this axis exists, and why it's shaped the way it is

Every prior cycle treated the track→chart bond as a *given*. Cycle-11 (narrative/matrix/heuristic)
and cycle-12 (offline+stickiness in Perform mode) both asked "does the chart the band needs survive
the network / the reload." Neither asked the prior question: **is the bound chart the right chart,
and how did it get bound?**

That question has two halves that are usually treated as separate teams' problems but are actually one
seam:

- **The data layer** — `library_index/{fileId}`, `songs/{id}.defaults`, the `review_chart_bonds`
  title↔filename detector, the clone-time `bondReviewRows` advisory, `swap_chart` as the fix-path.
- **The UI layer** — the in-app chart-bind picker (`ChartBindPopover` / `ChartBindDialog`) an editor
  uses to *create* the bond in the first place.

A wrong bond is **born in the picker** and **felt in Perform**. The detector sits in between and —
critically — its output never reaches either end as a human-visible signal. So the methodology had to
be a **single arc**, not a data-audit OR a UI-review: clone a real heavily-bonded setlist → read what
the detector flags → trace one flagged bond back to how the picker would have created it → trace it
forward to what a musician sees at A2. The arc is the unit of analysis.

## 2. Why "surface-depth," not a new methodology

The charter (§"Anti-patterns") is explicit: cycle-11 already burned the three methodology axes
(narrative / matrix / heuristic), and cycle-12 burned the hybrid-one-PROMPT collapse. The four cycle-13
axes are **surface** axes — they re-use the proven hybrid finding-shape and compete on *surface depth*,
not on a novel report structure. So this PROMPT deliberately inherits cycle-12's `{shape: narrative |
matrix | heuristic}` card vocabulary verbatim and spends its novelty budget on the **bond-bug-class
taxonomy (BC-1..4)** and the **picker-heuristic matrix (PUX-1..5)** — two axis-specific lenses that
didn't exist before, layered onto the shared shapes so triage can still merge across axes.

## 3. The two new lenses, and why each earns its place

- **BC-1..4 (bond-bug-classes)** decompose "wrong bond" into four *mechanically distinct* failures
  that a single "bad bond" label would blur: a true-positive wrong-song (the detector catches), a
  false-negative wrong-version (the detector's conservatism hides), an orphan fileId (the detector is
  structurally blind to), and an inert signal (the detector catches but nobody sees). Each maps to a
  different fix — so collapsing them would mis-route the fix wave.
- **PUX-1..5 (picker heuristics)** are grounded in the `/ui-ux-pro-max` UX corpus: H6
  recognition-over-recall, H1 visibility-of-system-state, H5 error-prevention ("Confirm before
  irreversible action," graded High in the corpus), H8 help-recognize-recover, and an H4 consistency
  cell for the two-entry divergence. These aren't generic a11y nits (which AP-1 rejects) — each is tied
  to a concrete line of deployed code and a specific bond-correctness consequence.

## 4. Persona model — the load-bearing auth correction

The obvious persona pick was "a musician uses the picker." **That's wrong, and verifying it against
deployed code was the single most valuable pre-write check.** `src/app/(main)/setlists/[id]/page.tsx:77-86`
gates the editor route on `canEditSetlist` and `redirect()`s a non-owner musician to `/perform/setlist/<id>`.
So:

- **David (band_leader)** is THE picker persona — `canEditSetlist` is true for any setlist.
- **Daniel (admin)** authors via MCP (`[[user_mcp_is_primary_author_workflow]]`), so he drives the
  bond-hygiene *tooling* side (review_chart_bonds / swap_chart / clone bondReviewRows), not the picker.
- **Aviva (musician)** becomes a *redirect probe* — her bounce away from the picker is itself a finding-shaped
  observation, and she can only reach the picker on a setlist she owns.

This also pre-empts a triage misfile: the editor WRITE-gate is **not** an `[[feedback_err_public_not_gated]]`
violation. That invariant protects *viewing*; gating *editing* is correct. The PROMPT calls this out
explicitly (§3.D step 1) so a future fix-wave doesn't "relax" a gate that should stay.

## 5. The Dexie reality (why mintSession matters more here than in cycle-12)

The picker does NOT read Firestore — it reads the local Dexie `songs` table via `useLiveQuery`
(`ChartBindPopover.tsx:74-81`, `ChartBindDialog.tsx:73-77`), hydrated by `SetlistGridHydrator`'s
`subscribeSongsLibrary` listener. A persona context without Web-SDK auth (META-003: the bare
`/api/auth/test-session` cookie) gets an **empty picker** and every picker probe silently lies. So
`mintSession({firebaseAuth})` (per `cycle-4/harness/lib/probe.mjs`) is a HARD requirement, not a
convenience — the PROMPT flags this in §0.3 as a setup gate AND surfaces it as the BC-3-adjacent
fresh-tablet finding axis (a song uploaded via MCP after the tablet last synced may not yet be in the
picker's Dexie).

---

## 6. ONE worked-example finding, traced end-to-end

To prove the arc-as-unit-of-analysis, here is a single finding the cowork instance should be able to
reproduce, walked from deployed code → picker origin → service manifestation → fix-path → why it's inert.

### F-C13D-EXAMPLE — "I bound the right song and the band got the wrong sheet" (shape: narrative, BC-1+BC-4, anchor A1→A2)

**The code fact (verified `952edac4c3`):** The picker's CommandItem renders `{song.title}` and nothing
else (`ChartBindPopover.tsx:175-177`). On select, `handlePick` → `onBind({songId, title})`
(`:113-116`) → `SetlistGrid.handleBindChart` writes `{songId: sel.songId, fileId: sel.songId, title:
sel.title}` (`SetlistGrid.tsx:1133-1141`). Note `fileId === songId` — the v54-01-01 locked identity that
assumes `songs/{id}.id === library_index/{id}.id`.

**The origin (A1, David, band_leader):** David is prepping next week's setlist. Track 9 is "Adon Olam."
He taps the ChartCell, the popover opens, he sees a Library row literally reading **"Adon Olam"**, taps
it. One tap, bond committed, popover closes. He has **no way to see** that the `library_index/{songId}.name`
behind that song is `Adon_Olam_OLD_2019_wrong_key.pdf` — the picker never showed him the filename
(PUX-1, H6). There was no preview and no confirm (PUX-3, H5). The cell now shows the bound-indigo
FileText icon — `hasChart:true` — which looks identical to a *correct* bond (PUX-2, H1).

**The detector DID notice (BC-1):** When David later clones this setlist, `auditBondedRows`
(`chart-bond-audit.ts:129`) compares "Adon Olam" against "Adon_Olam_OLD_2019_wrong_key" →
`compareTitleToFilename` (`:78`) → after the compact-substring rescue (`:86-93`), "adonolam" IS a
substring of "adonolamold2019wrongkey" → **overlap 1, mismatch:false**. *The conservative threshold that
protects Hebrew transliteration variants ALSO clears this wrong-version bond.* So even the detector that
exists is blind to this particular BC-1 sub-case (this is the BC-1 false-negative the §D matrix forces).

**The manifestation (A2, Aviva, musician):** Saturday-agnostic — some week, mid-service, Aviva is on
track 8, advances to track 9. The chart paints. Title bar says "Adon Olam" ✓. The chart is the 2019
arrangement in the wrong key. She's reading it cold in front of the room. **Friction cost: she either
transposes on the fly or stumbles — a confidence dent that traces all the way back to a one-tap bind
David made days earlier with zero signal.**

**The fix-path EXISTS but is inert (BC-4):** `swap_chart({setlistId, trackId, newSongId})`
(`setlist-write.ts:556`) cleanly re-bonds + re-syncs title/key/bpm. And `clone_setlist` already RETURNS
`bondReviewRows` (`de2e089dc6`, clone-setlist.ts:363-410). But **nothing surfaces either to David in the
picker/grid or to Aviva in Perform** — no badge, no "this row's file doesn't match its title" nudge. The
signal that could have prevented the whole arc sits in an MCP response object nobody renders.

**Affordance fix (1-3 sentences):** Surface the bound chart's filename inline in each picker CommandItem
(turns PUX-1 from violation to pass, and makes the wrong-version case *visible* even when the detector's
overlap-rescue clears it). Render a per-row "bond looks suspect" affordance in SetlistGrid driven by
`review_chart_bonds` (closes BC-4). Err toward *showing the filename to everyone* per
`[[feedback_err_public_not_gated]]` — never gate it.

**Why this is ONE finding, not four:** BC-1-false-negative, PUX-1, PUX-3, and BC-4 are all *facets of the
same arc*. The hybrid shape lets the cowork instance file it as one narrative card with a primary
class (BC-1) and cross-references, rather than four disconnected nits — exactly the AP-1 discipline.

---

## 7. What this axis MISSES (honest deferral)

- **The MCP authoring round-trip depth → 13b.** 13d touches `clone_setlist` / `swap_chart` / `review_chart_bonds`
  only as bond-correctness instruments. The *weekly authoring flow* (clone last week → tweak → publish →
  templates → dedup as a coherent Daniel-via-Claude session) is 13b's surface. Overlap is real; triage merges.
- **Live mid-service bond changes → 13a.** A3 (leader pushes a swap to band iPads live) is 13a's anchor.
  13d uses `swap_chart` as a fix-path tool, never as a broadcast moment. A3-live frictions go to §F.
- **WebKit-engine chart RENDERING → 13c.** Whether the *bound* file renders correctly (MusicXML/OSMD,
  octet-stream mime routing, transpose) on real WebKit is 13c. 13d stops at "the right *file* is bound";
  whether that file *renders* is downstream.
- **The bond AUDIT ALGORITHM's tuning is probed, not re-derived.** This PROMPT documents the 0.34 threshold
  + overlap-rescue blind spot as a *finding*; it does NOT attempt to re-tune the threshold (that's a fix-wave
  decision, and per `[[feedback_dedup_force_override]]`-style discipline, threshold tuning needs its own ratify).
- **Byte-health (`verify_setlist_charts` / the cron) is context only.** Cycle-7/11 already own chart
  byte-reachability. 13d explicitly does NOT rebuild that coverage (§2.4) — it only notes that the
  byte-health cron and the title-mismatch detector are *different* detectors and only the former has any
  automated human-facing path (Sentry), which is the BC-4 finding.
- **Structural AP-2 vulnerability (acknowledged):** narrow by design — one picker, one bond layer, one
  fixture clone. A broad sweep of every chart-bind entry point across the app is a future cycle's problem.

---

## 8. Verify-every-ref pass (binding gate — all checked against `952edac4c3`)

| Ref | File:line | Status |
|---|---|---|
| `auditBondedRows` | `src/lib/mcp/tools/chart-bond-audit.ts:129` | ✓ |
| `reviewChartBonds` | `chart-bond-audit.ts:303` | ✓ |
| `compareTitleToFilename` | `chart-bond-audit.ts:78` | ✓ |
| `MISMATCH_OVERLAP_THRESHOLD = 0.34` | `chart-bond-audit.ts:42` | ✓ |
| compact-substring rescue | `chart-bond-audit.ts:86-93` | ✓ |
| orphan → `chartFileName:null, mismatch:false` | `chart-bond-audit.ts:150-162` | ✓ |
| reads `library_index/{fileId}.name` | `chart-bond-audit.ts:138-147` | ✓ |
| `BondReviewRow` / `toBondReviewRows` | `chart-bond-audit.ts:175,196` | ✓ |
| clone `bondReviewCount`/`bondReviewRows` | `clone-setlist.ts:363-410` | ✓ |
| clone reads `src.data.fileId` | `clone-setlist.ts:370` | ✓ |
| `clone_setlist_from_template` parity | `templates.ts:730,738,883-921` | ✓ |
| `swapChart` reads `getSongById` | `setlist-write.ts:556,594` | ✓ |
| `getSongById` dual-read heal (songs→library_index) | `server-songs.ts:148-177` | ✓ |
| `getAllSongs` skips the join | `server-songs.ts:163-165` | ✓ |
| cron BYTE-health, schedule `0 15 * * 4` | `verify-chart-bond-health/route.ts` + `vercel.json:28-29` | ✓ |
| cron dropped publishedAt + in-process isTest | `verify-chart-bond-health/route.ts:96-119` | ✓ |
| cron → Sentry (no human reader) | `verify-chart-bond-health/route.ts:208-231` | ✓ |
| MCP registrations clone/clone-from-template/update_track/swap_chart/review_chart_bonds | `tools/index.ts:580,769,1047,1070,1449` | ✓ |
| `ChartBindPopover` title-only + `status!=='archived'` filter | `ChartBindPopover.tsx:74-81,175-177` | ✓ |
| `ChartBindPopover` one-tap onBind | `ChartBindPopover.tsx:113-116` | ✓ |
| `ChartBindDialog` NO archived filter | `ChartBindDialog.tsx:73-77` | ✓ |
| `ChartCell` `hasChart = Boolean(songId)`, coarse-pointer bump | `cells/ChartCell.tsx:11,34-35,42` | ✓ |
| `handleBindChart` writes `fileId: sel.songId` | `SetlistGrid.tsx:1124-1141` | ✓ |
| `handlePickSong` writes `fileId: song.id` | `SetlistGrid.tsx:1521-1545` | ✓ |
| two picker entry points (popover + dialog) | `SetlistGrid.tsx:419-429,1778-1789` | ✓ |
| `seedTrackFromSong` reads Dexie `songs.defaults` | `src/lib/songs/defaults.ts:36-51` | ✓ |
| editor route + `canEditSetlist` gate + musician redirect | `src/app/(main)/setlists/[id]/page.tsx:77-86` | ✓ |
| `admin-test-session` header `x-admin-test-secret` | `src/app/api/auth/admin-test-session/route.ts` | ✓ |

**29 refs verified. 0 unverified citations in the PROMPT.**
