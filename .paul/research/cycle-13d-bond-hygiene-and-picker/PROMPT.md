# Cycle-13d Cowork — Bond hygiene + chart-bind picker UX (SURFACE-depth methodology)

> **Drafted 2026-05-29 against deployed surface at origin/master `952edac4c3`** — every
> route / component / hook / MCP tool name / line-ref cited below was verified via
> `git ls-tree` + `Read` against that SHA per `[[feedback_cowork_prompt_verify_before_write]]`
> (NOT `git cat-file -e <rev>:<path>` — mangles the colon-path on Windows per
> `[[feedback_git_ref_path_check_windows]]`). **Re-confirm at run-time** via
> `git log -1 origin/master` and note any drift inline in §A.
>
> **Axis (cycle-13 charter, lane D):** the *seam* between two tightly-coupled surfaces —
> (1) the **data correctness of track→chart bonds** (wrong-song, orphan, stale dual-read,
> inert mismatch-signal) and the MCP tooling that surfaces/heals them, and (2) the
> **in-app chart-bind picker** a setlist editor uses to create those bonds. A wrong bond is
> *born* at pick-time and *felt* at service-time; this axis probes the whole arc, origin → manifestation.
>
> **Disjoint from siblings 13a / 13b / 13c** (charter §"The 4 axes"). 13b stresses the MCP
> *authoring round-trip*; 13d stresses **bond-CORRECTNESS + the picker UI**. Same MCP tools
> appear in both — coordinate duplicate findings at triage, NOT now. Do NOT synthesize across axes.

---

## §0 — What this axis BREAKS vs the PARENT cycle (cycle-12 Saturday-readiness)

Cycle-12 was a PERFORM-mode axis: offline survival + reload-stickiness for a musician
reading charts during a service. It assumed the bonds were already correct and asked "does
the chart survive the network." **13d inverts that assumption.** It asks: *is the chart even
the right one, and how did a wrong one get bound in the first place?*

| Dimension | cycle-12 (PARENT) | cycle-13d (THIS axis) |
|---|---|---|
| Primary surface | `/perform/setlist/<id>` chart overlay (read) | `/setlists/<id>` SetlistGrid chart-bind picker (write) + the bond data layer |
| Primary actor | Aviva-musician reading a chart | A setlist **editor** (owner / band_leader / admin) binding a chart |
| Threat model | wifi blip / cold reload | wrong-song bond / orphan fileId / stale dual-read / inert mismatch signal |
| "Good" looks like | chart paints offline in <2s | the picker shows the editor *which file* they'll get, and a wrong bond is caught + fixable before service |
| Anchor centre of gravity | A2 between-songs, A4 sanctuary | **A1 setup-prep** (bind-time) → manifests at A2/A4 |

**Anti-patterns this PROMPT intentionally breaks** (cycle-anti-pattern set AP-1..7; ≥3 required):
- **AP-1 (class-violation findings)** — every finding carries an anchor tag + a bond-bug-class
  tag + a *who-feels-it* severity. A raw "h-10 vs HIG-44" with no editor- or musician-felt
  friction is rejected to §F.
- **AP-4 (findings-as-only-output)** — §A verdict + §B WHAT-WE-LEARNED + §E bond-correctness
  matrix carry the design insight, not a bug-count.
- **AP-5 (audit-the-app stance)** — narrative cards are first-person ("I bound Adon Olam and
  got the wrong sheet"); the editor's POV and the musician's POV are *both* voiced.
- **AP-7 (single-state probe)** — 3 identities (David band_leader picker-user, Daniel admin
  MCP-user, Aviva musician who is REDIRECTED away from the picker — that redirect is itself a probe).

**Does NOT break (structurally vulnerable — note for future cycles):**
- **AP-2 (app-wide roam)** — deliberately narrow: 1 picker + the bond data layer + 1 fixture clone.
- **AP-6 (ship-freeze)** — N/A; per `[[feedback_no_saturday_framing]]` there is no service-gate framing here at all. Daniel is fixing everything; findings → fix wave.

---

## §0.1 — Boot pre-flight (HARD-BLOCK on failure → BLOCKER to supervisor, stop)

1. `git rev-parse --is-shallow-repository` → must be `false`. If `true`,
   `git fetch --unshallow origin` and re-verify (shallow-boundary commits lie about ancestry).
2. `git log -1 origin/master` → expected `952edac4c3` (cycle-13 Phase-2 base) or later. If
   advanced, run the verify-every-ref preamble against the new tip and note drift inline in §A.
3. Source the MCP bearer: `BEARER=$(node scripts/supervisor-prod-bearer.mjs)` (reads
   `SUPERVISOR_PROD_BEARER` from gitignored `.env.local` per `[[feedback_supervisor_bearer_persistence]]`).
   Assert `[ -n "$BEARER" ]` and the value starts `crl_live_`. **Never write the bearer to any
   file under `sheet-music-app/`** — redact as `***redacted***` in the REPORT.
4. (Optional) `MCP_ADMIN_TEST_SESSION_SECRET` in env. If set, the Daniel-admin in-browser identity
   is mintable via `POST /api/auth/admin-test-session` header `x-admin-test-secret` (NOT the long
   name — verified `src/app/api/auth/admin-test-session/route.ts`). If unset, mark every admin-browser
   probe `⊘ skipped — secret unset` and run Daniel as MCP-only.
5. `list_setlists({})` (admin bearer) returns ≥1 row. `review_chart_bonds` is registered
   (`src/lib/mcp/tools/index.ts:1449`); `clone_setlist` (`:580`), `clone_setlist_from_template`
   (`:769`), `swap_chart` (`:1070`), `update_track` (`:1047`) all present.
6. Confirm the **harness is warm** (per `[[feedback_cowork_harness_warm_worktree]]`): this lane
   drives the in-app picker via Playwright on the WebKit iPad project, so the worktree MUST have
   `npm ci` + `npx playwright install webkit` pre-staged. If `npx playwright test --list` errors on
   a missing WebKit binary → BLOCKER to supervisor (FU-c12-5 warm-worktree gate not satisfied), stop.

---

## §0.2 — Sandbox: clone a real bonded setlist to a `c13d`-prefixed fixture

> Verified against `src/lib/mcp/tools/clone-setlist.ts` at `952edac4c3`. Clone arg shape is
> `{sourceSetlistId, newName?, newEventDate?, copyServiceNotes?}`. The clone AUTO-stamps
> `isTest:true` when the new name matches the test pattern OR the caller uid is test-shaped.
> Bracketed `[CYCLE13D-...]` name → `isTest:true`. **Every write probe hits the clone, never a real id.**

```js
// Pick a real setlist with MANY bonded song rows so the bond-audit has surface to chew on.
// Use list_setlists + get_setlist to find one with ≥10 bonded tracks; clone THAT.
const src = /* a real setlist id with ≥10 bonded rows, chosen at run-time from list_setlists */;
const clone = await mcp.call("clone_setlist", {
  sourceSetlistId: src,
  newName: "[CYCLE13D] bond-hygiene + picker probe",
  copyServiceNotes: false,   // newEventDate omitted → clone has no eventDate → never leaks onto the upcoming landing
});
const fixtureId = clone.setlistId;
// CAPTURE the clone's advisory bond report — this IS a primary probe target (FU-c12-4, de2e089dc6):
//   clone.bondReviewCount  → number of title/filename mismatches the audit flagged
//   clone.bondReviewRows[] → [{position, trackId, title, fileId, chartFileName, overlapScore}]
//   clone.staleMetadataCandidates → occasion-token staleness hints
// Assert clone.isTest === true (bracketed name matches the pattern); if NOT → BLOCKER + stop.
```

**Why a clone of a real, heavily-bonded setlist:** the bond-audit (`auditBondedRows`,
`chart-bond-audit.ts:129`) only has signal when there are real `library_index/{fileId}.name`
filenames to compare against real titles. A skeleton fixture has nothing to flag.

---

## §0.3 — Identity provisioning: who can actually reach the picker

> **The load-bearing auth fact (verified `src/app/(main)/setlists/[id]/page.tsx:77-86`):** the
> chart-bind picker lives on the setlist EDITOR route `/setlists/<id>`, gated by `canEditSetlist`
> (`src/lib/setlist-permissions.ts`). **Owners + band_leaders + admins edit; a non-owner MUSICIAN
> is `redirect()`-ed to `/perform/setlist/<id>`.** So the picker is NOT a plain-musician surface
> for shared service setlists. This is a WRITE-gate — fully compatible with `[[feedback_err_public_not_gated]]`
> (the invariant gates *viewing*, not *editing*; nobody is blocked from SEEING a chart).

Per `[[feedback_sandbox_test_isolation]]`: create-side `uidPrefix`, cleanup-side `prefix`
(same value). **NEVER** `cleanup_all_test_data` without `prefix` (sweeps siblings 13a/b/c).
`c13d` passes the `uidPrefix` regex (lowercase alnum + single hyphens, 1-32 chars).

```js
// David — band_leader. THE picker persona: canEditSetlist returns true for ANY setlist,
// so David reaches /setlists/<fixtureId> and drives the in-app chart-bind picker.
const david = await mcp.call("create_test_account", { role: "band_leader", uidPrefix: "c13d" });
// Aviva — musician. The REDIRECT persona: on a setlist she does NOT own she is bounced to
// /perform/setlist/<id>. She can only reach the picker on a setlist SHE owns — so also mint
// her an own-setlist fixture to probe the picker from the owner-musician angle.
const aviva = await mcp.call("create_test_account", { role: "musician", uidPrefix: "c13d" });
// Daniel — admin, MCP-primary ([[user_mcp_is_primary_author_workflow]]). Exercises the
// bond-hygiene TOOLING side: review_chart_bonds, swap_chart, the clone bondReviewRows loop.
const danielSession = process.env.MCP_ADMIN_TEST_SESSION_SECRET
  ? await fetch(`${baseUrl}/api/auth/admin-test-session`,
      { method: "POST", headers: { "x-admin-test-secret": process.env.MCP_ADMIN_TEST_SESSION_SECRET } }
    ).then(r => r.json())
  : null; // unset → Daniel runs MCP-only; mark §A.

// Hydrate browser identities with Web-SDK auth via mintSession({firebaseAuth}) — META-003
// mitigated per cycle-4/harness/lib/probe.mjs (the bare test-session cookie does NOT hydrate
// Dexie/Firestore listeners, and the picker reads from Dexie — so without firebaseAuth the
// picker's song list is EMPTY and every picker probe lies).
import { mintSession } from "../../cycle-4/harness/lib/probe.mjs";
```

**The picker reads from Dexie, not Firestore directly.** `ChartBindPopover` /
`ChartBindDialog` both `useLiveQuery(() => getDb().songs...)` (verified
`ChartBindPopover.tsx:74-81`, `ChartBindDialog.tsx:73-77`). The local `songs` table is
hydrated by `SetlistGridHydrator`'s `subscribeSongsLibrary` listener. **A persona whose
Dexie isn't hydrated sees an empty picker** — this is both a setup requirement AND a
real fresh-tablet finding axis (see BC-3 below).

---

## §0.4 — Hardware fidelity

Band runs **6× standard 11" iPads (820×1180 WebKit portrait / 1180×820 landscape)** per
`[[project_band_ipad_hardware]]`. Playwright projects at `playwright.config.ts`: `ipad-webkit`
(820×1180) + `ipad-webkit-landscape` (1180×820). **Every in-app picker probe runs inside one
of those WebKit projects** — NOT chromium. The picker is a Radix Popover (in-cell) / Radix
Dialog (context-menu) over a `cmdk` Command; iOS-Safari focus + the `[@media(pointer:coarse)]`
touch-target bumps (`ChartCell.tsx:34-35`, `h-10`→`h-11` on coarse pointers) only behave
correctly on the real WebKit engine.

---

## §1 — Finding shapes (reuse the cycle-12 hybrid: narrative | matrix | heuristic)

Each finding self-tags the shape that BEST captures the friction. Markdown is the source of
truth (AP-3); an optional `findings.jsonl` mirror at §H is for grep only.

- **narrative** — friction is a lived MOMENT (an editor binds the wrong chart; a musician opens
  it mid-service). Card per cycle-12 §1.1, with `Anchor`, `Bond-bug-class`, `Persona`, a
  timeline beat in first person, a `Surface (mechanism footnote)`, a who-felt-it severity, and a
  1-3-sentence affordance fix.
- **matrix** — friction is a deterministic cell `(action × surface × identity × persistence)`.
  Card per cycle-12 §1.2 with a `Cell-ID`, expected-vs-observed in *user terms*, ≤6-step repro,
  3-trial determinism, artifact paths.
- **heuristic** — friction is a design-affordance violation under a stress condition. Card per
  cycle-12 §1.3 keyed to **H1 visibility · H5 error-prevention · H6 recognition-over-recall ·
  H8 help-recognize-recover** with a `Stress condition` (S-glare / S-time-pressure /
  S-partial-attention / S-stale-cache / S-cross-identity) and a first-person experience.

---

## §2 — Scope: bond-bug-classes × anchor moments × picker heuristics

### §2.1 — The 4 bond-bug-classes (axis-D-specific; each MUST surface as a probe, zero findings is acceptable data)

> These four refine the charter's 3 cycle bug-classes (stickiness / fresh-tablet / auth-divergence)
> for the bond surface. Map every finding to one.

- **BC-1 — wrong-song bond.** Track title says X, the bonded `library_index/{fileId}.name` is a
  different song (the canonical failure: "Barchu" bonded to "Ahava Raba.pdf" — the exact case the
  `review_chart_bonds` detector was built for, see `chart-bond-audit.ts:13-24` jsdoc). The detector
  is `compareTitleToFilename` (`:78`) with a Jaccard overlap threshold of **0.34**
  (`MISMATCH_OVERLAP_THRESHOLD`, `:42`) + a compact-substring rescue (`:86-93`).
  - **Stress this:** the threshold is *deliberately conservative to never false-positive* on Hebrew
    transliteration variants. The cost is **false-NEGATIVES**: a filename that merely *contains* the
    title clears at overlap 1 (`:91`). Probe a wrong-*arrangement* / wrong-*key* bond of the same
    song (title "Hallelujah" bonded to a file named "Hallelujah_WRONG_KEY_F.pdf") → the detector
    says `mismatch:false`. Is the conservatism right, or does it hide real wrong-version bonds?
- **BC-2 — orphan bond.** `fileId` points at a `library_index` doc that does not exist. `auditBondedRows`
  returns `chartFileName:null` + `mismatch:false` for these (`:150-162`) — it treats a missing
  catalog row as a byte-health concern for `verify_setlist_charts`, NOT a wrong-song concern. **So
  the mismatch detector is structurally BLIND to orphans.** Probe: does anything surface an orphan
  bond to the editor or musician? (The byte-health cron `verify-chart-bond-health` is the only
  catcher — and it routes to Sentry, not to a human UI; see §2.4.)
- **BC-3 — stale dual-read.** `swap_chart`/`getSongById` resolve title+key+bpm from
  `songs/{id}.defaults` with a `library_index/{id}` fallback (`server-songs.ts:148-177`), while the
  bond AUDIT compares against `library_index/{fileId}.name`, AND `getAllSongs` (search_library — the
  list-shaped read) **skips the dual-read join entirely** (`:163-165`). Probe: a song whose
  `songs/{id}` and `library_index/{id}` disagree — does get_song show one key while search_library
  shows another? Does a clean `swap_chart` leave a row the audit still flags (or vice-versa)?
  `[[project_catalog_dual_read_surfaces]]`.
- **BC-4 — inert mismatch signal.** `clone_setlist` + `clone_setlist_from_template` now RETURN
  `bondReviewCount` + `bondReviewRows[]` (FU-c12-4, `de2e089dc6` — clone-setlist.ts:363-410,
  templates.ts:883-921), and `review_chart_bonds` returns `rows[]` with per-row `mismatch`. **But
  nothing CONSUMES these in a human-visible way** — no picker badge, no grid warning, no follow-up
  nudge. Probe: after a clone with `bondReviewCount > 0`, where does an editor or musician ever SEE
  that 3 rows are suspect? (Honest self-disclosure: this lane's own author shipped the `bondReviewRows`
  *data* in `de2e089dc6`; the *action loop* that surfaces it is unbuilt. This probe measures that gap.)

### §2.2 — The chart-bind picker UX (the in-app surface, heuristic-shape)

Verified surfaces: `ChartBindPopover.tsx` (in-cell click entry), `ChartBindDialog.tsx`
(context-menu "Bind chart" entry), `cells/ChartCell.tsx` (the indicator button), wiring in
`SetlistGrid.tsx` (`handleBindChart:1124`, `handlePickSong:1521`; two entry points at `:419-429`
and `:1778-1789`), defaults seed in `src/lib/songs/defaults.ts:36`.

Grade each heuristic against the picker on `ipad-webkit` (David on `/setlists/<fixtureId>`):

| # | Heuristic | The probe | The hazard to confirm/deny |
|---|---|---|---|
| **PUX-1** | **H6 recognition-over-recall** | Open the picker; read every CommandItem. | Items show the **song TITLE only** (`ChartBindPopover.tsx:175-177`, `ChartBindDialog.tsx:170-172`) — never the chart **filename** (`library_index/{songId}.name`). The editor binds by title and cannot *recognize* which actual file they're attaching. For a song with the WRONG file bonded, the picker gives zero signal. |
| **PUX-2** | **H1 visibility of system state** | Bind a song whose canonical file is wrong/stale; observe the grid cell + picker after. | `ChartCell` shows only `hasChart = Boolean(songId)` (`ChartCell.tsx:11,42`) — a binary "bound / not bound". No "this bond looks suspect" state, even when `review_chart_bonds` would flag it. The system *knows* (server-side) and *says nothing* (client-side). |
| **PUX-3** | **H5 error-prevention** | Tap a single CommandItem. | One `onSelect` tap commits the bond immediately (`handlePick` → `onBind` → `applyEdit`, `ChartBindPopover.tsx:113-116`) — no preview of the file, no confirm step. Binding a wrong chart is a one-tap, zero-friction error. Contrast `/ui-ux-pro-max` UX rule *"Confirm before irreversible/destructive actions"* (High). |
| **PUX-4** | **H8 help recognize+recover** | After a wrong bind, hunt for a recovery affordance in the grid/picker. | The recovery path (`swap_chart` / re-bind) exists server-side but the UI surfaces no "this row's chart doesn't match its title — fix?" nudge. The mismatch detector's output (BC-4) never reaches the editor who could act on it. |
| **PUX-5** | **Two-entry divergence (H4 consistency)** | Bind via the in-cell click (Popover) AND via the context-menu "Bind chart" (Dialog) for the same row. | **The two entry points read DIFFERENT candidate lists.** `ChartBindPopover` filters `status !== 'archived'` (`:74-81`); `ChartBindDialog` does `getDb().songs.toArray()` with **NO archived filter** (`:73-77`). The same editor, two affordances, two libraries — an archived (intentionally-retired) song is bindable via the context-menu path but hidden from the in-cell path. |

### §2.3 — Anchor moments (charter A1–A4)

| Anchor | What "good" looks like for 13d | Probe |
|---|---|---|
| **A1 setup-prep** (centre of gravity) | An editor binding charts to a fresh/cloned setlist can SEE which file each bond points to, and a wrong/stale/orphan bond is caught before service. | §3.A picker walk + §3.C clone bond-review loop |
| **A2 between-songs** (manifestation) | A wrong bond born at A1 surfaces here: musician opens track N+1, gets the wrong sheet. Trace one BC-1/BC-2 finding from its A1 origin to its A2 felt-cost. | §3.B one end-to-end narrative trace |
| **A3 mid-service change** | **OWNED BY SIBLING 13a** (leader live-broadcast). 13d touches `swap_chart` only as the *fix-path TOOL*, not as a live-broadcast moment. If A3-live frictions emerge, NOTE in §F, do NOT promote. |
| **A4 sanctuary edge** | An orphan/stale bond discovered at service time has *some* recovery path; the byte-health cron (`verify-chart-bond-health`) actually reaches a human. | §3.C + the BC-2/BC-4 inert-signal probe |

### §2.4 — The byte-health cron (context, not a heavy probe)

`src/app/api/cron/verify-chart-bond-health/route.ts` (schedule `0 15 * * 4`, `vercel.json:28-29`)
checks chart **byte-reachability** (`verifySetlistCharts`), **not** title/filename mismatch — it is a
*different* detector from `review_chart_bonds`. It dropped the `publishedAt` gate (`:96-104`) and
excludes test fixtures in-process (`:113-119`) per `[[feedback_err_public_not_gated]]`, and on breach
routes to **Sentry** (`captureMessage`, `:208-231`) because `chart_bond_alerts` has no human reader
(`:209-211`). Probe lightly: curl it with `CRON_SECRET`, assert `surveyed > 0` and that the c13d
`isTest:true` fixture is EXCLUDED. **Do NOT** rebuild cycle-11's cron coverage — note only whether
the *title-mismatch* class (BC-1/BC-2) has ANY automated human-facing path (it does not — that's the
BC-4 finding).

---

## §3 — Walkthrough plan (~75 min budget; per `[[feedback_cowork_real_harness]]`, single-thread, NOT walk-away)

| Phase | Time | Vehicle |
|---|---|---|
| §0 boot + clone + identity mint | ~12 min | MCP calls + Playwright context hydrate |
| **§3.A — picker UX walk (David, `ipad-webkit`)** | ~18 min | live judgment on `/setlists/<fixtureId>` + the 5 PUX heuristics |
| **§3.B — one end-to-end wrong-bond trace (A1→A2)** | ~12 min | seed a BC-1 bond via picker, open it in `/perform`, narrate the felt-cost |
| **§3.C — MCP bond-hygiene loop (Daniel admin)** | ~18 min | clone bondReviewRows → review_chart_bonds → swap_chart fix → re-review; BC-1..4 matrix |
| **§3.D — the Aviva-redirect + dual-entry-divergence probes** | ~8 min | musician hits `/setlists/<sharedId>` → assert redirect; PUX-5 popover-vs-dialog list diff |
| Cleanup + REPORT | ~7 min | `cleanup_all_test_data({prefix:"c13d"})` + write §A-§H |

### §3.A — picker UX walk (David, band_leader, ~18 min)
1. David opens `/setlists/<fixtureId>` on `ipad-webkit` → SetlistGrid renders (he can edit; `canEditSetlist` true).
2. Tap an unbound row's ChartCell (in-cell entry) → ChartBindPopover opens. **PUX-1/PUX-2/PUX-3:** read the
   items (title-only?), check for any file-preview or suspect-bond state, count taps-to-commit.
3. Open the SAME row's context menu → "Bind chart" → ChartBindDialog. **PUX-5:** diff the candidate list
   against step 2 (archived song present in one, absent in the other?). Pre-seed an archived song via MCP if
   the fixture has none (`update_song`/`archive` path — verify the archive write surface at run-time).
4. Bind a song; reload `/setlists/<fixtureId>`. **stickiness:** does the bond survive reload (fileId persisted)?
5. **H1 lens (cycle-12 §1.3):** note every state the editor can/can't see — bound file identity, bond-health, key/bpm seeded from `seedTrackFromSong` (`defaults.ts:36`).

### §3.B — one end-to-end wrong-bond trace (A1 → A2, ~12 min)
1. As David, bind a track titled "<song A>" to a library song whose canonical file is actually "<song B>"
   (pick a known dual-read or wrong-file row from §3.C's audit; or construct one on the fixture).
2. Switch to Aviva on `/perform/setlist/<fixtureId>` (musician CAN view perform), open that track.
3. **Narrate** (first-person, AP-5): what does Aviva see — right title, wrong sheet? At what moment does
   she realize? What is her recovery (none in-app; she's read-only here)? This is ONE deep narrative finding.

### §3.C — MCP bond-hygiene loop (Daniel admin / MCP, ~18 min)
1. From §0.2's clone, inspect `clone.bondReviewCount` + `clone.bondReviewRows[]`. For each flagged row,
   record `{position, title, chartFileName, overlapScore}`.
2. `review_chart_bonds({setlistId: fixtureId})` → compare its `rows[].mismatch` to the clone's
   `bondReviewRows` (should be consistent — both call `auditBondedRows`). Note any divergence.
3. **BC-1 false-negative probe:** construct a same-song-wrong-version bond; assert the detector returns
   `mismatch:false` (overlap rescue). Document the blind spot.
4. **BC-2 orphan probe:** point a track's fileId at a non-existent `library_index` id (via update_track on
   the fixture); re-run `review_chart_bonds`; assert the row comes back `chartFileName:null, mismatch:false`
   (the structural blindness).
5. **BC-3 dual-read probe:** find/synthesize a song where `songs/{id}` and `library_index/{id}` disagree on
   key; compare `get_song` (healed) vs `search_library` (un-joined, `:163-165`). Document the per-surface truth split.
6. **swap_chart fix-path:** `swap_chart({setlistId, trackId, newSongId})` on a flagged row; re-run
   `review_chart_bonds`; confirm the mismatch clears (or document why it doesn't — BC-3 interaction).
7. **BC-4 inert-signal:** for every flag found, answer in the REPORT: *where would a non-MCP editor or a
   musician EVER see this?* (Expected answer: nowhere — that's the finding.)

### §3.D — Aviva redirect + dual-entry divergence (~8 min)
1. Aviva (musician) navigates to `/setlists/<a-setlist-she-does-not-own>` → assert HTTP redirect to
   `/perform/setlist/<id>` (page.tsx:83-86). Confirm the picker is unreachable to her there. (This is the
   correct WRITE-gate, NOT an err-public violation — call that out explicitly so triage doesn't misfile it.)
2. Re-confirm PUX-5 with a screenshot pair: popover list vs dialog list for the same archived-containing fixture.

---

## §4 — Boot order (runbook)
1. Read this PROMPT end-to-end.
2. Read `.coord/cycle-13-CHARTER.md` once (shared frame, anchor moments, anti-patterns, run policy).
3. Read `cycle-4/harness/README.md` for the `mintSession({firebaseAuth})` shape + probe reality.
4. §0.1 pre-flight — HARD-BLOCK on failure.
5. §0.2 clone — assert `isTest:true`; capture `bondReviewCount`/`bondReviewRows`.
6. §0.3 identities — David (picker) + Aviva (redirect/own-setlist) + Daniel (MCP). Hydrate browser
   personas with `mintSession({firebaseAuth})`; the picker reads Dexie, so an un-hydrated context = empty picker.
7. §0.4 open WebKit iPad contexts.
8. Run §3 A→B→C→D in order; time-box each.
9. Cleanup §6.
10. Write REPORT.md §A–§H.

---

## §5 — Output shape (the deliverable)

Write to **`.paul/research/cycle-13d-bond-hygiene-and-picker/REPORT.md`** (ONE consolidated file;
optional `findings.jsonl` mirror at §H for grep — markdown is source of truth).

```markdown
# Cycle-13d Bond hygiene + chart-bind picker — REPORT

**Run date:** YYYY-MM-DDTHH:MMZ
**Wall-clock:** ~75 min single-thread ([[feedback_cowork_real_harness]])
**Master SHA at run:** <git log -1 origin/master>  (expected `952edac4c3` ± drift)
**Identities:** David (band_leader, picker) + Aviva (musician, redirect/own-setlist) + Daniel (admin via admin-test-session OR "MCP-only — secret unset")
**Source setlist (read-only ref):** <real id chosen at run-time, ≥10 bonded rows>
**Fixture clone (write target):** <fixtureId> — `[CYCLE13D]` named; `isTest:true` verified
**Anchor coverage:** A1 ✓  A2 ✓  A3 DEFER-TO-13a  A4 ✓
**Bond-bug-class coverage:** BC-1 ✓  BC-2 ✓  BC-3 ✓  BC-4 ✓
**Picker heuristics:** PUX-1..5 graded
**Cleanup state:** clean | partial — list orphans
**Bond-hygiene verdict:** SOLID | NEEDS-AFFORDANCE-WORK <list> | BOND-CORRECTNESS-RISK <list>

## §A — Verdict (≤200 words)
Would I trust an editor to bind charts to next week's service in-app WITHOUT silently
attaching a wrong/stale sheet? Anchor on: can the editor SEE the file they're binding (PUX-1)?
Is a wrong bond caught (BC-1..4) before a musician opens it at A2? What is the single biggest
bond-correctness or picker-affordance gap? Note SHA drift here.

## §B — WHAT-WE-LEARNED (≥3 design principles)
One-line distillation + 2-3 sentences each. Designer-actionable, NOT bug-counts (AP-4). E.g.
"The picker binds by song-identity but the user thinks in chart-files — the title/file gap is
the root of every wrong-bond class."

## §C — Findings (§1 hybrid shape; tagged narrative|matrix|heuristic; ordered by severity)
Each `F-C13D-NNN` carries: shape, anchor, bond-bug-class (BC-1..4) or picker-heuristic (PUX-1..5),
persona, the friction, a who-felt-it severity, a 1-3-sentence affordance fix. Target **5–12** findings.

## §D — Bond-correctness matrix (BC-1..4 × probe verdict)
| Bond-bug-class | Probe | Detector verdict | Surfaced to a human? | Note |
|---|---|---|---|---|
| BC-1 wrong-song (true positive) | Barchu↔Ahava-Raba-shape | flagged? | where? | |
| BC-1 wrong-version (false negative) | Hallelujah↔Hallelujah_WRONG_KEY | mismatch:false? | — | overlap-rescue blind spot |
| BC-2 orphan fileId | fileId→no library_index | chartFileName:null,mismatch:false? | — | structural blindness |
| BC-3 stale dual-read | songs vs library_index key disagree | get_song vs search_library split | — | |
| BC-4 inert signal | bondReviewCount>0 on clone | n/a | NOWHERE (the finding) | |

## §E — Picker heuristic matrix (PUX-1..5 × pass/partial/violation)
| PUX | Heuristic | Verdict | Observation |
|---|---|---|---|
| PUX-1 | H6 recognition (title-only) | … | |
| PUX-2 | H1 visibility (binary hasChart) | … | |
| PUX-3 | H5 error-prevention (one-tap commit) | … | |
| PUX-4 | H8 help-recover (no nudge) | … | |
| PUX-5 | H4 consistency (popover vs dialog archived filter) | … | |

## §F — Out-of-13d-scope (parking lot)
A3-live-broadcast frictions (→ 13a), MCP-authoring-roundtrip frictions (→ 13b), WebKit-engine
rendering frictions (→ 13c), pure-perform-offline frictions (cycle-12). Note, do NOT promote.

## §G — Cleanup state
If §6 partially failed, list orphans. Daniel sweeps.

## §H — Optional findings.jsonl (grep mirror)
{id, shape, anchor, class, persona, severity, surface, mechanism, fix_hint}
```

### HANDOFF-COMPLETE body (for `.coord/inbox/supervisor.md`)
```
from cycle-13d-bond-hygiene-and-picker
HANDOFF-COMPLETE
bond-hygiene verdict: <SOLID | NEEDS-AFFORDANCE-WORK <list> | BOND-CORRECTNESS-RISK <list>>
anchors: A1 ✓  A2 ✓  A3 DEFER-13a  A4 ✓
bond-bug-classes: BC-1 ✓ BC-2 ✓ BC-3 ✓ BC-4 ✓ ; picker PUX-1..5 graded
load-bearing P0/P1 findings (≤5 IDs + one-line):
  F-C13D-NNN  P1 heuristic — <one-line>
  …
cleanup: clean | partial — orphans
report: .paul/research/cycle-13d-bond-hygiene-and-picker/REPORT.md
```

---

## §6 — Cleanup (MANDATORY before HANDOFF-COMPLETE, ~7 min)
```js
await mcp.call("delete_setlist", { id: fixtureId, force: true });
// + any own-setlist fixture minted for Aviva, + any secondary clones
await mcp.call("cleanup_all_test_data", { prefix: "c13d" });  // NEVER without prefix ([[feedback_self_inclusion_test_fixtures]])
await mcp.call("list_test_accounts", {});   // → none matching c13d
await mcp.call("list_setlists", {});        // → no [CYCLE13D] names
```
Any residual → list under §G; Daniel sweeps.

---

## §7 — Anti-patterns broken (required disclosure)
- **AP-1** — every finding tagged anchor + bond-bug-class/PUX + who-felt-it severity; class-only rejects to §F.
- **AP-4** — §A + §B + §D + §E carry design insight beyond bug-count.
- **AP-5** — narrative cards are first-person (editor AND musician POV).
- **AP-7** — 3 identities incl. the Aviva-redirect-as-probe.

NOT broken (vulnerable, noted): **AP-2** (narrow by design — 1 picker + bond layer + 1 clone);
**AP-6** (N/A — no service-gate framing per `[[feedback_no_saturday_framing]]`).

---

## §8 — Operational rules + hard out-of-scope
**Binding:**
- ⛔ No writes to any real setlist — every write hits the `[CYCLE13D]` clone or a minted fixture.
- ⛔ No bearer/secret in any file under `sheet-music-app/` — redact `***redacted***`.
- ⛔ NEVER `cleanup_all_test_data` without `prefix:"c13d"` (sweeps siblings 13a/b/c).
- ⛔ `[[feedback_err_public_not_gated]]` — NEVER propose gating a chart/setlist from a musician.
  Bonds + charts are public-by-design. The picker WRITE-gate (`canEditSetlist`) is fine; do not
  recommend tightening any READ path. Any affordance fix must err toward *showing more*, not hiding.
- ⛔ `[[feedback_no_saturday_framing]]` — no Saturday/downbeat/service-gate qualifiers anywhere.

**Hard out-of-scope (do NOT touch — design-only lane):**
- Repo-root `mcp/`, `bridge/`, **`mcp/bridge/SetlistGrid.tsx`** (coordination-sensitive per
  `[[project_mixer_feature]]`), `src/lib/mcp/errors.ts`, `error-envelopes.ts`. (The picker source
  `src/components/setlist/grid/SetlistGrid.tsx` is a *different* file — but this lane reads it, never edits it.)
- A3 live-broadcast (→ 13a), MCP-authoring-roundtrip depth (→ 13b), WebKit-rendering depth (→ 13c).
- `/monitor` (wedges, not IEM, per `[[feedback_terminology]]`) — entirely out of scope.

---

## §9 — Success criterion (auditor checks before ACCEPT)
The cowork RUN "ran successfully" iff:
- All 4 bond-bug-classes (BC-1 TP + FN, BC-2, BC-3, BC-4) have a §D verdict (no `?` cells).
- All 5 picker heuristics (PUX-1..5) have a §E verdict.
- §3.B produced ≥1 end-to-end A1→A2 narrative trace.
- §A verdict is decisive (SOLID / NEEDS-AFFORDANCE-WORK / BOND-CORRECTNESS-RISK) with a one-sentence-per-P0/P1 rationale.
- §B has ≥3 design principles.
- Cleanup §6 verified empty (or §G lists orphans).
- HANDOFF-COMPLETE landed in supervisor inbox.

**Auditor verification (Tier-0 doc for THIS prompt-design lane; Tier-1 for the eventual RUN):**
per `[[feedback_auditor_deployed_surface_verification]]`, sample 2–3 P0/P1 findings against the
deployed surface (a live `review_chart_bonds` call or a Playwright picker re-fire) before ACCEPTing the RUN.

---

## §10 — Sign-off
The cowork instance signs the supervisor inbox HANDOFF-COMPLETE `from cycle-13d-bond-hygiene-and-picker`.
The auditor reads the REPORT against (a) verify-every-ref pass (b) §D + §E matrices full (c) §A verdict
+ §B principles present (d) cleanup verified.

Go.

— from coder-5 (lane `cycle-13d-bond-hygiene-and-picker-PROMPT-design`)
