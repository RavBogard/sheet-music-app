# PROGRAM · SATELLITE HEALTH — the staged sequence Daniel approved, 2026-09-04

Lane: **live-cw (Opus Cowork)**, the centralreform.live desk · Owner: **live-cw**; executor: **live (Code)**, host-side
in `~/CentralReform.live` (rule 8 addendum).
**AMENDED (3) 2026-09-04 19:2xZ by live-cw** — wave 2b's order was dispatchable and read as blocked; wave 8's ID-token
lag recorded. **AMENDED (1) 2026-09-04 16:4xZ by live-cw** — wave **2b** inserted (the gate's flake), wave 2 marked returned, and
wave 3's position corrected to the truth on the ground. See *Amendment (1)* at the foot.
Authority: **R-0904-live-cw-24** (this program; Daniel's *"approved"*) · **R-0904-live-cw-30/-31/-32/-33** (the gate is
ON and STAYS on at Daniel's *"leave it on"*; the flake is fixed not excluded; the removal criterion re-cut) · **R-0904-live-cw-23** (the gate, adopted on
his *"whatever you recommend"*) · **R-0904-live-cw-25/-26** (the seven pairs and the near-pair naming rule, on his
*"default"* and his standing sentence) · **R-0904-live-cw-21** (the gate's shape) · **-15** (the 16 bonded non-active
rows are owned here) · **-22** (the error-code class) · **R-0903-live-cw-4** (the push is the only deploy path) ·
COORDINATION rules 4, 11, 18, 19.

**This is a program, not an order.** It carries no `NEXT:` for an executor and nothing here is dispatchable. Each wave
below ships as its own `HANDOFF-CODE-LIVE-*.md` with its own single `NEXT:` line and its own
`RETURN-CODE-LIVE-*.md` — **one order, one return, one board row per wave** (rule 18: the body of a doc is context,
never a second sequence).

---

## THE BOUNDARY RULE — the one sentence the whole program is arranged around

> **Nothing the band sees on a Friday night is touched until the gate is on.**

Daniel's condition on approving this, and it is a *sequencing* rule, not a taste. Until a required check exists,
nothing stands between a bad edit and the iPads on the bimah: `R-0904-live-cw-21` measured **no branch protection on
`master` at all**, and `live` watched a commit promote while its own CI run was still `in_progress`
[inherited: `-21`, B3]. So the order of the waves is not "cheapest first" — it is **build the net, then work over it.**

**What counts as "what the band sees on a Friday night", for this program:** a chart's **title** in the library or on a
setlist; whether a row is **visible** in browse/search; whether a bonded chart **opens** in Perform mode; any deploy of
`sheet-music-app`. **What does not:** test files, CI configuration, a read of the catalog, a return doc, an error code's
HTTP status on an authoring tool Daniel drives from Claude Desktop (wave 4 is a caller-facing correction, not a
band-facing one) — but the *deploy that carries it* does, so wave 4's deploy obeys the same gate as any other.

---

## THE SEQUENCE

| wave | what | order | touches what the band sees? |
|---|---|---|---|
| **1** | **tests green** — the red baseline repaired | `HANDOFF-CODE-LIVE-GREEN-REPAIR-2026-09-04.md` — **RUN AND RETURNED** (19 → 3, three red on purpose) [inherited: `RETURN-CODE-LIVE-GREEN-REPAIR-2026-09-04.md`, `live` 15:0xZ] | no — test files, plus two `data-testid` attributes |
| **1b** | **the repair reaches `origin/master` and CI is observed on that exact SHA** — folded into wave 2's order as its precondition, because the commit is on `master` locally and **not pushed** [inherited: same return, §Git] | `HANDOFF-CODE-LIVE-PROMOTION-GATE-2026-09-04.md` P0 | the push is a promotion (`R-0903-live-cw-4`) of a test-only diff |
| **2** | **the gate on** — `Build Check` + a gated unit suite, the exclusion list installed at the seven named red files and **remove-only** | `HANDOFF-CODE-LIVE-PROMOTION-GATE-2026-09-04.md` (**CLOSED**) | no — a workflow file and a repo setting |
| **2b** | **the gate's flake repaired** — `pdf-viewer.test.tsx` asserts a MOMENT, not a state; the same edit stops its own guard passing vacuously. **Daniel declined excluding it** (`-30`) | `HANDOFF-CODE-LIVE-FLAKE-REPAIR-2026-09-04.md` — **RUN AND RETURNED** at `5430972c66` [inherited: `RETURN-CODE-LIVE-FLAKE-REPAIR-2026-09-04.md`, `live` 19:4xZ] | no — one test file, no production byte |
| **3** | **the seven pairs' names** — keep all seven, each name carries a **measured** distinguisher; pair 7's archived side un-hidden | `HANDOFF-CODE-LIVE-PAIR-NAMES-2026-09-04.md` (**LIGHT** — **IN FLIGHT**, claimed 16:3xZ) | **YES** — titles and one row's visibility. First wave over the net, deliberately |
| **4** | **the error-code class** — 100 of 141 machine codes answer `500`; one family map, not a hundred rows | not yet authored (`-22` §1 has the families) | no, but its deploy does |
| **5** | **the 38 unreachable-byte rows** — re-derived per row, never carried forward as a premise | not yet authored (`-9`/desk `NEXT`; ~892 one-id-per-call probes, an executor wave) | reads only, unless a row turns out to be dead |
| **6** | **the 16 bonded non-active rows as a counted packet** — `-15` §4; the question *what does the band get on a Friday when a setlist is bound to a hidden row* | not yet authored | reads only; any remedy is its own wave |

**Wave 3 sits where it does on purpose, and this is the one place the program reorders what was staged to Daniel.**
It was staged fifth-ish, behind the error-code class and the two census waves. It is now **immediately after the gate**
for two reasons: it is the only wave that touches what the band sees, so it is the wave the gate was built for — running
it first is the honest exercise of the net rather than a wave chosen because it is safe; and it carries Daniel's live
decision, so it should run while the pairs are still in his head. Waves 4, 5 and 6 keep their relative order exactly.

---

## WHAT EVERY WAVE'S RETURN MUST SHOW

Not a house style — these are the four places this desk has been burned in the last two days, and each is a ruling.

1. **The suite's own two lines, verbatim, with their labels, before and after** (`-16` §3). `7 failed | 342 passed | 6
   skipped (355)` is the **Test Files** line; `19 failed | 3990 passed | 78 skipped (4087)` is the **Tests** line. No
   arithmetic across the two. A count without its label has cost this program a whole wave once.
2. **Every guard's denominator, and evidence it can fail** (`R-0903-live-cw-9`/`-11`). A guard that could only pass
   vacuously is retired or **made to fire** — with the failure output quoted from a run that was thrown away.
3. **Every cited line re-measured at the HEAD the wave actually ran at** (`-12` §3), and any line that moved reported
   rather than silently followed. This desk's own first probe in the GREEN-REPAIR sitting read a key that does not
   exist (`folio`, not `folios`); the correction lives in `-20` because it was not quietly fixed.
4. **Named tool, named undo, before the act** (`R-0904-live-cw-2` §4) — and for anything irreversible, the record
   replicated first (`-8`). A finding is reported even when it contradicts the order: wave 1's return did exactly that
   twice (both class-2 catchers, and R2's STOP clause), and both corrections are now rulings.

**And the standing constraint on this whole program:** this desk cannot run the satellite suite from the Cowork mount
(`npx vitest run` dies before collection on `@rollup/rollup-linux-x64-gnu`), so **no order in this program states a
suite number as an expectation.** Numbers are the executor's to produce; the orders state properties.

*Recorded by live-cw. Daniel decides.*

---

## Amendment (1) — 2026-09-04 16:4xZ, live-cw · a new wave 2b, and an honest note about ordering

**Wave 2 is RETURNED.** The gate is on at `master` `c642fb185a`, both required checks read back from the API, and its
undo is one call [inherited: `RETURN-CODE-LIVE-PROMOTION-GATE-2026-09-04.md`; `live`'s 16:0x/16:1xZ rows].

**Wave 2b exists because the net has a hole in it that is not a bad change.** The required check goes red in roughly one
CI sample in four at an unchanged SHA, on one test that asserts a moment rather than a state (`R-0904-live-cw-33`). Daniel
was offered three ways out — leave it on, delete the protection, or write the file onto the debt list — and **chose to
leave it on** (`R-0904-live-cw-30`), which means the flake is repaired rather than hidden. **Every later wave pays that
tax until it is, and a required check that is routinely wrong is one people learn to disregard.** So 2b sits ahead of
everything except what is already running.

**AND THE ORDERING CORRECTION, stated rather than smoothed over.** 2b was ruled to sit ahead of wave 3 — but wave 3 was
**already claimed and in flight** when the ruling was written (`live` opened at 16:3xZ with PAIR-NAMES as wave 1 of a
fresh terminal life). **A wave in flight is not recalled by a reordering.** PAIR-NAMES finishes and returns; FLAKE-REPAIR
is `live`'s **wave 2** of that same life. The table above therefore reads 2b before 3 as the program's law, while the
clock reads 3 before 2b — and both statements are true. Recorded this way because a program that quietly renumbers
itself to match what happened is a program that can never be wrong.

**`-32` also lands on this program's shape, and it is a standing constraint on every later wave:** while
`ci/gated-suite-exclusions.txt` has a line in it, the unrequired `Unit & Integration Tests` job is the **only** instrument
that can produce removal evidence. **It is not deleted, not renamed, and not made required until the list is empty.**

*Recorded by live-cw. Daniel decides.*

---

## Amendment (2) — 2026-09-04 17:3xZ, live-cw · wave 3 returned; wave 6 is VOID and must be re-taken; two new waves, one of which is not ours to run

**Wave 3 (PAIR-NAMES) is RETURNED and shipped** — 12 of 14 rows renamed, pair 1 held on a measured key conflict, one
archived row un-hidden; nothing irreversible [inherited: `RETURN-CODE-LIVE-PAIR-NAMES-2026-09-04.md`, `live` 16:4xZ].
Its three closing questions are now minted: `R-0904-live-cw-34` (`status` ownership), `-35` (pair 3b keeps both),
`-36`/`-37` (Karen's elevation, authorised and located).

**WAVE 6 IS VOID AS MEASURED, AND THIS IS THE program's most consequential correction to date.** `-15`'s sixteen bonded
non-active rows were counted through `search_library`, **and that instrument cannot see an archived row as archived** —
G-15 presents a `songs` doc with no `status` as `active` and the filter passes it (`-34` §1(b)). The census did not
measure what it reported. **Wave 6 is re-taken through `list_library` before any remedy is designed**, and its return
names its instrument (`-34` §4). Nothing about the sixteen rows is assumed to have survived the correction.

**NEW — wave 7: the `searchLibrary()` status join.** `-34` §2 rules the direction: `searchLibrary()` joins
`library_index.status` rather than the archive paths learning to mirror, so the divergence class becomes
unrepresentable instead of merely emptier. Not yet authored, not urgent — the one visible divergent row (`Tu Bishvat`)
has zero bonds and is deliberately left as found (`-34` §3), because repairing it through the mirror would hide the
mechanism. **It sits behind 2b.**

**NEW — wave 8: Karen's elevation, and it is the first item in this program that this desk cannot order anybody to
do.** `POST /api/admin/set-role` takes a Firebase ID token for a signed-in admin and refuses the `crl_live_…` MCP
bearer in its own error text; no MCP tool writes a role at all (`-37` §1–§2). **So the act is Daniel's three clicks on
the People screen, and `live`'s share is `HANDOFF-CODE-LIVE-ROLE-VERIFY-2026-09-04.md` — LIGHT, `order_lint` OK, NOT
YET DISPATCHABLE, no write of any kind, and its V0 ends the wave if the role still reads `musician`.**

**Ordering, plainly: `live`'s wave 2 is FLAKE-REPAIR and nothing displaces it.** ROLE-VERIFY is two reads and waits on
a human; wave 6's re-take and wave 7 are unauthored. The boundary rule is unchanged and none of these three cross it.

---

## Amendment (3) — 2026-09-04 19:2xZ, live-cw · wave 2b was never blocked, and the program's own order said it was; plus the one sentence wave 8 still owes anybody who asks

**WAVE 2b (FLAKE-REPAIR) STOOD DISPATCHABLE FOR THREE HOURS WHILE `live` STOOD IDLE, AND THE FAULT IS IN THIS DESK'S
ORDER, NOT ON THE BOARD (`R-0904-live-cw-38`).** `HANDOFF-CODE-LIVE-FLAKE-REPAIR-2026-09-04.md` has no return and
`order_lint` has read it dispatchable since 16:4xZ. Its Status line, however, said *"it is `live`'s WAVE 2, not wave 1 —
finish PAIR-NAMES first"*. **PAIR-NAMES was finished and its terminal life retired on purpose at 18:0xZ**, so the fresh
life that opened at 18:2xZ met a precondition expressed as a coordinate in a wave sequence it was not in, and stood
reporting *"FOUR WAVES UNSPENT, NOTHING DISPATCHABLE"* [inherited: `live`'s 18:0xZ and 18:2xZ CLOSED rows].

**THREE STANDING CORRECTIONS FOR EVERY WAVE OF THIS PROGRAM FROM HERE, because Amendment (1) is where this defect was
born** — it is the amendment that wrote the ordering *"2b is `live`'s wave 2 of that same life"* into the program's law,
which was true when written and became a trap the moment the life ended:

1. **A precondition in an order is an OBSERVABLE FACT, never a wave ordinal.** *"Do not start until
   `RETURN-CODE-LIVE-X.md` exists"* is checkable by a fresh executor with no memory; *"this is your wave 2"* is not.
   The wave numbers in the table above are a **reading**; they are not gates and no order restates them as gates.
2. **The dispatch test is the UNRETURNED-ORDER SET, not the newest file.** `live` reported *"the newest
   `HANDOFF-CODE-LIVE-*` at the root is still ROLE-VERIFY, already returned"* — true by mtime (ROLE-VERIFY `17:39`,
   FLAKE-REPAIR `16:43`) and useless as a test, because the wave still owed is the OLDER file [measured: `ls -lt` at
   the Cowork mount, 19:2xZ]. One order, one return, one row is this program's own rule; **the missing return is the
   index.**
3. **A queue line is an event a row consumes, not a standing state.** This desk's 17:4xZ `FOR live:` line named
   FLAKE-REPAIR; `live`'s 18:0xZ row consumed it, and `dispatch.py` then showed the next life no pending line at all.
   **An order still owed after the row that consumed its line is RE-QUEUED**, or it is invisible to both the board and
   `wait_for_board.py`, which wakes on a new line.

**And `R-0904-live-cw-39`, in the same order:** four of its cited line numbers were off by one against bytes that never
moved — an authoring mis-count, which `-12` §3's *re-measure at your own HEAD* cannot catch, because re-measuring an
unchanged file reproduces the same number. **F4's was the costly one:** `:531` is a comment line, so the throwaway edit
would have left the ternary intact and F4 would have read *"the negative is still vacuous"* when it was not. Corrected
in place, and **every citation in that order now names the TEXT its line contains**, which is the form this program
uses from here.

**WAVE 8 (Karen's elevation) IS COMPLETE, AND IT OWES ONE SENTENCE (`R-0904-live-cw-40`).** ROLE-VERIFY returned: the
`users` doc reads `role: "admin"`, the Auth custom claim reads `{"role":"admin","orgIds":[…]}` — so `claimsUpdated` was
TRUE and `-37` §6's feared failure did not occur — and a PITR read at `18:00:00Z` proved exactly two fields moved,
membership intact [inherited: `RETURN-CODE-LIVE-ROLE-VERIFY-2026-09-04.md`; `live`'s 18:0xZ row]. **But a custom claim
reaches a session only through a FRESH ID TOKEN, and Karen's `lastRefreshAt` predates the change.** So **MCP tools work
for her now** (they read the doc) while **Firestore rules and the in-app UI wait for her token to refresh** —
`repairDrift()` self-heals on next load, a sign-out and sign-in is instant. **Recorded here because *"you made me an
admin and the app won't let me in"* is the exact shape of a working write being needlessly re-done.** No lane mints or
uses anyone's ID token to hurry it: the remedy is a human touching their own session.

**AND `-37` §5 STAYS OPEN.** The predicted false audit record did not fire for Karen because her claims carried a
`role`. **One non-firing is not a fix** — nobody closes it on ROLE-VERIFY's evidence.

*Recorded by live-cw. Daniel decides.*


## Amendment (4) — 2026-09-04 20:4xZ, live-cw · wave 2b is CLOSED, and F4's finding is minted as its own shape

**WAVE 2b (FLAKE-REPAIR) SHIPPED at `5430972c66` — both required checks (`Build Check`, `Gated Unit Suite`) are green
on that sha; the exclusion list stays at two files** [inherited: `RETURN-CODE-LIVE-FLAKE-REPAIR-2026-09-04.md`, `live`
19:4xZ]. F1 reproduced the flake deterministically (red at `:121:23` under a forced macrotask gap); F2/F3 repaired it
and proved the fix both directions with the same instrument; F5 landed as the sole surviving diff and the gate was
READ, never attempted (`-31`).

**F4 found that the order's own edit site could turn the test red without firing the guard it names** — dropping the
`width > 0` arm at `:532` fails the WAIT (`Measuring…` never renders, because that text lives in the discarded arm),
never the `page-1` negative the step exists to prove. F4b's co-presence probe (both arms' effects on screen at once)
is what actually broke the assertion. **Minted as `R-0904-live-cw-41`** — an order that names an edit site can specify
a red test without specifying a fired guard, and the remedy is a named probe shape (co-presence), not a bigger edit
site.

**Program state: waves 1/1b/2/2b/3 are shipped and returned; 4/5/6/7's carrying wave are queued as authoring/measuring
work (desk `NEXT`); wave 8 (Karen's elevation) is done save the ID-token lag, tracked at `-37` §5, open.** Nothing in
this amendment changes THE SEQUENCE table's ordering or any other wave's order.

---

## Amendment (5) — 2026-09-05 21:5xZ, live-cw · wave 7 returned and gained a 7b; the ungated reds become wave 9, with a denominator

**Wave 7 (`-34`'s join) is RUN AND RETURNED at `c581a201ff`** [inherited: `RETURN-CODE-LIVE-STATUS-JOIN-2026-09-05.md`
and `live`'s 2026-09-05 21:3xZ row] — the gate reads `library_index.status`, the negative failed first on unmodified
source, the delta on the gated suite is exactly the wave's own twelve cases, and no line reached
`ci/gated-suite-exclusions.txt`. **The join is in code and NOT deployed; no deploy was ordered and none is.**

**NEW — wave 7b: the WIRE.** Wave 7 made the gate authoritative and left the response reporting the mirror, and the
state that makes it urgent is the one wave 7 itself created: the reverse-divergence row (`library_index` `active`,
`songs` `archived`) is now correctly SHOWN and arrives saying `"status":"archived"`. Ruled at `R-0905-live-cw-1`;
ordered as `HANDOFF-CODE-LIVE-WIRE-AND-MIRROR-GUARD-2026-09-05.md` (LIGHT, `order_lint` OK, dispatchable), which also
carries the `sync-engine-songs-mirror` re-cut ruled at `R-0905-live-cw-3`. **7b ships in code and reaches production
with whatever deploy carries wave 7 — the two are one behaviour and must not land a wave apart.**

**NEW — wave 9: the UNGATED REDS, and it is a debt with a denominator rather than a mood.** Three non-required checks
have been red on `master` across at least three consecutive shas, none of them any wave's doing: `Lint & Type Check`
(fourteen ESLint errors), `Unit & Integration Tests` (three failures — two are the `registry.test.ts` folio pair,
routed elsewhere at `-27` §4; the third is the mirror guard 7b re-cuts), and `E2E Smoke` [inherited: `live`'s
21:3xZ and 21:4xZ rows, the same check read on `5430972c66` and `c642fb185a`]. Ruled at `R-0905-live-cw-2`: a desk
may not report "the gate is unblocked" without naming which gate, the class is kept distinct from the exclusions
debt and from the folio debt, and **the fourteen lint errors are enumerated and triaged by the wave that repairs
them — this desk does not order a bulk fix it has not measured.** Wave 9 is not yet authored and blocks nothing.

**Ordering unchanged otherwise.** 7b is next because it is one file and its subject was created by the wave before
it; then 4, then 5, then 6, then 9. **No wave may quiet a red by adding a line to `ci/gated-suite-exclusions.txt`
(`-30` §3(c), absolute) — the debt stays at TWO.**
