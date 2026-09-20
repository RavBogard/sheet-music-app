# ORDER → `live` (Code): turn the promotion gate on — two required checks, and an exclusion list that can only shrink

Lane: **live-cw (Opus Cowork)** · Executor: **`live`**, host-side in `~/CentralReform.live` (rule 8 addendum)
Authority: **R-0904-live-cw-23** (Daniel's word — *"whatever you recommend"* — makes `-21` operative; and the
installed list is the SEVEN, shrunk only on CI evidence) · **R-0904-live-cw-21** (the gate's shape: `Build Check`
plus a gated suite, exclusion list **remove-only**, and its two preconditions) · **R-0904-live-cw-16** §3 (a suite
count is quoted with its line's label) and §4 (the three-file CI/local skip drift is a defect in the baseline) ·
**R-0904-live-cw-2** §4 (no act authorized before its tool and its undo are named) · **R-0903-live-cw-9**/**-11**
(a guard that can only pass vacuously is retired or MADE to fire; every guard reports its denominator) ·
**R-0904-live-cw-12** §3 (a cited line is re-measured at the HEAD it will be executed at) · **R-0903-live-cw-4**
(the push is the only deploy path) · **R-0904-live-cw-24** (this is wave 2 of SATELLITE HEALTH) · rules 11, 18.
Status: **QUEUED — becomes DISPATCHABLE the moment P0 holds.** Nothing here runs while GREEN-REPAIR's commit is
still unpushed and un-CI'd; P0 is the step that fixes that, and it is the first thing in the `NEXT:` line.
Verified-against: `1bb4c775f2` [inherited: `live`'s 15:0xZ board row and `RETURN-CODE-LIVE-GREEN-REPAIR-2026-09-04.md`
— eight files, `+396/-55` off `cdf1c37386`, committed with `Lane: live (Code)`, **not pushed**]. Every path and job
name below was read at the Cowork mount at 15:0xZ; **re-verify by content before your first edit** and if anything
has moved, say so in the return and use what you measure.
Tier: CLOSED — this order changes a workflow file **and a repository setting** — the two things
`HANDOFF-CODE-LIVE-GREEN-REPAIR-2026-09-04.md` was explicitly forbidden to touch. It is the order where that is
allowed, and it is the only one. **No catalog write. No chart tool. No rename. No `src/**` behaviour change.**

NEXT: P0 → G1 → G2 → G3 → G4 → G5 → G6 → return → STOP. **If P0 or G3 cannot be satisfied, STOP and return — do not
make a check required on a number that cannot be reproduced.**

- [ ] **P0 · the repaired tree reaches `origin/master` and CI is observed on that exact SHA.** Push it; record the run id and every job's conclusion. **This push is a promotion** (`R-0903-live-cw-4`) — of a test-only diff, which is why it is wave 1b and not a question.
- [ ] **G1 · the gated job exists** — `ci/gated-suite-exclusions.txt` (the seven files, one path per line) + a vitest config that reads it + a new CI job named exactly **`Gated Unit Suite`**.
- [ ] **G2 · the remove-only guard exists AND has been made to fire** — a CI step that fails when that file gains a line, proven by a throwaway commit whose failure output is quoted.
- [ ] **G3 · the gated subset's own numbers, measured** — both label lines, file and test counts, **green on three consecutive runs**, and **`-16` §4's CI/local skip drift resolved** (the three files named, the difference removed or the job pinned so both environments agree).
- [ ] **G4 · the two checks made required** on `master`, slug read and never assumed, with `enforce_admins` **false**.
- [ ] **G5 · the gate is OBSERVED to block once** — on a PR that is never merged, then closed.
- [ ] **G6 · the first remove-only exercise** — the five files CI proves green come OFF the list, in this wave, with counts quoted; the list ends at **two**.
- [ ] **Return** `RETURN-CODE-LIVE-PROMOTION-GATE-2026-09-04.md` + a CLOSED board row.

---

## Why this order is written now, and the one thing my brief got wrong

`R-0904-live-cw-21` reserved the switch to Daniel. **He answered: *"whatever you recommend"*** — so the shape ruled
there is adopted whole, and `R-0904-live-cw-23` is the record of his word. Nothing in the design changed on his say-so;
what changed is that it is now allowed to ship.

What did change is the tree. This order was staged to sit *behind* GREEN-REPAIR's return. **That return has already
landed** — 19 failing tests are 3, sixteen went green, and the three that remain are red with a named ruling each
[inherited: `RETURN-CODE-LIVE-GREEN-REPAIR-2026-09-04.md`]. So the gate is not being installed over a red suite any
more; it is being installed over a suite whose debt is **two files**, not seven. That does not change the ruled shape —
see the next section, which is the one place I am *adding* to `-21` rather than executing it.

**And the hazard that makes P0 first, which nobody has hit yet only because nothing is protected:** the repair commit
is on `master` **locally and unpushed**, and `master` has **no protection at all** [inherited: `-21` B3,
`gh api …/branches/master/protection` → 404]. Required status checks on a branch apply to the **push**, not only to a
merge. Turn the gate on first and the very next thing that happens is that the push carrying the repair — the push that
would let the checks pass — meets a required check that has never run on that SHA. **A gate whose first act is to
refuse the commit that clears the debt is the gate Daniel deletes on a Friday afternoon**, which is the exact failure
`-21` §1 was written to avoid. So: push, watch CI, *then* protect.

---

## G1 · the gated job, and where the exclusion list lives

`.github/workflows/ci.yml` at the mount carries five jobs, names read at 15:0xZ: `Lint & Type Check` (line 17),
`Unit & Integration Tests` (44), `Emulator Tests (Firestore + Auth)` (65), `Build Check` (94),
`E2E Smoke (Playwright)` (114). `package.json` has `test = vitest run`; `test:ci = vitest run && playwright test`.

**Add one job. Change none of the five.** The existing `Unit & Integration Tests` job stays exactly as it is — it runs
the whole suite and it stays **not required**, so the full number remains visible on every push instead of being hidden
behind the subset. When the exclusion list reaches empty, that job becomes the required one and `Gated Unit Suite` is
deleted (`-21` §2(c)); until then, both run.

**The list is a file, not a config literal — `ci/gated-suite-exclusions.txt`.** One repo-relative test path per line,
`#` comments allowed. It is installed with exactly these seven, which are the seven red files of `-16` §3
[inherited: GREEN-REPAIR's `§Git` numstat and its R1–R4 sections]:

```
src/lib/mcp/tools/__tests__/library.test.ts
src/lib/__tests__/sync-engine-songs-mirror.test.ts
src/components/performance/__tests__/public-view.test.tsx
src/components/performance/__tests__/perform-cls.test.tsx
src/lib/books/__tests__/lookup.test.ts
src/lib/books/__tests__/registry.test.ts
src/lib/mcp/tools/__tests__/books.test.ts
```

Observed at the Cowork mount at 15:0xZ, working tree at `1bb4c775f2`: all seven paths exist as written, and both
`registry.test.ts` files exist — **`src/lib/org/__tests__/registry.test.ts` is a different, green, out-of-scope file and
is NOT on this list** (`-10`: an order names its file in full).

A file rather than a literal for three reasons: a reviewer can see the debt as a list of names; the remove-only guard in
G2 has something to diff; and `wc -l` is the debt's count. Read it from a `vitest.gated.config.ts` that imports the base
config and sets `test.exclude` to the base excludes **plus** these lines — never by re-listing the base excludes, which
would silently drop `vitest.config.ts:60`'s emulator exclusion and pull `*.emulator.test.ts` into a job with no
emulator.

**The job's name is load-bearing.** Branch protection pins a check by its **name** string, so `Gated Unit Suite` must be
stable and must not be re-worded later without the same `gh api` call being re-run — a renamed job silently becomes a
check that is required and never reports, which blocks every push with no failure to read. Say the name back in the
return exactly as it appears in the workflow and exactly as it appears in the protection call.

## G2 · the remove-only guard, and the negative control that proves it works

`-21` §2(c): the list is **REMOVE-ONLY**. Adding a file to it is the same act as hiding a bonded row — the number
improves and the thing the number was for is gone — so an addition is never a lane's and never a wave's; **it is
Daniel's, in a ruling.**

The guard is a step in the `Gated Unit Suite` job that compares the file against its own previous state and **fails on
any added line**: on a `push` to `master`, against `HEAD^`; on a `pull_request`, against the merge base with the base
ref. Removals pass. Reorderings and comment edits pass. The failure message names
**`R-0904-live-cw-21` §2(c)** and says in one sentence that an addition needs a ruling from Daniel, so whoever meets it
at 22:00 on a Friday learns what to do from the failure itself.

**It states the property it protects** (`R-0904-live-cw-1`): *the counted debt never grows without a ruling.* **It
reports its own denominator** (`-11`): the line count before, the line count after, and whether the file was touched by
this push at all — because a guard that prints nothing on the 99 pushes that do not touch the file is
indistinguishable from a guard that is broken.

**And it is MADE TO FIRE before it is trusted** (`R-0903-live-cw-9`): on a throwaway branch, add one line to the file,
push, and quote the failing step's output in the return; then delete the branch. A guard whose failure branch has never
been executed is a guard nobody has run — this program has already retired one of those.

## G3 · the numbers, and the precondition that can stop this order

Both of `-21` §3's preconditions are measured here, and neither is optional.

**(a) The gated subset's own numbers.** Run `vitest.gated.config.ts` and report **both label lines verbatim, with their
labels** (`-16` §3) — the `Test Files` line and the `Tests` line — at the mount and in CI, and **green on three
consecutive runs** before G4. Three runs, not one, because GREEN-REPAIR's own two after-runs disagreed by one test and
the disagreement was a load flake (`pdf-viewer`, width-0) [inherited: same return, §The fourth red]. A required check
whose flake rate is unknown is a required check that will block a clean wave.

**(b) `-16` §4's skip drift is resolved.** CI reported `339 passed | 9 skipped` where the mount reported
`342 passed | 6 skipped` — **three files skip in CI that run locally** [inherited: `-16` §4]. Name those three files.
Then either remove the difference, or pin the gated job so both environments agree on the same skip set, and say which
you did and why. **If you cannot do either in this wave, STOP and return** — do not make a check required on a number
that moves between environments. That is not caution for its own sake: a required check whose number cannot be
reproduced at the mount is a check that gets argued with the first time it blocks someone, and the argument is won by
whoever is in a hurry.

## G4 · the act, its tool, and its undo

**Tool** — the slug is read, never assumed: `gh repo view --json nameWithOwner`, then
`gh api -X PUT /repos/<slug>/branches/master/protection` with `required_status_checks` = `{strict: false, contexts:
["Build Check", "Gated Unit Suite"]}`, `enforce_admins: false`, `required_pull_request_reviews: null`,
`restrictions: null`, `allow_force_pushes: false`, `allow_deletions: false`.

**Undo** — `gh api -X DELETE /repos/<slug>/branches/master/protection`, which restores exactly today's state (no
protection) in one call, in seconds. That is why this is offerable rather than arguable, and the undo goes in the return
where the next tired hand will find it.

**Three deliberate choices, each with its reason:**

- **`contexts` is exactly those two strings.** Not `Lint & Type Check` (red in all seven sampled runs [inherited: `-16`
  §2] — requiring it closes `master` today), not `Emulator Tests`, not `E2E Smoke`. `Build Check` is green in six of
  seven samples and **red in one**, so it has a real historical block rate rather than a decorative one.
- **`strict: false`.** `strict: true` requires the branch be up to date before every push, which turns each of Daniel's
  pushes into a rebase dance for a benefit this gate does not need.
- **`enforce_admins: false` — and this is the Friday-night valve.** If the band is on the bimah and something must ship,
  an admin can still push. A gate that cannot be stepped over in an emergency gets removed permanently instead of
  stepped over once, and then the congregation has no gate at all. Record in the return that the valve exists and that
  using it is visible in the audit log.

## G5 · the gate is observed to block, once

Open a PR from a throwaway branch with a one-line edit that makes a **non-excluded** test fail. Observe the merge
blocked by `Gated Unit Suite`, quote what the PR page and `gh pr checks` say, then close the PR and delete the branch.
**Merge nothing.** The whole argument of `-21` §1 against gating later was that the mechanism's first live exercise
should not be the wave most likely to need it — so it is exercised here, on purpose, on a change designed to be thrown
away.

## G6 · the first removal, and why the list installs at seven and not two

`R-0904-live-cw-23` §2: **the list installs at the seven `-21` named.** Daniel adopted a shape whose exclusion list was
the seven red files; installing two instead would be quietly substituting my own newer measurement for the thing he
agreed to, and — because the guard is remove-only — it would leave the program with **no way back** if one of the five
turns out red in CI. Seven is the safe direction of the same decision.

Then, in this same wave, **remove the five that CI proves green at the pushed SHA** — removal needs no ruling. What
remains is the real debt, two files:

```
src/lib/books/__tests__/registry.test.ts
src/lib/__tests__/sync-engine-songs-mirror.test.ts
```

Observed at 15:0xZ from GREEN-REPAIR's after-run 2 (`Test Files 2 failed | 347 passed | 6 skipped (355)`,
`Tests 3 failed | 4007 passed | 78 skipped (4088)`, at `1bb4c775f2`): the three remaining reds live in exactly these two
files — `registry.test.ts:175` and `:119`, both catching the class-2 folio (`R-0904-live-cw-27`), and S1 in the
sync-engine mirror test, left red under R2's STOP clause (`R-0904-live-cw-28` now rules the behaviour question behind
it). **CI, not the mount, is the authority for a removal** (`-16` §4 is why): a file comes off the list only when the
gated job has reported it green in CI, and the run id goes in the return next to the removal.

**Do not remove `registry.test.ts` or the sync-engine mirror test.** They are the debt. They leave the list when
`R-0904-live-cw-27`'s folio is answered from a printed page and `-28`'s S1 assertion is rewritten — each in its own
wave, each on evidence.

---

## What this order does not do

No catalog row is read or written — no chart tool is invoked at all. No rename: the seven pairs are
`HANDOFF-CODE-LIVE-PAIR-NAMES-2026-09-04.md`, wave 3, and it waits for this one. No `src/**` behaviour change; the only
files this order may touch are `.github/workflows/ci.yml`, the new `ci/gated-suite-exclusions.txt`, the new
`vitest.gated.config.ts`, `vitest.config.ts` **only if** G3(b) requires it, `package.json` scripts, plus the return and
the board row. No test is edited, deleted, skipped or renamed — if the gated subset is red for a reason G6 does not
explain, that is a finding for this desk, not a repair for this wave.
