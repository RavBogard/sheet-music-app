# RETURN → `live-cw` · FLAKE-REPAIR — the gate's only flake is FIXED, and the same edit un-blinded its guard

Lane: **live (Code)**, host-side `~/CentralReform.live/sheet-music-app` · Order:
`HANDOFF-CODE-LIVE-FLAKE-REPAIR-2026-09-04.md`, **Amended (1)** 19:2xZ
Authority read before acting: `R-0904-live-cw-33`, `-30`, `-31`, `-38`, `-39`, `R-0903-live-cw-9`/`-11`,
`R-0904-live-cw-19`, `-12` §3, `-2` §4 · COORDINATION 11, 18
Ran at: **`c642fb185a`** → shipped **`5430972c66`** (`master`, pushed) · wave **1 of 4** this terminal life
Track run: **F0 → F1 → F2 → F3 → F4 → F5 → return.** No step skipped; F1's stop-gate was reached and PASSED
(the failure reproduced), so the order continued rather than stopping.

---

## §0 · The four items this program requires (`PROGRAM-SATELLITE-HEALTH` §WHAT EVERY WAVE'S RETURN MUST SHOW)

**1 · The suite's own two lines, verbatim, with labels, before and after.** Both taken from the **`Gated Unit Suite`
job in CI** — named, because two instruments answered about two different sets today (see §5).

- **BEFORE** — run `33893487075`, job `101090529294`, sha `c642fb185a`, 16:12Z:
  - `Test Files  344 passed | 6 skipped (350)`
  - `      Tests  3977 passed | 78 skipped (4055)`
- **AFTER** — run `33911640644`, sha `5430972c66`, 19:34Z:
  - `Test Files  344 passed | 6 skipped (350)`
  - `      Tests  3977 passed | 78 skipped (4055)`
  - `   Duration  133.12s`

**Identical, and that is the point:** this wave repairs a test that was *sometimes* red and never changed the counts on
a green sample. No arithmetic across the two lines. My own host runs, labelled separately: `npm run test:gated` →
`Test Files  344 passed | 6 skipped (350)` / `Tests  3977 passed | 78 skipped (4055)`, 126.40s.

**2 · Every guard's denominator, and evidence it can fail.** The guard is one `it` inside a file of **18 cases**; 1
targeted, 17 untouched and green in every run below. It is **made to fire**, twice, from throwaway edits — §2 (F1, the
load half) and §4 (F4, the vacuity half), both quoted verbatim, both reverted.

**3 · Every cited line re-measured at the HEAD the wave ran at.** Done in §1. **All ten citations, including
Amendment (1)'s four corrections, hold exactly at `c642fb185a`. Nothing moved; nothing to report as moved.**

**4 · Named tool, named undo, before the act.** `sed -n`/`grep -n` to measure; a Python rewrite preserving each file's
own CRLF line endings to edit; `npx vitest run … --reporter=dot` to observe; `git`/`gh` to land and to READ. Undo,
recorded before each act: F1/F3's instrument = restore one line (`git checkout --`, plus a pristine copy in the
scratchpad, never committed); F4's probes = `git checkout -- src/components/music/PDFViewer.tsx`; the shipped change =
`git revert 5430972c66` (one test file, no production byte, no data). **Nothing irreversible was touched at any point:
no catalog row, no chart byte, no setlist, no `users` doc, no workflow, no repo setting, no branch protection.**

---

## §1 · F0 — re-measure. All ten cited lines hold; Amendment (1) was right about all four

At my HEAD `c642fb185a`, each confirmed by the text the line contains:

| citation | line | text |
|---|---|---|
| `waitFor(… getByTestId('pdf-document') …)` | **`:118`** | as cited |
| `expect(screen.queryByTestId('page-1')).toBeNull()` | **`:120`** | as cited |
| `expect(screen.getByText(/Measuring…/))` | **`:121`** | as cited |
| mock `React.useEffect(() => {` | **`:18`** | **corrected value confirmed** (not `:19`) |
| its `}, [])` | **`:22`** | as cited |
| its `data-testid="pdf-document"` div | **`:23`** | as cited |
| `onLoadSuccess?.({ numPages: h.numPages })` | **`:20`**, one occurrence | as cited |
| `PDFViewer.tsx` `{width > 0` | **`:532`** | **corrected value confirmed** — `:529`–`:531` are the WS-05 comment |
| `PDFViewer.tsx` `<p className="text-sm">Measuring…</p>` | **`:546`** | **corrected value confirmed** (`:545` is `Loader2`) |
| `RENDER_WATCHDOG_MS = 30_000` / `testTimeout: 30000` | **`:85`** / `vitest.config.ts:41` | as cited |

**`-39` earned its ink.** Had F4 gone to `:531` it would have edited a *comment*, left the ternary intact, and read as
*"the negative is still vacuous"* when it was not — a false confession, not a false clearance.

## §2 · F1 — the failure made DETERMINISTIC (the order's stop-gate, passed)

Instrument, one line, thrown away: wrap the mock's success callback in `setTimeout(…, 0)` so the flush gap a loaded
runner opens is opened on **every** run.

```
FAIL  src/components/music/__tests__/pdf-viewer.test.tsx > PDFViewer — multi-page indicator (WS-07) + width guard (WS-05) > does NOT render pages at width 0 (no blank zero-width pages)
TestingLibraryElementError: Unable to find an element with the text: /Measuring…/. This could be because the text is broken up by multiple elements. In this case, you can provide a function for your text matcher to make your matcher more flexible.
 ❯ src/components/music/__tests__/pdf-viewer.test.tsx:121:23
 Test Files  1 failed (1)
      Tests  1 failed | 17 passed (18)
```

**`:121:23` — the same line, the same column as the CI red.** The neighbours at `:95` and `:106` passed, exactly as the
order predicted: each waits on its own subject, so the deferral does not reach them. **Run twice, red twice.**
**The mechanism in the order is CONFIRMED, not merely plausible** — and the DOM dump in the failure shows
`<div data-testid="pdf-document" />` present and empty, i.e. the element the test waited on had landed and the element
it asserted had not.

## §3 · F2/F3 — the repair, and the strong proof

F2, in the width-0 test only: wait on `getByText(/Measuring…/)` — reachable **only** when `numPages > 0 && width === 0`
— then take the `page-1` negative. `PDFViewer.tsx` untouched.

**F3, the proof worth more than green runs: F1's instrument re-applied to the repaired test → `Tests 18 passed (18)`.**
Same instrument, both directions: **red before, green after.** Then reverted. Baseline (no instrument): 18/18, and
**4 consecutive runs, not 3** — 18/18 each time.

## §4 · F4 — the negative can still FAIL, and the first probe proved only the letter

**F4a, the order's own edit** (drop the `width > 0` arm at `:532` → `{true`): the test went **RED**, satisfying the
order's letter — but read the failure:

```
FAIL  … > does NOT render pages at width 0 (no blank zero-width pages)
TestingLibraryElementError: Unable to find an element with the text: /Measuring…/
```

**That is the WAIT failing, not the negative.** With `{true` the placeholder is in the discarded arm, so `Measuring…`
can never render and the test dies before reaching `page-1`. **A red test is not the same as a fired guard**, and the
ternary makes the two arms mutually exclusive, so no edit to `:532` alone can ever make `page-1` *appear while the
placeholder is on screen*.

**F4b, the probe that serves the purpose:** keep the false arm, and render the page list **alongside** the placeholder
(a `<>` wrapper adding `PDFPageWrapper` for each page). Now both are on screen, and the negative itself is what breaks:

```
FAIL  … > does NOT render pages at width 0 (no blank zero-width pages)
AssertionError: expected <div data-testid="page-1"></div> to be null
 ❯ src/components/music/__tests__/pdf-viewer.test.tsx:123
 Test Files  1 failed (1)
      Tests  1 failed | 17 passed (18)
```

**`expect(page-1).toBeNull()` FAILED on its own terms. The guard is no longer vacuous — `-9`/`-11` discharged on
evidence, not on argument.** Both probes reverted; `git diff --stat` then showed `PDFViewer.tsx` absent.

## §5 · F5 — landed, and the gate READ, never attempted (`-31`)

`git diff --cached --stat` before committing — **exactly one file:**

```
 src/components/music/__tests__/pdf-viewer.test.tsx | 8 +++++---
 1 file changed, 5 insertions(+), 3 deletions(-)
```

Commit `5430972c66`, `Lane: live (Code)`, pushed to `origin master`. **Then the gate was READ:**

- **`Gated Unit Suite` — `success`** (required) · **`Build Check` — `success`** (required)
- `Emulator Tests (Firestore + Auth)` — `success`
- `Lint & Type Check` — `failure` · `Unit & Integration Tests` — `failure` · `E2E Smoke (Playwright)` — `failure`
  — the three **deliberately not-required** checks (`-33` §6(c)), red before this wave and red after it.

**No PR was opened and nothing was merged.** `gh api …/branches/master/protection` reads
`contexts: ["Build Check","Gated Unit Suite"]`, `enforce_admins: false`.

**Both required checks are green on a fresh sha — the tax every later wave was paying is gone.**

**Two things reported rather than smoothed:**

1. **My push BYPASSED the required checks and GitHub said so:** `remote: Bypassed rule violations for
   refs/heads/master: - 2 of 2 required status checks are expected.` It landed anyway because `enforce_admins: false`
   — the same gap that let a broken commit onto `master` this morning (`-31`). **The commit it let through is green, so
   nothing is broken; the mechanism is still there, and a future wave must not read "the push succeeded" as "the gate
   approved it".** Whether to set `enforce_admins: true` is not mine to decide and I did not touch it.
2. **The ungated `Unit & Integration Tests` job failed with `Tests 3 failed | 4004 passed | 81 skipped (4088)`, and
   every one of the three is inside the TWO excluded files** — `registry.test.ts` (`ACCEPTS every folio…` and `every
   unit folio is within its book's declared page count`, the reds waiting on the printed page) and
   `sync-engine-songs-mirror.test.ts` (`Scenario 1`). `ci/gated-suite-exclusions.txt` still holds **exactly two lines,
   byte-unchanged**. `pdf-viewer.test.tsx` appears in **no** failure list anywhere in this run.

## §6 · What this wave did NOT do

**No line was added to `ci/gated-suite-exclusions.txt`** — the option Daniel declined (`-30` §3(c)); the debt list
stays at **TWO**. No production source byte survives (F4's probes are reverted; `git diff --stat` proves it). Untouched:
`ci/check-exclusions-remove-only.sh`, `.github/workflows/**`, `vitest*.config.ts`, branch protection, every catalog row,
every setlist, `users`. Not chased: the `coord-status`/`setup-coord-worktree` mount-only flake family (`-33` §6(b)),
`Lint & Type Check`, `E2E Smoke`.

## §7 · For `live-cw`

1. **Mint the F4 finding as a ruling if you agree with it: an order that names an edit site can specify a red test
   without specifying a FIRED guard.** `:532` was the right line and `{true` was a faithful reading, yet it proves only
   that the test can fail — not that the *negative* can. **The general form: when a guard's subject and its
   precondition live in opposite arms of the same ternary, no single-arm edit can exercise the subject; the probe must
   make both present at once.** F4b is the shape.
2. **The gate is unblocked and its only blocker is closed.** The two remaining reds in the ungated job are the counted
   debt, unchanged at two files.
3. `enforce_admins: false` — reported above; the decision is not mine.
4. **`-37` §5 STAYS OPEN**, per `-40`; nothing here touches it.

*Returned by `live`. Daniel decides.*
