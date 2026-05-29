# Cycle-13d Bond hygiene + chart-bind picker — REPORT  *(SAMPLE — fictional run; illustrates the shape the cowork instance should emit)*

> ⚠️ **THIS IS A SAMPLE.** Findings, IDs, overlap scores, and the verdict are fabricated to
> demonstrate the report shape, card schema, and decisiveness bar. The real run replaces every
> value. Do not cite F-C13D numbers from this file as real findings.

**Run date:** 2026-05-30T14:10Z
**Wall-clock:** ~74 min single-thread ([[feedback_cowork_real_harness]])
**Master SHA at run:** `952edac4c3` (no drift from PROMPT base)
**Identities:** David (band_leader, picker) + Aviva (musician, redirect/own-setlist) + Daniel (admin via admin-test-session)
**Source setlist (read-only ref):** `7b1e…shabbat-morning` (31 tracks · 22 bonded song rows)
**Fixture clone (write target):** `c13d-aa01…` — `[CYCLE13D]` named; `isTest:true` verified at create-time
**Anchor coverage:** A1 ✓  A2 ✓  A3 DEFER-TO-13a  A4 ✓
**Bond-bug-class coverage:** BC-1 ✓ (TP + FN)  BC-2 ✓  BC-3 ✓  BC-4 ✓
**Picker heuristics:** PUX-1..5 graded
**Cleanup state:** clean (3 fixtures + 2 accounts swept; verified empty)
**Bond-hygiene verdict:** **NEEDS-AFFORDANCE-WORK** — F-C13D-001 (picker hides filename), F-C13D-002 (inert mismatch signal), F-C13D-004 (dual-entry archived divergence)

---

## §A — Verdict (≤200 words)

I would NOT yet trust an in-app editor to bind charts to next week's service without occasionally
attaching a wrong sheet *and never knowing it*. The bond DATA layer is sound: `review_chart_bonds`
and the clone `bondReviewRows` advisory both correctly flagged the 3 genuine wrong-song bonds we
seeded (BC-1 true-positives). The failure is the **affordance gap on both ends of the arc** — the
picker shows song titles with no filename (F-C13D-001), so David binds blind; and when the detector
*does* flag a mismatch, that signal dies in an MCP response object that no UI renders (F-C13D-002),
so neither David nor Aviva ever sees it. The detector also has a real blind spot: its 0.34
overlap-threshold + substring-rescue clears a wrong-*version* bond of the same song (F-C13D-003, BC-1
false-negative) and is structurally blind to orphan fileIds (F-C13D-005, BC-2). The single biggest
thing to fix: **render the bound filename inline in every picker row and a per-row suspect-bond nudge
in the grid.** No SHA drift. The editor WRITE-gate (musician→redirect) is correct and must NOT be
relaxed (it is not an err-public violation).

---

## §B — WHAT-WE-LEARNED (design principles)

- **"The picker binds by song-identity, but the user reasons about chart-files — that gap is the root
  of every wrong-bond class."** `onBind({songId})` with `fileId := songId` collapses two distinct
  concepts (which song / which sheet) into one identity. The user picks a title and *assumes* the
  right file; the picker never confronts them with the file. Every BC-1/BC-2 finding traces here.
- **"A detector with no rendered output is a log line, not a safeguard."** `bondReviewRows` and
  `review_chart_bonds.rows[].mismatch` are computed correctly and discarded silently. Correctness in
  the data layer buys nothing until an affordance carries it to the human who can act.
- **"Conservatism tuned against false-positives buys false-negatives — and the false-negatives are the
  dangerous ones here."** The overlap-rescue that protects "Hineh_Ma_Tov_Lev.pdf" also clears
  "Adon_Olam_OLD_wrong_key.pdf". A same-song-wrong-version bond is invisible precisely because the
  filenames *look* related. Visibility (showing the filename) beats smarter scoring.
- **"Two affordances for one action must read one source of truth."** The popover-vs-dialog archived
  divergence is a small bug with a large lesson: the in-cell and context-menu entries drifted because
  each owns its own Dexie query. One shared candidate-list hook would have prevented it.

---

## §C — Findings (ordered by severity)

### F-C13D-001 — David binds "Adon Olam" and can't see he's getting the 2019 wrong-key sheet (shape: narrative)
- **Shape:** narrative · **Anchor:** A1 (origin) → A2 (manifestation) · **Bond-bug-class:** BC-1 + PUX-1
- **Persona:** David (band_leader) binds; Aviva (musician) feels it
- **Timeline beat:**
  > [A1, prep] David opens `/setlists/c13d-aa01` on iPad. Track 9 "Adon Olam" is unbound. He taps the
  > ChartCell → popover → sees one Library row reading **"Adon Olam"**, taps it. Bond committed in one
  > tap; popover closes; cell goes indigo. He has no idea the file behind it is
  > `Adon_Olam_OLD_2019_wrong_key.pdf`. [A2, some service] Aviva advances to track 9. Title bar: "Adon
  > Olam" ✓. Sheet: 2019 arrangement, wrong key. She reads it cold. **Cost: a transpose-scramble +
  > confidence dent, born from a one-tap blind bind days earlier.**
- **Surface (mechanism footnote):** `ChartBindPopover.tsx:175-177` (title-only item) → `:113-116`
  (one-tap onBind) → `SetlistGrid.tsx:1133-1141` (`fileId := songId`). No filename shown; no preview; no confirm.
- **Severity:** HIGH (editor-felt: binds blind; musician-felt: service friction)
- **Affordance fix:** Render the bound chart filename (`library_index/{songId}.name`) as a muted
  second line in each picker CommandItem, so the editor recognizes the actual artifact (H6). Optionally
  a hover/long-press file preview. Err public — show the filename to every editor; never gate it.

### F-C13D-002 — The mismatch detector flags 3 bonds; nobody ever sees the flag (shape: heuristic)
- **Shape:** heuristic · **Heuristic:** H8 (help recognize + recover) · **Stress:** S-partial-attention
- **Anchor:** A1/A4 · **Bond-bug-class:** BC-4 · **Persona:** David / Aviva (neither sees it)
- **The experience (first person):**
  > "I cloned last week's setlist. The MCP response said `bondReviewCount: 3`. But I'm working in the
  > app, not reading raw MCP JSON — in the grid, those 3 rows look exactly like the 19 healthy ones."
- **The violation:** H8 requires the app to *tell* the user what's wrong and offer recovery. The
  detector's output (`clone.bondReviewRows`, `review_chart_bonds.rows[].mismatch`) is computed and
  discarded — no grid badge, no picker warning, no nudge.
- **Surface:** `clone-setlist.ts:363-410` + `templates.ts:883-921` (returned, unused by any UI);
  `SetlistGrid.tsx` ChartCell renders only `hasChart` binary (`ChartCell.tsx:11,42`).
- **Severity:** HIGH · **Affordance fix:** A per-row "⚠ chart may not match title" affordance in
  SetlistGrid driven by `review_chart_bonds`, with a one-tap `swap_chart` re-bind. Surfaces the signal
  that already exists. Show it to everyone (err public); it's advisory, never a gate.

### F-C13D-003 — Wrong-version bond of the same song clears the detector (shape: matrix, BC-1 false-negative)
- **Shape:** matrix · **Cell-ID:** `BC1.FN.detector` · **Anchor:** A1 · **Persona:** Daniel (MCP)
- **Action:** bind track "Hallelujah" to a song whose file is `Hallelujah_WRONG_KEY_F.pdf`; run `review_chart_bonds`
- **Expected (user terms):** "The detector should flag that this Hallelujah is the wrong arrangement."
- **Observed (user terms):** "Detector returns `mismatch: false, overlapScore: 1`."
- **Repro (≤6):** (1) clone fixture; (2) `update_track` track-N fileId → a library_index row named
  `Hallelujah_WRONG_KEY_F`; (3) `review_chart_bonds({setlistId: fixtureId})`; (4) read row-N → `mismatch:false`.
- **3 trials:** 3/3 `mismatch:false` (deterministic — the substring rescue at `chart-bond-audit.ts:86-93`
  clears any filename containing the title).
- **Severity:** MEDIUM (correctly-tuned for transliteration safety; the cost is wrong-version blindness)
- **Affordance fix:** Don't re-tune the 0.34 threshold (it protects real Hebrew variants — needs its own
  ratify). Instead make F-C13D-001's filename-visibility the mitigation: a human seeing
  "Hallelujah → Hallelujah_WRONG_KEY_F.pdf" catches what the scorer can't.

### F-C13D-004 — Context-menu "Bind chart" offers archived songs the in-cell picker hides (shape: matrix)
- **Shape:** matrix · **Cell-ID:** `PUX5.popover-vs-dialog` · **Anchor:** A1 · **Persona:** David
- **Expected:** "Both ways of binding a chart show me the same songs."
- **Observed:** "The in-cell popover hides archived songs; the context-menu dialog lists them — I can
  bind a retired chart via one path, not the other."
- **Repro:** (1) archive a song via MCP; (2) in-cell ChartCell → popover → archived song ABSENT
  (`ChartBindPopover.tsx:74-81` filters `status!=='archived'`); (3) context-menu "Bind chart" → dialog →
  archived song PRESENT (`ChartBindDialog.tsx:73-77`, no filter). 3/3 deterministic.
- **Severity:** MEDIUM · **Affordance fix:** Extract one shared `useBindableSongs()` hook applying the
  archived filter once; both entry points consume it. (Err-public note: this *hides archived from a
  WRITE picker* — fine; it does not gate any READ/view path.)

### F-C13D-005 — Orphan fileId is invisible to the mismatch detector (shape: heuristic, BC-2)
- **Shape:** heuristic · **Heuristic:** H1 (visibility) · **Stress:** S-stale-cache · **Anchor:** A4 · **Persona:** Daniel
- **The violation:** A track whose `fileId` points at a non-existent `library_index` doc comes back from
  `review_chart_bonds` as `chartFileName:null, mismatch:false` (`chart-bond-audit.ts:150-162`) — the
  title-mismatch detector treats a missing catalog row as out-of-scope (byte-health's job). So an orphan
  bond is invisible to BOTH the picker (binary `hasChart`) and the mismatch detector. Only the byte-health
  cron catches it, and that routes to Sentry, not a human UI (`verify-chart-bond-health/route.ts:208-231`).
- **Severity:** MEDIUM · **Affordance fix:** Let the grid suspect-bond affordance (F-C13D-002) also light
  up on `chartFileName:null` (orphan), not just on `mismatch:true`. One affordance, both classes.

### F-C13D-006 — Aviva is correctly redirected away from the editor (shape: matrix, NOT a bug — recorded for triage)
- **Shape:** matrix · **Cell-ID:** `auth.musician-redirect` · **Anchor:** A1 · **Persona:** Aviva (musician)
- **Observed:** Aviva → `/setlists/<shared-id-she-doesn't-own>` → 307 redirect → `/perform/setlist/<id>`
  (`page.tsx:83-86`). Picker unreachable. **This is the correct WRITE-gate, not an err-public violation.**
- **Severity:** NONE (recorded so triage does not "fix" a correct gate). Editing-gate ≠ viewing-gate.

---

## §D — Bond-correctness matrix (BC-1..4)

| Bond-bug-class | Probe | Detector verdict | Surfaced to a human? | Note |
|---|---|---|---|---|
| BC-1 wrong-song (TP) | "Barchu"↔"Ahava_Raba.pdf" | flagged `mismatch:true` overlap 0 ✓ | NO (BC-4) | detector correct; signal inert |
| BC-1 wrong-version (FN) | "Hallelujah"↔"Hallelujah_WRONG_KEY_F" | `mismatch:false` overlap 1 ✗ | NO | substring-rescue blind spot (F-003) |
| BC-2 orphan fileId | fileId → no library_index doc | `chartFileName:null,mismatch:false` | NO (Sentry only) | structural blindness (F-005) |
| BC-3 stale dual-read | songs.key='B♭' vs library_index.key='F' | get_song→B♭ (healed) / search_library→F (un-joined) | partial | per-surface truth split |
| BC-4 inert signal | clone `bondReviewCount:3` | n/a | **NOWHERE** | the headline finding (F-002) |

---

## §E — Picker heuristic matrix (PUX-1..5)

| PUX | Heuristic | Verdict | Observation |
|---|---|---|---|
| PUX-1 | H6 recognition (title-only) | **violation** | items show `{song.title}` only; filename never shown (`ChartBindPopover.tsx:175-177`) |
| PUX-2 | H1 visibility (binary hasChart) | **violation** | `ChartCell` = `Boolean(songId)`; suspect bond looks identical to healthy (`ChartCell.tsx:11,42`) |
| PUX-3 | H5 error-prevention (one-tap commit) | **violation** | single `onSelect` commits; no preview/confirm (`:113-116`) |
| PUX-4 | H8 help-recover (no nudge) | **violation** | recovery exists server-side (`swap_chart`), unsurfaced in UI |
| PUX-5 | H4 consistency (archived filter) | **partial** | popover filters archived, dialog doesn't (F-004) |
| — | H6 active-state highlight (`data-current`) | **pass** | currently-bound song highlighted indigo (`:164-169`) ✓ |
| — | form-label on cmdk input | **pass** | `aria-label="Bind a chart"` present (`:139`) ✓ |
| — | focus ring on ChartCell | **pass** | `focus-visible:ring-2 ring-indigo-400` (`ChartCell.tsx:37`) ✓ |

---

## §F — Out-of-13d-scope (parking lot)
- A3 live mid-service swap broadcast → **13a** (observed David *could* swap_chart live; deferred).
- Weekly MCP authoring round-trip friction → **13b**.
- Whether the bound MusicXML renders + transposes on WebKit → **13c**.
- Pure-perform offline chart survival → cycle-12 (already covered).

---

## §G — Cleanup state
Clean. `delete_setlist` × 3 (main clone + Aviva own-setlist + 1 secondary clone) all `ok:true`;
`cleanup_all_test_data({prefix:"c13d"})` swept 2 accounts; `list_test_accounts`/`list_setlists` verified
no `c13d`/`[CYCLE13D]` residue. No manual cleanup needed.

---

## §H — findings.jsonl (grep mirror — secondary)
```jsonl
{"id":"F-C13D-001","shape":"narrative","anchor":"A1>A2","class":"BC-1/PUX-1","persona":"David>Aviva","severity":"HIGH","surface":"ChartBindPopover.tsx:175-177","mechanism":"title-only item, fileId:=songId one-tap","fix_hint":"show bound filename inline in picker rows"}
{"id":"F-C13D-002","shape":"heuristic","anchor":"A1/A4","class":"BC-4","persona":"David/Aviva","severity":"HIGH","surface":"clone-setlist.ts:363-410","mechanism":"bondReviewRows returned, rendered nowhere","fix_hint":"per-row suspect-bond nudge in SetlistGrid from review_chart_bonds"}
{"id":"F-C13D-003","shape":"matrix","anchor":"A1","class":"BC-1-FN","persona":"Daniel","severity":"MEDIUM","surface":"chart-bond-audit.ts:86-93","mechanism":"substring-rescue clears wrong-version of same song","fix_hint":"don't retune threshold; filename-visibility is the mitigation"}
{"id":"F-C13D-004","shape":"matrix","anchor":"A1","class":"PUX-5","persona":"David","severity":"MEDIUM","surface":"ChartBindDialog.tsx:73-77","mechanism":"dialog lacks archived filter popover has","fix_hint":"shared useBindableSongs() hook"}
{"id":"F-C13D-005","shape":"heuristic","anchor":"A4","class":"BC-2","persona":"Daniel","severity":"MEDIUM","surface":"chart-bond-audit.ts:150-162","mechanism":"orphan fileId → mismatch:false, detector-blind","fix_hint":"grid nudge lights on chartFileName:null too"}
{"id":"F-C13D-006","shape":"matrix","anchor":"A1","class":"auth-correct","persona":"Aviva","severity":"NONE","surface":"page.tsx:83-86","mechanism":"musician non-owner redirect to perform","fix_hint":"none — correct WRITE-gate, do not relax"}
```

---

### HANDOFF-COMPLETE body (sample)
```
from cycle-13d-bond-hygiene-and-picker
HANDOFF-COMPLETE
bond-hygiene verdict: NEEDS-AFFORDANCE-WORK — F-C13D-001 (picker hides filename), F-C13D-002 (inert mismatch signal), F-C13D-004 (dual-entry archived divergence)
anchors: A1 ✓  A2 ✓  A3 DEFER-13a  A4 ✓
bond-bug-classes: BC-1 ✓(TP+FN) BC-2 ✓ BC-3 ✓ BC-4 ✓ ; picker PUX-1..5 graded
load-bearing P0/P1 findings:
  F-C13D-001  P1 narrative  — editor binds blind; picker shows title, not filename
  F-C13D-002  P1 heuristic  — mismatch detector output rendered nowhere
  F-C13D-004  P2 matrix     — popover vs dialog archived-filter divergence
cleanup: clean
report: .paul/research/cycle-13d-bond-hygiene-and-picker/REPORT.md
```
