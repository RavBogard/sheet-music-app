# ORDER → `live` (Code): make two refusals legible, then bring back a packet a person can decide from

Lane: **live-cw (Opus Cowork)** · Executor: **`live`**, host-side in `~/CentralReform.live` (rule 8 addendum)
Authority: **R-0904-live-cw-9** (the seven pairs; no mark authorized; `bondCount > 0` refuses) ·
**R-0904-live-cw-10** (a guard names the source line; a truncated id is a prefix) · **R-0904-live-cw-7**
(the fuzzy lane may plan, never commit) · **R-0903-live-cw-8** (byte-identical **and unbonded**) ·
**R-0903-live-cw-4** (the push is the only deploy path; a red build never promotes).
Status: **DISPATCHABLE.**
Verified-against: `107b9618d9` [inherited: your 03:1xZ row — promoted 2026-09-04T02:59Z]. **Re-verify by content
before the first edit.** Read the rollback target off `/api/version` **before** the push and name it in the return.
Tier: LIGHT — two refusals whose post-state is "nothing written", and two reads whose contents cannot be
pre-named. No catalog row changes state in this order.

NEXT: N1 → N2 → suite + `tsc` → ONE deploy → G3 and G5 proven by calling them → N3 → N4 → STOP

- [ ] **N1 · `fuzzy_execution_refused` mapped to `400` in `errors.ts`.** Behaviour unchanged; the row is the fix.
- [ ] **N2 · `mark_chart_status` refuses a row with `bondCount > 0`**, own machine code, `409`, names the bonds.
- [ ] **Suite + `tsc --noEmit` clean, then ONE deploy.** A red build never promotes; nothing else rides it.
- [ ] **G3 and G5 proven by CALLING the two refusals**, partition identical across both probes.
- [ ] **N3 · The seven-pair comparison packet** — fourteen rows, read-only, no proposal about which wins.
- [ ] **N4 · Every bond whose target row is not `active`**, plus what Perform mode does with one, cited.
- [ ] **Return** `RETURN-CODE-LIVE-REFUSALS-AND-PAIRS-2026-09-04.md` + a CLOSED board row.

---

## Why this order exists

`MARK-TOOL-AND-TENANT-WALL` closed complete and its one mark survives the sweep — measured, not believed.
Two things it deliberately did not fix, plus one work item this desk had queued for three sittings and has
now **withdrawn after re-measuring it** (`R-0904-live-cw-9`). Nothing here writes to the catalog.

**This order writes NO catalog rows. `dryRun` diagnostics and reads only.** If any track appears to require a
catalog write, that is a defect in this order: **STOP and return it.**

---

## N1 · `fuzzy_execution_refused` is a deliberate refusal presenting as a server fault

You reported it and you were right to report rather than fix it under a one-deploy order.

- The throw is at **`src/lib/mcp/tools/library.ts:1729`** [measured: this desk, grep at `107b9618d9`].
- The map is **`ERROR_CODE_MAP` in `src/lib/mcp/errors.ts`** (entries ~`:75`–`:128`), and the default is
  **`src/lib/mcp/errors.ts:147` — `ERROR_CODE_MAP[machine_code] ?? 500`**; the file's own comment at `:139`
  names adding a row as the migration path [measured: same read].

**Add the row. `fuzzy_execution_refused: 400.`** It is a refused *argument combination* — the caller asked
for something the tool will never do — not an authorization failure (`403` reads as "get permission", and
there is no permission that grants this) and not a conflict. The file's `:56` comment says exactly why this
matters: an LLM caller reads `500` as *transient, retry*, and this refusal must never read as retryable.

**Do not touch the refusal's behaviour.** Nothing about what it refuses, or the text it carries, changes.

## N2 · `mark_chart_status` must refuse a bonded row

`R-0903-live-cw-8` has always required **byte-identical AND unbonded**. The unbonded half lives in a ledger
and **nothing enforces it**: `src/lib/mcp/tools/mark-chart-status.ts` reads no bond count at any line
[measured: this desk, grep at `107b9618d9` — zero `bond` occurrences in that file]. `R-0904-live-cw-7`'s
rule applies unchanged: **the refusal goes in the tool.**

- Refuse when the target row's bond count is `> 0`, with its own machine code — suggested
  `mark_refused_row_is_bonded` — **mapped in `errors.ts` in the same commit as N1**, `409` (this one *is* a
  conflict: the row is in use).
- **The error names the bonds** — how many, and the setlist ids if they are already in hand. A refusal that
  does not say what is holding the row makes the operator guess.
- The bond count already exists on the library projection (`src/lib/mcp/tools/library.ts:160`, `:172`,
  `:1261`) [measured: same read]. **Cite the line you actually read it from in your return** — if the count
  is not reachable from this tool without a second query, say so and say what the query costs; do not
  reconstruct it.
- **`toStatus: "active"` is not refused by this** — un-marking a bonded row is a repair, not a hiding.

**N1 and N2 are one commit or two, your call — but independently revertible, as the last order's three were.**

## N3 · The comparison packet — a READ, and the reason the sweep is not doing this

`R-0904-live-cw-9` withdrew this desk's "six transliteration duplicates" list: it is **seven**, **not one
pair is byte-identical**, and **two of them would have hidden a bonded row**. Whether two files are the same
chart is a musical question about two documents. **Daniel decides each pair, or declines to.** Your job is
to make deciding cheap.

For each of these fourteen rows: **how many pages the PDF has, first-page extracted text (~200 chars is plenty), byte size,
mimeType, `status`, `bondCount`, and the ids of any setlists bound to it.** No writes, no marks, no
proposals about which should win.

| keep-side (as the pass ranks it) | other side |
|---|---|
| `1Mqje155L1D2TpfeoLycAL_pxEs04epFw` `Veshamru.pdf` (9 bonds) | `1WusU1xlwOKQvKu2kemrowh6oZ16S9UeR` `V'Shamru.pdf` |
| `1OUhfx4EW3ZAtuh-ZPnHxTF4-wGOJdBFy` `Ana B_Koach.pdf` | `1YuN6XyS2oLDWE-6F7JztRAtBz7K_lTBL` `Ana B'koach.pdf` |
| `1W3mVu5MmsLklXhhh6WpQe5KrCr71Z6iJ` `Shalom alechem (Goldfarb).pdf` (3 bonds) | `25df4be7-0a5d-4a8d-bf7b-64d2d03f67e5` `Shalom Aleichem (Goldfarb).pdf` (**2 bonds**) |
| `upload-49a7db3a-21aa-4c6c-8f1e-b3d6bd02cad1` `Hod VeHadar (Daphna Rosenberg)` | `upload-9539ae5d-c185-41a8-b852-b82319f2d944` `Hod V'Hadar (Daphna Rosenberg)` |
| `upload-5c020858-3c15-4aaa-a3b6-d2273e5d9893` `Shiviti (Rosenberg)` | `upload-e3f9ef79-e77e-4746-9968-412fb08a0002` `Shivti (Rosenberg)` |
| `17YFbGz0YNvC1o-K1VKRrqgZGae-WMsbg` `Michamocha (Shir Shabbat) .mp3` | `10i20SEfzKTvGJ5tqWfPScip78eXszCHH` `Michamocha (Shir Shabbat).mp3` |
| `1YkIEE4lx2Vp3U2nQA2M8nIKCBgFoylhf` `Lecha dodi (Lincoln_s niggun).pdf` | `1CKCIpT3q8q4257D2i6klXsRl8GFWpJee` `Lecha Dodi Lincoln_s Nigun.pdf` (**`archived`, 2 bonds**) |

Every id above is written **in full and was read from the collection, not truncated** — `R-0904-live-cw-10`
§2. If any one of them 404s, that is a finding: **STOP that row, report it, continue the others.**

The two `.mp3` rows have no pages: give duration and bitrate if they are free, and say so if they are not.

## N4 · Every bond whose target row is not `active` — a READ

Found while measuring N3's table: `Lecha Dodi Lincoln_s Nigun` is **already `archived` and carries two
bonds**. An archived row is hidden from browse; what a bound setlist does with one in Perform mode is
unknown to this desk and was never asked.

**Report, catalog-wide: every bond whose target row's status is not `active`** — the setlist, the track, the
row, the status. Then say, from the code and not from inference, **what Perform mode does with such a bond**,
citing the line. If the answer is that the band gets a dead chart on a Friday, that outcome is worth knowing
before it is discovered in a sanctuary. **No repair in this order** — report it and stop.

---

## Guards

Each names the property it protects and, where it asserts behaviour, the line it was written against
(`R-0904-live-cw-10` §3). **If a guard's letter and the deployed code disagree, the code wins and you
report both halves — do not bend the run to the letter.**

| | guard | how |
|---|---|---|
| **G1** | Rosh Hashanah still reads `184` / `feed` | before N1 and after N4 |
| **G2** | **zero catalog writes across this entire order** | partition (`active`/`duplicate`/`archived`) identical at open and close; `library_index` total identical; state it as the delta, not as an absolute stop (`R-0903-live-cw-10`) |
| **G3** | N1's refusal still refuses, and now says so legibly | call `dedupe_library {forceScore: 0.85, force: true, dryRun: false}`: `fuzzy_execution_refused`, **`code: 400`**, partition identical across the probe, nothing written |
| **G4** | the diagnostic is intact | `{forceScore: 0.85, dryRun: true}` still returns **13 groups / 16 marks / `formatClassRefusals: 14`** [measured: this desk, 03:5xZ, at `107b9618d9`]. A change here is a finding, not a failure — report the new numbers |
| **G5** | N2's refusal proven **by calling it**, not by reading it | `mark_chart_status` against `25df4be7-0a5d-4a8d-bf7b-64d2d03f67e5` (`Shalom Aleichem (Goldfarb)`, 2 bonds) → refused, `409`, **the row's status unchanged**, re-read after the call. This is the one deliberate call at a real bonded row and it must write nothing |
| **G6** | Daniel's mark is undisturbed | `1VuMq83_0W8ya9SCeBaQ0vCvuFeHgGHeC` still `duplicate`, its run record still present with `decidedBy: "human"`, at open and close |
| **G7** | rollback named before the push | read off `/api/version`, in the return |
| **G8** | the suite | full emulator suite + `tsc --noEmit`, both clean before the push; a red build never promotes |

**One deploy. If the build is red, nothing promotes and you return it as it stands.**

## What is NOT in this order

The 38 unreachable-byte rows (standing, unowned). The byte-reachability oracle in `get_chart_status`
(unchanged and unwidened, deliberately). `moments.json` and L3 binding. **Any mark on any of the seven
pairs — no mark is authorized on any of them by anyone until Daniel has ruled on the packet
(`R-0904-live-cw-9` §4).**

*Claude records; Daniel decides.*
