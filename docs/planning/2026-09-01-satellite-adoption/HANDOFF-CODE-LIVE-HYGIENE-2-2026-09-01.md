# ORDER → Code: `L1` wave 2 — rank the canonical pick, then run the dedupe

Lane: **live (Code)**, host-side · From: **live-cw (Opus Cowork)**
Executor: **live (Code)**, in `~/CentralReform.live/sheet-music-app`, git host-side (rule 8 addendum)
Status: **DISPATCHABLE**
Tier: CLOSED — edits `src/**`, deploys, and then writes to the library.
Verified-against: `ca7fca91ce` [inherited: `RETURN-CODE-LIVE-HYGIENE-1-2026-09-01.md`, the wave-1b
sha]. **Confirm host-side at open.**

Authority: **R-0901-live-cw-3** (all five clauses) · R-0901-live-cw-2 §2 · §5 · R-0901-live-cw-1 §3
· R-0901-vision-8 §1 · R-0831-guards-2
Plan under review: `PLAN-L1-W2-DEDUPE-REVIEW-2026-09-01.md` (this root).

---

## Read this before the waves: the write in V3 does not come back

R-0901-live-cw-3 §1 rules it as standing fact and this order states its reversal path, as that
clause now requires. `dedupe_library` writes `status: "duplicate"` into `library_index` and mirrors
it into `songs/{id}`. **No MCP tool writes it back.** `edit_library_entry` cannot set `status`;
`reconcile_library` skips duplicate rows; the only documented route to `active` is
**`salvage_chart_bytes`**, which re-uploads bytes onto the same fileId and preserves every bond —
a heal, not an undo. **Reversal for any row marked in V3 is: re-upload that chart through
`salvage_chart_bytes`.** Plan on that, not on a rollback.

**What is NOT at risk, measured so it is not re-litigated at the gate.** This desk **observed**
that 12 of the 85 planned rows are bonded to live setlist tracks, that no consumer in the Perform
or gig-packet path filters on `status`, and that **3 rows carry `duplicate` today and are still
bonded to live setlists with nothing broken** — all read at HEAD `ca7fca91ce` on
2026-09-01T23:5xZ. The mark governs discovery, not rendering.

---

## V1 — the canonical pick ranks status above age (R-0901-live-cw-3 §3)

`pickCanonical` sorts by earliest `uploadedAt` and ignores `status`. Put status first: an `active`
row outranks an `archived` one; `uploadedAt` decides only **within** a status. One comparison
ahead of the existing sort. Nothing else about grouping changes.

**Why now.** This desk **observed** 4 groups in the live plan where an archived row is canonical
over an active one, at HEAD `ca7fca91ce`, 2026-09-01T23:4xZ:

| kept (archived) | dropped (active) |
|---|---|
| `Shema (major).pdf` — 2025-05-06 | `Shema (major).pdf` — 2025-07-08 |
| `Avinu Malkeinu_trad_Choir_Em.pdf` — 2025-08-11 | `Avinu Malkeinu_trad_Choir_Em.pdf` — 2025-08-11 |
| `Oseh shalom (S&P).pdf` — 2025-05-06 | `Oseh shalom (S&P).pdf` — 2025-07-08 |
| `V_shamru_(trad).pdf` — 2025-07-08 | `V_shamru_(trad).pdf` — 2025-07-19 |

Two of those four are the most-bonded charts in the whole plan — `Shema (major)` sits on 12
services and `V_shamru_(trad)` on 9, **observed** by walking all 75 setlists on the live MCP at the
same sha and time.

**Show the fail branch (R-0831-guards-2).** A test that the pre-change picker returns the archived
row as canonical on each of those four real pairs and the shipped one returns the active row. Take
the pairs from the table above, not from invented fixtures — the wave-1 test file is the pattern.

## V2 — deploy, re-plan, and verify before anything is written

Deploy V1, then re-run `dedupe_library({dryRun: true})` and check three things:

1. **The 4 groups above flipped** — active row canonical in each.
2. **The mark count did not move.** This desk **observed** 84 groups / 85 marks at HEAD
   `ca7fca91ce`, 2026-09-01T23:4xZ. A rank change reorders within groups; it must not create,
   merge or dissolve any. A different count is a stop, not a surprise to write up afterwards.
3. **Nothing outside this catalog.** This desk **observed** 0 of the 169 fileIds in that plan
   falling outside the 891-row census, and 0 audio rows anywhere in it, at the same sha and time.
   Both must still hold.

**Assert the identity, not the number** (field note 12) for anything that moves with Daniel's
uploads: the browse total and the hygiene total must AGREE, whatever they are.

## V3 — the run

`dedupe_library({dryRun: false, force: true})`. Then re-read the browse and confirm the marked
rows left it and the canonical rows stayed.

**Stop before writing** if V2's three checks did not all pass, or if the plan's group count moved
at all. This is the one-way step; there is no version of "run it and see".

## V4 — two titles, repaired in the same wave (R-0901-live-cw-2 §5)

The canonical pick keeps the worse-formed title in exactly two groups. After V3, by
`edit_library_entry` (operator edit, reversible):

- `Shalom_rav` → `Shalom Rav`
- `Oseh shalom - Nava tehila.pdf` → `Oseh Shalom (Nava Tehila)`

The second is not cosmetic: the parenthetical clarifier is what R-0901-live-cw-1 §1 seeds the
`arrangement` field from, so the surviving row is currently the one `L3` can read least.

## V5 — the twelve renames (R-0901-live-cw-2 §2)

Drop the trailing `.doc` / `.docx` from the eleven `uploads` rows whose bytes you read in wave 1,
plus the twelfth you surfaced (`L'chai olamim English English.docx`). **`mimeType` is not
touched** — it was never wrong; this desk's wave-1 order was. Nothing is deleted, moved between
collections, or re-uploaded. Confirm this step separately from V3; it is a different kind of write.

---

## Guards

**Rosh Hashanah (R-0901-vision-8 §1), asserted AFTER the deploy and quoted in the return.**
`list_books` must still serve `shirei-tshuvah` at 184 pages, tier `feed`. This desk **observed**
that value on the live surface at HEAD `ca7fca91ce`, 2026-09-01T23:4xZ, before writing this order.

**`src/lib/books/**` is not touched by this wave.** Neither are bonds, setlists, `moments`, or any
other repo.

Checks the executor runs and records — **no observed value is supplied here, deliberately; they
are yours to execute and transcribe:**

```text
git log --oneline -1                              # confirm the Verified-against sha
npx tsc --noEmit
SKIP_ENV_VALIDATION=1 npx next build --webpack
```

## Checklist

- [ ] Verified-against sha confirmed host-side; family row opened under `live` with claims
- [ ] V1 rank change + fail-branch test on the four real pairs
- [ ] Build gate green; deployed
- [ ] V2 all three checks pass — 4 groups flipped, count still 84/85, nothing out of catalog
- [ ] V3 run executed; browse re-read and reconciled against the plan
- [ ] V4 two titles repaired
- [ ] V5 twelve names shortened; no mime touched
- [ ] **RH guard re-asserted after the deploy and quoted in the return**
- [ ] `RETURN-CODE-LIVE-HYGIENE-2-*.md` at this root; `Lane: live (Code)` on every commit (rule 13)

## Stop conditions

Stop and return, do not decide, if: V2's count moves off 84/85; any row outside this catalog
appears in the plan; an audio row appears anywhere in it; the rank change turns out to need more
than a comparison; or a ruling looks needed. **`live` never spends a ruling id (rule 1).**

And one that is new, because §1 is new: **if any step wants to write a status that no tool can
write back, and this order did not name that write, stop.**

Claude records; Daniel decides.
