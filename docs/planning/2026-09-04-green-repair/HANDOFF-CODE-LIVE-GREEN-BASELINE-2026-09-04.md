# ORDER → `live` (Code): measure the red baseline, and map the last illegible refusal

Lane: **live-cw (Opus Cowork)** · Executor: **`live`**, host-side in `~/CentralReform.live` (rule 8 addendum)
Authority: **R-0904-live-cw-13** (a red baseline every lane steps around is a guard nobody runs; it is
MEASURED before it is touched, and nothing is fixed in the wave that measures it) · **R-0904-live-cw-14**
("a red build never promotes" names a gate that exists for the BUILD only) · **R-0904-live-cw-12**
(`run_not_found: 404` — a not-found presenting as `500` is N1's defect one row away) ·
**R-0904-live-cw-10** (a guard names the source line; a truncated id is a prefix) · **R-0903-live-cw-4**
(the push is the only deploy path).
Status: **DISPATCHABLE.**
Verified-against: `057fbe61d3` [inherited: your 12:5xZ row — promoted 2026-09-04T12:5xZ, `/api/version`].
**Re-verify by content before the first edit.** Read the rollback target off `/api/version` **before** the
push and name it in the return.
Tier: LIGHT — one `src/` one-liner plus its guard, and measurement whose values cannot be pre-named.
**No catalog row changes state in this order. No test is deleted, skipped, renamed or rewritten in it.**

NEXT: B1 → B2 → suite + `tsc` → ONE deploy → G3 proven by calling it → B3 → B4 → STOP

- [ ] **B1 · The red is MEASURED: every failing test named, per file, with its assertion and its cause class.**
- [ ] **B1b · The first red run on `main`/`master` found by walking the Actions history**, and its commit named.
- [ ] **B1c · The two counts reconciled** — "the standing 19 failures" against "7 failed / 339 passed / 9 skipped (355)".
- [ ] **B2 · `run_not_found: 404` added to `ERROR_CODE_MAP`.** Behaviour unchanged; the row is the fix.
- [ ] **Unit suite, emulator suite and `tsc --noEmit` run BEFORE the push, all three reported as numbers.**
- [ ] **ONE deploy carrying B2 alone.** Nothing else rides it.
- [ ] **G3 · the mapping proven by CALLING `undo_dedupe_group` with a run id that does not exist.**
- [ ] **B3 · What actually gates a promotion, stated from the files and from what you can see of the project.**
- [ ] **B4 · A repair PLAN for the seven files — proposed, per file, NOT executed.**
- [ ] **Return** `RETURN-CODE-LIVE-GREEN-BASELINE-2026-09-04.md` + a CLOSED board row.

---

## Why this order exists

You reported it yourself, and the report is the reason this exists rather than a repair: **the unit suite has
been red across three consecutive deploys** — Actions `33824161357`, `33831357621`, `33874093445` — and
**every lane, this one included, has correctly declined to fix seven unrelated files inside a LIGHT order.**
Right per wave. Wrong cumulatively: a suite that is red on every run cannot tell anyone that a wave broke
something, and three waves have now shipped past it reading "red, not mine" as "green enough".

`R-0904-live-cw-13` rules the sequence, and the sequence is the point of this order: **measure, report, STOP.
Do not repair.** A red turned green by deleting or skipping a test is the same act as hiding a bonded row —
the number improves and the thing the number was for is gone.

**This order writes NO catalog rows.** If any track appears to require one, that is a defect in this order:
**STOP and return it.**

---

## B1 · Name the red, test by test

The seven files, from your own 13:0xZ amendment, all present at this desk's read of the tree:

```bash
ls src/components/performance/__tests__/perform-cls.test.tsx \
   src/components/performance/__tests__/public-view.test.tsx \
   src/lib/__tests__/sync-engine-songs-mirror.test.ts \
   src/lib/books/__tests__/lookup.test.ts \
   src/lib/books/__tests__/registry.test.ts \
   src/lib/mcp/tools/__tests__/books.test.ts \
   src/lib/mcp/tools/__tests__/library.test.ts
```

Observed by this desk at `057fbe61d3`: all seven exist; their mtimes span **2026-06-07 to 2026-09-02**, so
this is not one recent edit. Measured at the mount, `stat` on each path.

**This desk could not run the suite and says so rather than guessing.** `npx vitest run` on the mount dies
before collection — `Cannot find module @rollup/rollup-linux-x64-gnu`, npm's optional-dependency defect — and
repairing a node install was not this desk's to improvise. **Observed: the run exits with that error and zero
tests collected**, measured at the mount at `057fbe61d3`. So B1 is yours, on a tree where the suite runs.

For **each failing test** report: file · test name · the assertion that fails · expected vs actual · and a
**cause class**, one of:

1. **STALE EXPECTATION** — the test asserts a value the app deliberately changed (a registry page count, a
   tier, a book slug). The test is wrong and the app is right.
2. **REAL DEFECT** — the app is wrong. Name what a user would see.
3. **ENVIRONMENT** — passes locally, fails in CI, or the reverse: fixture residue, a clock, jsdom, ordering.
4. **CANNOT SAY YET** — allowed, and better than a guess. Say what you would need.

**Report class per test, never per file.** `library.test.ts` may hold one stale expectation and one real
defect, and a per-file verdict would bury the second. And **run each failing file ALONE as well as in the
suite** — a test that passes alone is class 3 and its cause is contention, which is a different repair.

## B1b · When did it go red, and on whose commit

Walk the Actions history on the default branch backwards from `33874093445` to the **first red unit job**, and
name its commit sha, its date and its subject line. `gh run list --workflow=ci.yml --branch=<default> --limit 60`
and `gh run view <id>` are enough; if `gh` is not authorized here, say so and give the oldest red run you can
see plus the newest green one, and the interval stands as the answer.

**Do not assume the three ids in your amendment are consecutive runs, or that they bound the window.** They
are the three this family happened to look at.

**And check the seven files against that commit.** `git log --oneline -- <the seven paths>`: if the last edit
to any of them predates the first red run, that file's test did not change — something it asserts about did.
Name which side moved. This is the measurement that answers *whose*: your 13:0xZ row says "not mine", proved
for the last wave by an identical failure shape on `107b9618d9`, which is correct and narrower than *nobody's*.
**Three of the seven — `books/lookup`, `books/registry`, `mcp/tools/books` — are the book registry this desk
ordered** (maariv 69 · shacharit 144 · machzor 184, `HANDOFF-CODE-LIVE-SHACHARIT-144-2026-09-02`), so the
family's own lane is a live candidate and this desk is not exempt from the answer.

## B1c · Reconcile the two counts

Your amendment carries **both** "the standing 19 failures" and "**7 failed / 339 passed / 9 skipped (355)**"
for the same run. Those cannot both be the test tally: `339 + 9 + 7 = 355` exactly. Most likely one is vitest's
FILE line and the other its TEST line — but *most likely* is not a measurement.

Report the run's summary block verbatim, both lines, and say which number is files and which is tests.
**A baseline whose size nobody can state is not a baseline.**

## B2 · `run_not_found` — the last illegible refusal in this pair

Measured at the mount at `057fbe61d3` (this desk, `grep -rn "run_not_found" src`): **two occurrences, and
neither is a map row** —

```bash
grep -rn "run_not_found" src --include=*.ts --include=*.tsx
```

Observed at `057fbe61d3`: `src/lib/mcp/tools/undo-dedupe.ts:314` (the throw) and
`src/lib/mcp/__tests__/mcp-undo-dedupe.emulator.test.ts:347` (a test asserting the slug). **Zero rows in
`ERROR_CODE_MAP`**, so the default applies.

**The default has MOVED and this order names its new line rather than repeating the old one.** N1's two rows
shifted the file: `ERROR_CODE_MAP[machine_code] ?? 500` is now **`src/lib/mcp/errors.ts:161`** (the
REFUSALS-AND-PAIRS order cited `:147`, correctly, before those rows landed). `fuzzy_execution_refused: 400`
observed at **`errors.ts:85`** and `mark_refused_row_is_bonded: 409` at **`errors.ts:126`** — both of your
commits verified at the mount by this desk, not taken from your row.

**Add one row: `run_not_found: 404`.** A record that does not exist is not a server fault; `404` is the answer
an LLM caller must not retry blindly. Nothing about `undo_dedupe_group`'s behaviour, message or hint changes.
**Extend that emulator test to assert the CODE as well as the slug** — the same shape N1's dedupe test took, so
the row cannot silently regress.

**While you are in the map: report, do not fix, any OTHER machine code thrown in `src/` with no row.** A grep
of thrown codes against the map's keys is one command; a third instance would make this a class rather than a
coincidence, and that is a ruling, not a wave.

## B3 · What actually gates a promotion

`R-0903-live-cw-4` says *the push is the only deploy path; a red build never promotes*, and three lanes have
read the second clause as covering the suites. **Measured at the mount at `057fbe61d3` by this desk, and this
is what `R-0904-live-cw-14` rests on:**

```bash
grep -n "needs:\|continue-on-error" .github/workflows/ci.yml
```

Observed at `057fbe61d3`: five jobs — `lint-and-type-check`, `unit-tests`, `emulator-tests`, `build-check`, and the e2e job —
and **exactly one `needs:` in the file**, the e2e job's `needs: build-check`. No `continue-on-error` anywhere.
`vercel.json` was read in full: **crons only, no `ignoreCommand`, no build gate.** So the promotion appears to
be gated on Vercel's own `next build` and on nothing else.

**Confirm or refute that from where you sit** — you can see the project surface this desk cannot. State in the
return, in one sentence each: what stops a push whose unit job is red; whether a Vercel deployment is
configured to require the GitHub checks; and if nothing does, say so plainly. **Propose nothing.** Whether the
gate should exist is a ruling, and after `R-0904-live-cw-4` it is Daniel's kind of question, not a lane's.

## B4 · A repair plan, proposed and not executed

Close the return with a per-file plan: for each of the seven, the smallest correct repair, its cause class, and
whether it can be verified without a deploy. Rank them so the class-2 rows come first — a real defect hiding
behind six stale expectations is the reason this order exists.

**Author nothing. Change no test.** The repair is a second order, per file, with its own authority — that is
`R-0904-live-cw-13` §3 and it is not negotiable inside this wave.

## Guards

Every guard names the line whose behaviour it asserts (`R-0904-live-cw-10` §3).

| | guard | how |
|---|---|---|
| **G1** | RH still reads `184`/`feed` | `lookup_book_page` on `shirei-tshuvah` at both ends of the wave. |
| **G2** | zero catalog writes | Full row enumeration at open and at close; report the partition both times and the delta. |
| **G3** | **B2 proven by CALLING it** | `undo_dedupe_group` with a run id that does not exist → `run_not_found` at **`code: 404`**, not `500`. Report the code you saw, and note that **a truncated run id is a prefix** (`fileId.slice(0, 12)`) so a `run_not_found` from a truncation is not this guard's answer — construct the id to be genuinely absent. |
| **G4** | Daniel's mark undisturbed | `1VuMq83…` reads `duplicate` at open and close. |
| **G5** | the three suites, before the push | Unit, emulator and `tsc --noEmit`, each as a number, **and the unit number compared to B1's baseline: identical is the expected result of this wave**, and a CHANGED unit number is a finding to report before the push, in either direction. |
| **G6** | rollback named before the push | Read off `/api/version` before it, quoted in full (`R-0904-live-cw-10` §1). |

## What this order does NOT touch

The seven red files. The 38 unreachable-byte rows. The 16 bonded non-active rows (`R-0904-live-cw-15`: named
work, no act authorized). The seven pairs — **no mark on any of them, by anyone.** `moments.json` / L3
binding. The fuzzy lane's diagnostic. `get_chart_status`'s reachability oracle.

*Claude records; Daniel decides.*
