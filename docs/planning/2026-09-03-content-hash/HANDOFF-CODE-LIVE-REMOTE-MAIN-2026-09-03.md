# ORDER → `live` (Code): delete the stale remote `main`, and ask the right instrument first

Lane: **live-cw (Opus Cowork)** · **Executor: `live`**, host-side in `~/CentralReform.live` (rule 8 addendum)
Authority: **R-0903-live-cw-3 §1** (the deletion, and the guard that governs it) · R-0901-vision-5 §2 (the half
that has stood open since 09-01) · rules 1, 4, 8, 11, 15, 18 · R-0803-168 (an inherited measurement is a premise)
Status: DISPATCHABLE. **This order writes to GitHub and to nothing else** — no `src/` file, no Firestore document,
no deploy, no local commit. Daniel is not needed: he ruled it at the keyboard on 2026-09-03 and his words are in §1.
Verified-against: `9933d2abef` [inherited: your 02:0xZ row, which confirmed that sha host-side as equal to
`origin/master`, and your 02:3xZ row, which reports no deploy since] — **re-confirm host-side before D1 and say so.**
Tier: CLOSED — it is irreversible from outside this repo and it carries a stated expected outcome.
NEXT: D1 ask GitHub whether `main` is still behind → D2 delete the ref → D3 re-verify the default branch and the
absence → D4 return.

---

## 1 · Why, in Daniel's words

*"an old legacy piece that was not intended, and needs to get cleaned"* — Daniel, 2026-09-03, relayed by the vision
seat [inherited: the vision seat's 17:1xZ board row, which records his answers on the standing satellite list].
This is way **(b)** of your own `HANDOFF-CODE-SATELLITE-DEPLOY-RETURN-2026-09-01.md`, and it closes the last open
half of R-0901-vision-5 §2. `satellite-deploy` could not finish it because the act was refused by that session's
permission classifier — **not because anything about it was in doubt.**

## 2 · The guard is not "is it safe", it is "which instrument do you ask"

Your own deploy lane wrote the reason this order has a mechanism at all. Asked locally whether `main` held anything
unique, git answered **"main has 1 commit master lacks"** and reported a merge-base of the asking lane's own HEAD —
an impossible answer. That checkout is **shallow, with 64 grafted boundary commits**; `main`'s tip is one of them,
and local `master` has a truncated depth of **2**. Every ancestry computation in that tree is unreliable.

```
gh api repos/RavBogard/sheet-music-app/compare/master...main --jq '{ahead_by,behind_by,status}'
```

**Observed by `satellite-deploy` on 2026-09-01, at that lane's HEAD `ba119f1415`: `{ahead_by: 0, behind_by: 1210,
status: "behind"}`** [inherited: that return, §"R-0901-vision-5 §2"]. **That figure is a PREMISE, not this order's
guard.** It is two days old, `master` has moved since, and `behind_by` will have grown — which is why the number is
not asserted anywhere below. **What is asserted is an identity you measure yourself at the moment of deletion:
`ahead_by` must read 0.** If it does not, `main` has acquired something `master` lacks since 09-01 and this order
is wrong: stop, apply nothing, return it (R-0903-live-cw-3 §1).

## 3 · D1–D4 · The wave

- [ ] **D1 · Ask GitHub, not the clone.** Run the compare above. Record the whole `{ahead_by, behind_by, status}`
      object in your return, verbatim. **`ahead_by == 0` or STOP.** Do not compute ancestry locally for any purpose
      in this order, not even as a cross-check — a lying instrument does not become useful by being second.
- [ ] **D2 · Delete the ref.** `git push origin --delete main`, host-side. If your session's permission classifier
      refuses it as it refused `satellite-deploy`'s, **do not work around it and do not try another route**: append a
      board row whose body begins `BLOCKED:` and names the exact command (rule 8, R-0903-vision-2), and return.
      A second lane blocked by the same classifier is information Daniel needs; a clever bypass is not.
- [ ] **D3 · Re-verify both properties, after.** The default branch still reads `master`, and `main` is gone from
      the remote. Two independent reads — GitHub's own view and the remote as your clone sees it.
- [ ] **D4 · Return.** `RETURN-CODE-LIVE-REMOTE-MAIN-2026-09-03.md`, plus a CLOSED board row. The default-branch
      readings before and after, the compare object, and the post-delete branch list are the return's content.

## 4 · Guards that can fail

**G1 · `ahead_by == 0`, measured at execution.** The instrument is GitHub's compare API; the value is an identity,
not a remembered number. **The one figure this order inherits — `{0, 1210, behind}` — was observed by
`satellite-deploy` on 2026-09-01 and is recorded in §2 as a premise, at the sha named there.** FAIL: anything but 0.

**G2 · The default branch is `master` before AND after.**

```
gh api repos/RavBogard/sheet-music-app --jq .default_branch
```

**Observed by `satellite-deploy` on 2026-09-01 at `ba119f1415`: `master`, which is why that lane skipped the
`-f default_branch=master` PATCH the original order carried — it was already correct** [inherited: that return, item 1].
Read it twice here, either side of D2, and print both. FAIL: any value but `master`, at either reading.

**G3 · The ref is actually gone, from two instruments.** Run `git ls-remote --heads origin main` after D2; it must
print nothing. **This one carries no transcript and does not get a fabricated one** — it is a post-condition of an act
that has not happened yet, so its value is knowable only after D2 and only on your machine. It is written inline rather
than as a guard block for exactly that reason (R-0803-690.3: a value nobody executed is a premise; a post-condition is
neither, and dressing one up as a transcript is how a lint gets lied to).
Cross-check it against `gh api repos/RavBogard/sheet-music-app/branches --jq '[.[].name]'`, which must not contain
`main`. FAIL: either instrument still sees the branch.

**G4 · Nothing else moved.** Local `HEAD` is the same sha before and after; `git status` is as clean as you found it;
no deploy was triggered. **This order changes one remote ref and nothing else.** FAIL: any local change you did not
make deliberately, in which case say what it was rather than reverting it silently.

**G5 · The standing Rosh Hashanah read, because it costs one call.** `list_books` → `shirei-tshuvah` **184 / `feed`**.
A branch deletion cannot touch it; that is exactly why a disagreement here would mean something else is wrong.
**Read-only.** [inherited: the 02:3xZ row, which last reported this green.]

## 5 · Recovery, if it is ever wanted back

The tip is recorded and the branch is one API call away from existing again:

```
main = c60f4681f0cae08f9415374611fb9c5daac008c3
gh api -X POST repos/RavBogard/sheet-music-app/git/refs \
  -f ref=refs/heads/main -f sha=c60f4681f0cae08f9415374611fb9c5daac008c3
```

[inherited: `HANDOFF-CODE-SATELLITE-DEPLOY-RETURN-2026-09-01.md`, the recovery anchor recorded there when the
deletion was first attempted.] **Copy this block into your return** — a recovery command that lives only in an order
nobody re-reads is not a recovery command.

## 6 · Stop conditions

- **STOP if `ahead_by` is not 0.** Not a judgement call, not a "probably fine": the premise changed, the order is
  wrong, hand it back (rule: a mismatch is the order being wrong, never the executor's to fix).
- **STOP if the classifier refuses D2.** `BLOCKED:` row, exact command, return. No alternate route.
- **Nothing else in this repo is in scope.** Not the six stale book fixtures, not the nine pre-existing red tests,
  not the `firestore.rules` dangling comment, not `_to_delete/` — those are queued elsewhere and stay there.
- **No deploy, and no touching `HANDOFF-CODE-LIVE-CONTENT-HASH-2026-09-03.md`'s territory.** That order is separate,
  amended today, and opens on its own.

Claude records; Daniel decides.
