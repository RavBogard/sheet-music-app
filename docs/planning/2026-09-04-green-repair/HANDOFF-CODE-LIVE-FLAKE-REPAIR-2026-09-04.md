# ORDER → `live` (Code): make the width-0 test assert a STATE instead of a MOMENT — the gate's only blocker, and the same edit that stops its guard passing vacuously

Lane: **live-cw (Opus Cowork)** · Executor: **`live`**, host-side in `~/CentralReform.live` (rule 8 addendum)
Authority: **R-0904-live-cw-33** (this order; the mechanism, the shape of the repair, and its place in the program) ·
**R-0904-live-cw-30** (Daniel's *"leave it on"* — the flake is **FIXED, not excluded**; the exclusion list stays at TWO) ·
**R-0904-live-cw-31** (a gate is observed by READING its state; no lane merges past `BLOCKED`) ·
**R-0903-live-cw-9** / **R-0903-live-cw-11** (a guard that can only pass vacuously is retired or MADE to fire; every
guard reports its denominator) · **R-0904-live-cw-19** (a re-derived expectation keeps one invariant that could still
FAIL, and re-checks the setup still REACHES the branch) · **R-0904-live-cw-12** §3 (every cited line re-measured at the
HEAD the wave runs at) · **R-0904-live-cw-2** §4 (tool and undo named before the act) · **R-0904-live-cw-24** (SATELLITE
HEALTH; this is the wave that now sits next) · COORDINATION rules 11, 18.
Status: **DISPATCHABLE, UNCONDITIONALLY — start this now.** **Amended (1) 19:2xZ under `R-0904-live-cw-38`/`-39`; see the
foot.** Its one precondition is SATISFIED and is stated as a fact you can check by looking rather than as a wave
ordinal: `RETURN-CODE-LIVE-PAIR-NAMES-2026-09-04.md` EXISTS at this root, so the wave that once sat ahead of this one is
returned and its terminal life retired on purpose at 18:0xZ. **The superseded line said *"it is `live`'s WAVE 2, not
wave 1 — finish PAIR-NAMES first"*; that is a coordinate in a terminal life that no longer exists, and it read as a
block to the fresh life that met it (`-38` §2). It binds nothing.** **And the dispatch test is the UNRETURNED-ORDER
set, never the newest file: this order is older by mtime than ROLE-VERIFY and has no return, which is what makes it
yours (`-38` §4).**
Verified-against: `c642fb185a` [inherited: `live`'s 16:1xZ row — `master`, both required checks green; `live`'s 18:2xZ
row reports `master` still byte-identical at that sha]. **Every line number below was RE-MEASURED at the Cowork mount at
19:2xZ and FOUR OF THEM WERE WRONG BY ONE — corrected in place, and each citation now names the TEXT the line contains
so you can confirm or correct it with one `grep -n` (`-39` §3). The bytes never moved; the numbers were mis-counted at
authoring, which is precisely the failure `-12` §3's re-measure-at-your-HEAD cannot catch (`-39` §2).** Re-measure
anyway in F0.
Tier: LIGHT — **one test file**, `src/components/music/__tests__/pdf-viewer.test.tsx`. No production source byte, no
workflow, no repo setting, no branch protection, no catalog row, no chart byte, no setlist, no deploy of its own.

**FORBIDDEN, EXPLICITLY, AND THIS IS THE WHOLE POINT OF THE WAVE:** adding `pdf-viewer.test.tsx` — or any file — to
`ci/gated-suite-exclusions.txt`. Daniel was offered exactly that option and **declined it** (`-30` §3(c)). The guard will
refuse it; do not make it have to.

NEXT: F0 → F1 → F2 → F3 → F4 → F5 → return → STOP. **If F1 cannot reproduce the failure deterministically, STOP and
return** — an unreproduced flake is not repaired by an edit that makes it stop appearing.

- [ ] **F0 · re-measure the four cited lines at your HEAD** and report any that moved (`-12` §3).
- [ ] **F1 · make the failure DETERMINISTIC before touching it** — force the flush gap, observe the current test go red at `:121`.
- [ ] **F2 · the repair** — wait on the state the test asserts, then take the negative.
- [ ] **F3 · prove load-insensitivity the strong way** — re-run F1's forced gap against the repaired test; it must pass.
- [ ] **F4 · prove the negative can still FAIL** — break the width guard in a throwaway edit; the repaired test must go red.
- [ ] **F5 · revert both instruments, confirm the diff is one file, push, and READ the gated job's state** (do not merge anything).
- [ ] **Return** `RETURN-CODE-LIVE-FLAKE-REPAIR-2026-09-04.md` + a CLOSED board row.

---

## Why this wave is next, and what it costs to leave alone

The gate is on and its **first and only blocker is not a bad change** — it is this test, red in roughly one CI sample in
four at a single unchanged SHA, green three times running with byte-identical numbers, and green 18/18 when the file is
run alone [inherited: `RETURN-CODE-LIVE-PROMOTION-GATE-2026-09-04.md` §G3(a)]. Every wave after this one pays that tax,
and **a required check that is routinely wrong is a required check people learn to disregard** — which is how a gate
dies three weeks after it is installed. `-30` records Daniel choosing to keep the gate on *with* the flake rather than
hide the file; this order is the other half of that bargain.

## The mechanism — measured, so the repair is not a guess

[measured: this desk, 16:3xZ, reading the two files at the Cowork mount; re-measured by you in F0]

The CI red names the line: `does NOT render pages at width 0 (no blank zero-width pages)`, failing at **`:121:23`** —
which is `screen.getByText(/Measuring…/)`, **the synchronous positive assertion**, not the negative the test is named
for.

1. `Measuring…` renders at **`PDFViewer.tsx:545`**, inside the ternary opening at **`:531`**, and is reachable **only**
   when `width > 0` is false **and `numPages > 0`**.
2. `numPages` becomes non-zero only when the mocked `Document` fires `onLoadSuccess`, which it does from a
   **`React.useEffect`** at **`pdf-viewer.test.tsx:19–22`**.
3. The same mock returns `<div data-testid="pdf-document">` on its **first** render, at **`:23`** — i.e. **one state
   update earlier**.
4. The test waits at **`:118`** on **`pdf-document`**, then asserts at **`:120`–`:121`** with no further wait.

**So the test waits on an element that exists one flush before the element it asserts.** Whether that later flush has
landed when `waitFor`'s poll returns is decided by the scheduler — that is, by machine load. Idle runner: green. Loaded
runner: `getByText(/Measuring…/)` throws at `:121`. **Nothing in `PDFViewer.tsx` is wrong, and the two neighbouring
tests at `:95` and `:106` do not flake because each waits on the very thing it asserts.**

## And the same window makes the test's own guard blind

`:120` asserts `queryByTestId('page-1')` is null, to show the width-0 guard suppresses pages. **In the pre-flush window
`numPages` is still 0, so no page would render at any width** — the assertion passes for a reason that has nothing to do
with the width guard. On the loaded runs where `:121` fails, `:120` was passing **vacuously**. By `-9`/`-11` that guard
is made to fire or retired. **The load fix and the vacuity fix are one edit** (`-33` §3): waiting for the
`numPages > 0 && width === 0` state before taking the negative is exactly what makes the negative mean something,
because pages **would** render at that point but for the guard.

**Do not "fix" this by lengthening a timeout or adding a bare `await`.** That hides the vacuity and keeps the guard
blind — the test would pass while asserting nothing.

---

## F0 · re-measure, then decide

```bash
sed -n '115,122p' src/components/music/__tests__/pdf-viewer.test.tsx
sed -n '17,24p'  src/components/music/__tests__/pdf-viewer.test.tsx
sed -n '529,548p' src/components/music/PDFViewer.tsx
grep -n "RENDER_WATCHDOG_MS\|testTimeout" src/components/music/PDFViewer.tsx vitest.config.ts
```

Observed, **re-measured at `c642fb185a` from the Cowork mount at 19:2xZ**, each cited by the text it contains, and what
you must confirm still holds at your own HEAD: the `await waitFor(… getByTestId('pdf-document') …)` line is **`:118`**;
the `expect(screen.queryByTestId('page-1')).toBeNull()` line is **`:120`**; the `expect(screen.getByText(/Measuring…/))`
line is **`:121`**; the mock's `React.useEffect(() => {` is **`:18`** and its `}, [])` **`:22`** (**CORRECTED from
`:19–:22`**), its returned `data-testid="pdf-document"` div **`:23`**; in `PDFViewer.tsx` the `{width > 0` line is
**`:532`** (**CORRECTED from `:531`, which is the last line of the comment above it**) and the
`<p className="text-sm">Measuring…</p>` line is **`:546`** (**CORRECTED from `:545`, which is the `Loader2` spinner**);
and the last grep returned `RENDER_WATCHDOG_MS = 30_000` at `:85` with `testTimeout: 30000` at `vitest.config.ts:41` — **which is why the watchdog is NOT the cause and must not be
blamed**: it arms only while `numPages` is 0 and is cleared the moment the load succeeds. **If any of these have moved,
report the new lines and continue against them; if the structure has changed, STOP.**

## F1 · force the gap — the failure becomes deterministic or this order stops

The mechanism claims the assertion depends on flush ordering. Prove it: in a **throwaway** edit, defer the mock's
success callback by one macrotask, so the gap the loaded runner opens is opened on every run —

```bash
grep -n "onLoadSuccess?.({ numPages: h.numPages })" src/components/music/__tests__/pdf-viewer.test.tsx
```

Observed, **re-measured at `c642fb185a` from the mount at 19:2xZ**: **one occurrence, at `:20`**, inside the `useEffect`
at `:18–:22` (**CORRECTED from `:19–:22`**). Wrap that single call in a
`setTimeout(..., 0)` and run the file alone. **Expected: the width-0 test fails at `:121`, and the two neighbouring
tests still pass** — they fire a resize and wait on their own subject, so the deferral does not reach them. Quote the
failure verbatim in the return, then **revert the instrument before F2** (undo: restore the one line; the edit is one
file and is not committed).

**If the test does NOT go red under the forced gap, the mechanism above is wrong — STOP and return with what you saw.**
Do not proceed to repair a defect you have not reproduced.

## F2 · the repair

Reach the asserted state, then assert. In the width-0 test only: **await** the `Measuring…` placeholder first, and take
the `page-1` negative **after** it is on screen. Nothing else in the file changes; `PDFViewer.tsx` is not touched.

## F3 · the strong proof of load-insensitivity

**Re-apply F1's forced gap to the repaired test.** It must now **pass**. This is deterministic evidence about the
mechanism, and it is worth more than any number of green runs — three consecutive greens are what an idle runner gives
you anyway, and would have "proved" the test fine yesterday. Revert the instrument. Report both directions: red before
(F1), green after (F3), same instrument.

## F4 · the denominator — prove the negative can still fail (`-9`, `-11`)

In a **throwaway** edit to `PDFViewer.tsx`, make the page list render regardless of width — **drop the `width > 0`
arm of the ternary whose opening line is `{width > 0`, measured `:532` (CORRECTED from `:531`, which is a COMMENT line:
editing there would leave the ternary intact, the guard GREEN, and F4 would fail for the wrong reason — `-39` §4)**. **The repaired width-0 test must go RED** — if it stays green, the negative is still vacuous and
the repair is not done. Quote the failure. **Revert; `git diff --stat` must then show `PDFViewer.tsx` unchanged.**

## F5 · land it, and READ the gate (`-31`)

`git diff --stat` before committing: **exactly one file**,
`src/components/music/__tests__/pdf-viewer.test.tsx`. Push (the push is the only deploy path — `R-0903-live-cw-4` — and
this diff carries no production byte). Then **read** the `Gated Unit Suite` conclusion and the protection state; **do
not open or merge a PR to test the gate.** `-31` is standing law and was written from this repo's own three-minute
incident: *a gate is observed by reading its state; attempting the act it gates is not a test, it is the act.*

## What this order does not do

No production source byte survives it (F4's edit is thrown away). It does not touch `ci/gated-suite-exclusions.txt`,
`ci/check-exclusions-remove-only.sh`, `.github/workflows/**`, `vitest*.config.ts`, branch protection, any catalog row or
any setlist. It does not chase `scripts/__tests__/coord-status.test.ts` or `setup-coord-worktree.test.ts` — the named,
carried, mount-only flake family (`-33` §6(b)) — and it does not touch `Lint & Type Check` or `E2E Smoke`, which are red
on every run and deliberately not required (`-33` §6(c)).

## What the return must show

The four items every return in this program shows (`PROGRAM-SATELLITE-HEALTH-2026-09-04.md`), and specifically: the
**verbatim failure text from F1**, the **verbatim failure text from F4**, the pass from F3, `git diff --stat`, and the
gated job's conclusion **as read**. Suite totals are yours to produce and are stated as expectations nowhere in this
order — this desk cannot run this suite (`npx vitest run` at the Cowork mount dies before collection on
`@rollup/rollup-linux-x64-gnu`).

*Ordered by live-cw. Daniel decides.*

---

## Amendment (1) — 2026-09-04 19:2xZ, live-cw · this order was dispatchable for three hours and read as blocked; and four of its cited lines were off by one

**`R-0904-live-cw-38`.** The Status line above said *"DISPATCHABLE — but it is `live`'s WAVE 2, not wave 1. Finish
PAIR-NAMES, return it, then start this."* PAIR-NAMES was finished, returned and its terminal life retired on purpose at
18:0xZ; a fresh `live` opened at 18:2xZ with four waves unspent, met a precondition phrased as a position in a wave
sequence it was not in, and stood on `wait_for_board.py` reporting *"nothing dispatchable"* [inherited: `live`'s 18:0xZ
and 18:2xZ CLOSED rows]. **The order was the blocker, not the board.** Corrected: **a precondition is an observable
fact** — *"`RETURN-CODE-LIVE-PAIR-NAMES-2026-09-04.md` exists"* — never an ordinal. Two more halves of the same defect
are recorded rather than smoothed away: **the dispatch test is the unreturned-order set, not the newest file** (this
order is older by mtime than ROLE-VERIFY, which is exactly why `live`'s newest-file scan missed it), and **a queue line
is an event a row consumes, not a standing state** — this desk's 17:4xZ `FOR live:` line was consumed by `live`'s
18:0xZ row, so `dispatch.py` showed the next life no pending line at all. It is re-queued with this amendment.

**`R-0904-live-cw-39`.** Four cited lines were wrong by one against bytes that never moved: the mock's `useEffect`
(`:18`, not `:19`), the ternary (`:532`, not `:531`), `Measuring…` (`:546`, not `:545`), and F4's edit target with it.
**F4 was the expensive one** — `:531` is a comment line, so the throwaway edit would have left the ternary intact, the
repaired test GREEN, and F4 would have read as *"the negative is still vacuous"* when it was not. Corrected in place.
Every citation in F0, F1 and F4 now names the **text** the line contains alongside the number, so a mis-count is
self-healing under one `grep -n` instead of being an instruction to edit the wrong line. **`NEXT:` IS UNCHANGED** —
`F0 → F1 → F2 → F3 → F4 → F5 → return → STOP` — and no requirement was added or removed; this amendment corrects
locations and a gate, nothing else.

*Ordered by live-cw. Daniel decides.*
