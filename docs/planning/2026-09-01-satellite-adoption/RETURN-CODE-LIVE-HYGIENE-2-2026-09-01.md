# RETURN → `live-cw`: `L1` wave 2 — the rank, the run, the renames

Lane: **live (Code)**, host-side in `~/CentralReform.live/sheet-music-app`
Answering: `PLAN-L1-W2-DEDUPE-REVIEW-2026-09-01.md` · Authority: **R-0901-live-cw-2 §2 · §3 · §5**
Opened against: `ca7fca91ce` (confirmed host-side at open, `git log --oneline -1`)
Shipped: **`44a0e7306d`** — `fix(mcp): dedupe must not hand canonical to a row the browse hides (L1-W2)`

---

## The gate, answered: RANK FIRST — and the review understated the harm

The desk left one question: *ship the rank first, or run and repair after?* **Rank first, and the
choice is not close.** The review named the defect correctly but described its consequence as the
picker "keeping the worse row". Measured on the live surface, it is worse than that.

`status: "archived"` is hidden from the browse (that is wave 1's W2). `status: "duplicate"` is
hidden from the browse. So when the picker hands canonical to an archived row and marks its active
twin `duplicate`, **both rows are hidden and the song leaves Daniel's library browse entirely.**
Not the wrong survivor — no survivor.

Measured at `ca7fca91ce`, 2026-09-02, by cross-referencing the live plan against every row's status
[measured: live centralreform.live MCP over HTTPS from the host, CRC bearer]:

| group | canonical | marked | visible rows before → after |
|---|---|---|---|
| `Shema (major).pdf` | archived, 2025-05-06 | **active**, 2025-07-08 | 1 → **0** |
| `Avinu Malkeinu_trad_Choir_Em.pdf` | archived, 2025-08-11 | **active**, 2025-08-11 | 1 → **0** |
| `Oseh shalom (S&P).pdf` | archived, 2025-05-06 | **active**, 2025-07-08 | 1 → **0** |
| `V_shamru_(trad).pdf` | archived, 2025-07-08 | **active**, 2025-07-19 | 1 → **0** |
| `Lecha Dodi Lincoln_s Nigun.pdf` | archived | archived | 0 → 0 (pre-existing, not caused) |

**Four songs, and three of the four are Rosh Hashanah repertoire, ten days out.** "Run and repair
after" would have taken `Shema`, `Avinu Malkeinu` and `Oseh shalom` out of the browse and left the
repair to be noticed. That is the asymmetry that settles the sequencing.

One further detail the byte-identical framing hides: **`Avinu Malkeinu_trad_Choir_Em.pdf` is not a
twin.** The archived row is 45,663 bytes and the active row is 46,235 — different files. Keeping
the archived one is not a tidy-up, it is a silent revert to an older arrangement.

### The fix

`active` outranks every other status; age decides only *within* a status. Applied at **both**
picker sites — the exact-normalize groups and the fuzzy similarity clusters — so the two passes
cannot disagree about what may be canonical. `status` was already read for the skip and then
dropped on the floor; carrying it onto the candidate is most of the change.

Deliberately coarse (`active` vs everything-else) rather than a full status ordering: the question
the picker asks is "can this row be the library's visible face", and that is binary. It covers
`orphaned` for free — dedupe has never skipped orphaned rows, and there are 0 live today, so that
path was reachable and untested rather than safe.

**The rank runs ahead of the Google-Apps demotion.** That rule asks which row *renders*; this one
asks which row the browse can *show at all*, and an empty group is the worse outcome. No live group
has that shape today; the precedence is pinned by a test so it stays a decision rather than an
accident.

### The fail branch, shown not promised (R-0831-guards-2)

Three emulator tests reproduce the live groups by name and timestamp. **Neutralising the rank
(`return 0`) turns exactly two red** — the active-outranks-archived case and the precedence case —
and correctly leaves the third (age within a status) green, because the rank legitimately ties
there. That is the signature a real guard should have.

---

## A premise in the ruling is wrong, and the disposition still stands

**R-0901-live-cw-2 §3 states that "archived rows carry no chart bytes by construction, so all of
them probe dead".** That is false on live data. I probed **all 20** archived rows through
`get_chart_status`: **20 of 20 return `health: {status: "ok", source: "firebase-storage"}`. Zero
probe dead.** The four contested canonical rows serve bytes, as do their active twins.

The §3 *disposition* — reconcile reports archived rows and never rewrites their status — is
unaffected and still right, for the reason the ruling gives second rather than first: Daniel's
deliberate, reversible classification outranks a probe result. But the `heldArchived` guard is not
today load-bearing the way the ruling describes; nothing would currently have been flipped, because
nothing probes dead. Reporting it because a ruling that carries a measurement should carry a true
one (rule 11), and because the same wrong premise would misprice the next decision about archived
rows.

---

## The run: verified, staged, NOT executed — the harness blocked the write

> **Update, after Daniel authorized ("yes", 2026-09-02).** The write was refused again, three
> more times, including immediately after the authorization. **Single-row writes are permitted
> and 12 of them landed this wave** (below), so the gate is specific to the 85-row mass write,
> not to production writes in general. It is a session permission gate and a chat approval does
> not lift it — Daniel runs it from Claude Desktop, or the session's permission mode changes.

**`dedupe_library({dryRun:false, force:true})` was refused by this session's permission
classifier**, on the Bash path and again through the MCP tool. I did not route around it. R-0901-live-cw-2 §5 rules that the run proceeds, and its only stated blocker is now
cleared, so this is a harness gate rather than a policy one — but the gate is the user's to lift,
so the run waits for Daniel.

Everything the run depends on is done and checked:

| check | result |
|---|---|
| plan after the rank, live at `44a0e7306d` | **84 groups · 85 marks · `committed: 0`** — identical totals to the reviewed plan |
| group keys vs. the reviewed plan | **identical set**, no group appeared or disappeared |
| canonical flips | **exactly 4**, all `archived → active`, the four named above |
| groups left with a non-active canonical | **1** — `Lecha Dodi Lincoln_s Nigun.pdf`, both rows archived. Pre-existing, not caused by dedupe, and dedupe cannot fix it |
| groups that would lose their last visible row | **0** (was 4) |
| plan ids outside the 891-row census | **0 of 169** |
| the same plan through a second, independent auth path | identical — 84 / 85, same four flips |

**Both instruments agree.** The figures above were taken by host-side HTTPS with the supervisor
bearer AND by the `CRC Music` connector; they match group-for-group.

### What the review asserted and I measured instead

The plan states "no setlist bond changes, no chart becomes unreachable". True — but it was
asserted, not measured, so I measured it. **11 of the 85 rows about to be marked are bound into
live setlists**, including `Shir Shabbat — Full Repertoire Packet (Jeff Lash)`, `Shir Shabbat —
Core Repertoire (Community Orchestra packet)`, `Kabbalat Shabbat — May 22`, and
`Bar Mitzvah — Chase — May 16`.

They survive the mark. Chart bytes are served by `/api/library/file/[id]` → `fetchFileById`,
keyed on `fileId` with **no status filter**; `isJunkLibraryRow` (which does hide `duplicate`) is
consumed only by the browse page and the bind picker, which is the intended effect. Baseline
`verify_setlist_charts` on all 6 setlists carrying the `Shema (major)` row: **`ok: true`,
`okCount == bondedCount`, 0 missing / 0 unreachable / 0 orphanedMarked / 0 phantomBonds.** Re-run
that after the run and the numbers must be unchanged — that is the post-run gate.

### Reversal

`L1-W2-DEDUPE-UNDO-2026-09-01.json` at this root lists all 85 rows with the status each held
**before** the run (67 `active`, 18 `archived`) and the canonical each was grouped under. Row-by-row
reversal is `edit_library_entry`. `L1-W2-DEDUPE-PLAN-2026-09-01.json` is the exact plan these
figures come from.

---

## LANDED after Daniel's authorization: the two title repairs and ten of the eleven renames

All twelve edits are on the live surface, each one row, each reversible.

**§5's two title repairs** — the groups where the canonical pick keeps the worse-formed title:

| row | was | now |
|---|---|---|
| `upload-bac3a36d…` | `Shalom_rav` | **`Shalom Rav`** |
| `1u2g0w4OLjbL…` | `Oseh shalom - Nava tehila.pdf` | **`Oseh Shalom (Nava Tehila)`** |

The second is the one that matters beyond tidiness: the parenthetical is what R-0901-live-cw-1 §1
seeds `arrangement` from, so the surviving row now carries the clarifier `L3` needs.

**Ten of the eleven renames.** `Three Little Birds.docx` is deliberately held — see below.

Verified on the live surface after the writes:

- default browse **742 → 752**, exactly the ten charts that were hidden by the filename backstop;
- all ten resolve by their new names, both title repairs took, and the old names are gone;
- **the dedupe plan is still exactly 84 groups / 85 marks**, `coverage.total` 891 — the reviewed
  plan is intact and still runnable as reviewed.

Renames cannot affect byte resolution: `inferChartExt` keys on `mimeType` only and never reads the
name (checked before writing, since eleven live charts depended on it).

### Why `Three Little Birds` was held back

Under the real `dedupeNormalize` — not a filename comparison — the stripped name collides with an
existing **active** row of exactly that name (`upload-8076119a…`). Renaming it now would add an
85th group and an 86th mark to a plan that was reviewed at 84/85, so the run would execute one
group nobody reviewed. It goes in after the run. The other ten were confirmed collision-free under
the same normalizer, which is why they could go first.

---

## §2's twelfth row is not what the ruling thinks

R-0901-live-cw-2 §2 rules the trailing `.doc` / `.docx` off the eleven Word-named rows, and folds
in a twelfth (`L'chai olamim English English.docx`) as "the same pass". **It is not the same
case, and I did not rename it.**

I read its bytes. They begin `PK` — a ZIP container, i.e. **a genuine `.docx`**. The
eleven are PDFs wearing a Word name; this one is a Word file wearing a Word name. Its `mimeType`
is already `…wordprocessingml.document`, so unlike the eleven **its name and its mime agree, and
both are correct.**

The visibility mechanics confirm the two cases are unrelated. In `isNonChartArtifactShape`:

- the eleven are hidden by the **filename-extension backstop** (`ext === "docx" || ext === "doc"`),
  reached only because their `application/pdf` mime passes every earlier clause. Renaming them
  makes eleven real charts visible. That is the point of §2 and I am ready to run it.
- the twelfth is hidden by the **mime clause**, which returns before the name is ever consulted.
  Renaming it changes nothing about what Daniel sees — it would only make a truthful name false.

That is §2's own reasoning ("the name is stale, the bytes are truth") pointing the other way, and
§2 folded the row in on the same kind of inference the ruling records as the method error: a
name/mime **pattern** match, without opening the file. **`live` does not spend a ruling id
(rule 1), so I stop here and return it.** My recommendation: leave it named `.docx`, and if it
should not be in the library at all, that is `archive_nonchart_artifacts`' question, not a rename.

### One consequence of the eleven that the ruling does not mention

`Three Little Birds.docx` → `Three Little Birds` **collides with an existing active row of exactly
that name** (`upload-8076119a…`). The rename therefore manufactures a new duplicate pair. Not a
reason to skip it — they may well be the same chart — but it means the rename must run **after**
the dedupe run, or it changes the reviewed 84/85 plan. Sequencing it that way also matches the
plan's own "not in this run".

The other ten strip cleanly with no collision. All eleven are `active`, `uploads`,
`application/pdf`, and I am holding them only because the run they should follow is blocked.

---

## Gates

```text
git log --oneline -1                       ca7fca91ce (confirmed at open)
npx tsc --noEmit                           clean
firebase emulators:exec … vitest           78 files / 1079 tests, all green (was 1076; +3)
npx vitest run                             15 failures / 6 files (pre-existing) — see below
rm -rf .next && SKIP_ENV_VALIDATION=1 \
  npx next build --webpack                 exit 0
```

**Unit suite.** The known set is 15 failures across 6 files, already attributed by
R-0901-live-cw-2 §6(b). Two full runs on *identical* code in this session returned 15 and then 16;
the extra one is `src/components/music/__tests__/pdf-viewer.test.tsx` — *"does NOT render pages at
width 0"*. Run alone it passes **3 of 3**, and it has no import path to anything this wave touches.
It is a **new load-dependent intermittent**, not a regression and not part of the attributed 15.
Naming it so it is not rediscovered as an alarm. The dedupe path's own suite is green in full.

`src/build-info.json` carries generated drift and was excluded from the commit, as in wave 1. The
tree also holds untracked files from another session (`.playwright-mcp/`, `docs/BRAND-DOSSIER.md`,
`docs/brand-assets/`, one PDF under `docs/superpowers/`); none were staged or touched.

## Rosh Hashanah guard (R-0901-vision-8 §1)

`list_books` → `shirei-tshuvah`: **184 pages, tier `feed`.**
Asserted **before** the deploy and **again after** it. Also re-asserted after the second deploy (`1cdd4f7425`, the tool-description fix).

## Not touched

`src/lib/books/**`, chart bonds, setlists, `moments`, the book registry, `reconcile_library`,
`archive_nonchart_artifacts`, and every chart's bytes, mime and collection.

---

## Queue

**FOR DANIEL (decide-by: this sitting):** the dedupe run is the only thing left in this wave.
Authorized and still refused by the session permission gate, four times. Run it from Claude Desktop
(`dedupe_library`, `dryRun: false`, `force: true`) — the plan is verified at 84/85 and the undo
list is written. `Three Little Birds.docx` gets renamed immediately after.

**FOR COWORK (live-cw):** three things want the ledger, none of which `live` may settle —
(a) §3's premise that archived rows carry no bytes is false: **20 of 20 probe healthy**, so the
`heldArchived` guard is correct but not load-bearing for the reason given;
(b) §2's twelfth row is a genuine `.docx` and should not be renamed;
(c) the canonical status rank shipped here is new policy on top of §5 and has no id of its own.

Claude records; Daniel decides.

---

## AMENDMENT 3 (2026-09-02 01:2xZ) — the run executed, and the gate passed

The permission gate cleared and I ran it. **The plan was re-measured immediately before the write**
rather than trusted from earlier in the wave: `dryRun` returned 84 groups / 85 marks /
`coverage.total` 891 — group-for-group identical to the reviewed plan, after all twelve single-row
edits had landed.

`dedupe_library {dryRun: false, force: true}` →
**`groupsFound: 84` · `wouldMark: 85` · `committed: 85` · `songsMirrored: 85`.**
Exactly the reviewed plan, nothing more.

### The post-run gate — passed

`verify_setlist_charts` on all six baselined setlists, unchanged from the pre-run baseline:

| setlist | bonded | ok | missing / unreachable / orphanedMarked / phantomBonds |
|---|---|---|---|
| `fc3164fd…` (Jeff Lash packet) | 24 | 24 | 0 / 0 / 0 / 0 |
| `759ed243…` | 12 | 12 | 0 / 0 / 0 / 0 |
| `BeWLvkBJCuquieRDIYrg` | 11 | 11 | 0 / 0 / 0 / 0 |
| `a84f8cce…` | 14 | 14 | 0 / 0 / 0 / 0 |
| `NWPBba50fltX6pNcyOVK` | 13 | 13 | 0 / 0 / 0 / 0 |
| `Ikl0sS4XcZil0Z04viAu` | 8 | 8 | 0 / 0 / 0 / 0 |

All `ok: true`, `okCount == bondedCount` everywhere. **The 11 bound rows survived the mark**, which
is what the `fileId`-keyed, status-blind byte path predicted.

### The four groups the rank was built for

All four now resolve **VISIBLE and `active`** on the live surface — the archived twin took the
`duplicate` mark and the active row kept the browse:

`Shema (major)` · `Avinu Malkeinu_trad_Choir_Em` · `Oseh shalom (S&P)` · `V_shamru_(trad)`

Under the old canonical rule each of these four groups would now be showing **zero rows**, and three
of the four are Rosh Hashanah repertoire. Browse **752 → 687**. RH guard `shirei-tshuvah`
**184 pages, tier `feed`** asserted before the run and re-asserted after.

`Three Little Birds.docx` → **`Three Little Birds`** landed immediately after the run, as planned;
the collision it manufactures is now a normal dedupe pair for a later wave, not an unreviewed 85th
group in this one.

**Wave 2 is complete.** Nothing in `PLAN-L1-W2-DEDUPE-REVIEW-2026-09-01.md` is left open except the
three items already routed to `live-cw` for a ruling — plus a fourth, below.

---

## NEW FINDING (4th item for `live-cw`) — renamed charts are unfindable by their new name

Not caused by this wave; found while verifying it, and older than it.

**`edit_library_entry` (`editEnrichment`) writes `library_index/{rowId}` and nothing else.** It
never mirrors `title` into `songs/{id}`. But `searchLibrary` builds its result set from
`getAllSongs()` and both **filters and displays on `songs.title`**, joining `library_index` only for
enrichment fields. So the two read surfaces disagree the moment an operator renames anything:

- `list_library` / the in-app `/library` browse → `library_index.name` → **the new name**
- `search_library` → `songs.title` → **the old one**

Measured across the whole census (891 rows, all 23 `human_curated`): **22 of 23 drift.** Six spot
checks, querying by the exact name the browse displays:

| queried by its current name | hits |
|---|---|
| `Kedusha: High Holidays Reform (Nava Tehila)` | **0** |
| `Surrender: Chants (Sykes)` | **0** |
| `Oseh Shalom (Nava Tehila)` | **0** |
| `Adonai S'fatai (trad)` | **0** |
| `Shir Shabbat Packet — Cover & Tune List` | **0** |
| `Shalom Rav` | 4 — **none of them the renamed row** |

This is not cosmetic. Search *filters* on the stale title, so a rename that adds a clarifier the old
title lacked makes the row **unreachable by the only name Daniel can see**. It lands squarely on the
primary authoring surface: Claude Desktop looks charts up with `search_library`.

It also partly undoes this wave's own §5 repair — `Oseh Shalom (Nava Tehila)` was renamed precisely
so the parenthetical could seed `arrangement` for L3, and that name currently returns nothing.

**Not fixed, and deliberately so.** The two repairs (mirror `title` on write, vs. have search prefer
the joined `library_index` name) have different blast radii, and backfilling the 22 drifted rows is
a mass production write of exactly the class this wave just spent a review cycle on. That is a
policy call, and **`live` does not spend a ruling id (rule 1)**. Recommendation, for whatever desk
takes it: fix the **read** side first — it is one join that is already being performed, it needs no
backfill, and it cannot corrupt `songs`.
