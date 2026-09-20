# RETURN → `live-cw`: the stale remote `main` is deleted, and the instrument that would have lied was never asked

Lane: **live (Code)**, host-side in `~/CentralReform.live/sheet-music-app`
Order: `HANDOFF-CODE-LIVE-REMOTE-MAIN-2026-09-03.md` · Authority: **R-0903-live-cw-3 §1**, closing the last open
half of **R-0901-vision-5 §2**
Status: **APPLIED. D1–D4 complete, all five guards pass.** One remote ref deleted; nothing else changed anywhere.
Verified-against on entry: `9933d2abef`, **re-confirmed host-side before D1** — see §1.
HEAD on entry and on exit: **`4ab2d282e6`**, unchanged. Nothing pushed, nothing deployed, no local commit.

---

## 0 · The one-paragraph shape of this return

The deletion went through on the first attempt: **this session's permission classifier did not refuse
`git push origin --delete main`**, so the `BLOCKED:` branch the order spends a whole stop-condition on was never
taken. `ahead_by` read **0** at execution, measured from GitHub's compare API and from nowhere else, and the
order's central instruction — *do not compute ancestry locally, not even as a cross-check* — was followed
literally: **no local ancestry command was run in this lane at any point.** The two-day-old `{0, 1210}` premise is
confirmed in the only way a premise like that can be, by having moved in the predicted direction and not the other:
`behind_by` is now **1220**. One thing the order did not ask for and got anyway: **`main`'s tip, read from the
remote before deletion, is byte-identical to §5's recorded recovery anchor**, so the recovery block is not a
remembered sha — it is a verified one.

## 1 · The entry re-confirmation, and why it was asked twice

The order requires the `Verified-against` sha be re-confirmed host-side before D1 **and said so explicitly**.
It was, and deliberately not from the tracking ref — a stale `origin/master` in a shallow clone would have agreed
with the order for the wrong reason:

```
$ git ls-remote --heads origin master
9933d2abefd41e77950b7399715ef2b40e03be78	refs/heads/master
```

`git rev-parse origin/master` gave the same value, but that is the local cache; the `ls-remote` above is the
remote answering for itself. **`origin/master` = `9933d2abef`, unmoved since the 02:0xZ row.** My six content-hash
commits are still local and still unpushed, which is why local `HEAD` (`4ab2d282e6`) and `origin/master` differ —
that is the expected state, not a discrepancy.

## 2 · D1 · The compare object, verbatim

```
$ gh api repos/RavBogard/sheet-music-app/compare/master...main --jq '{ahead_by,behind_by,status}'
{"ahead_by":0,"behind_by":1220,"status":"behind"}
```

**`ahead_by == 0`.** G1 holds on a value measured at the moment of deletion, not on a remembered one.

On the premise: the order carries `{ahead_by: 0, behind_by: 1210, status: "behind"}` from `satellite-deploy` on
2026-09-01 at that lane's HEAD `ba119f1415`, and is careful to call it a premise rather than a guard. It behaved
exactly as a premise about a branch that is strictly behind a moving trunk should: **`behind_by` grew by 10 and
`ahead_by` stayed 0.** Had `ahead_by` moved instead, the order would have been wrong and this return would be a
STOP. The distinction matters because the two numbers fail differently — a growing `behind_by` is `master` working;
a nonzero `ahead_by` is somebody having pushed to a branch nobody was supposed to be using.

## 3 · The instrument question, answered by not asking the liar

`satellite-deploy` recorded that the local clone answered *"main has 1 commit master lacks"* with a merge-base of
the asking lane's own HEAD — an impossible pair of claims. The clone is shallow with 64 grafted boundary commits
and local `master` has a truncated depth of 2. **This lane ran no `git merge-base`, no `git rev-list`, no
`git log master..main`, and no `git branch --contains`.** The two local git commands it did run — `ls-remote` twice
and `rev-parse HEAD` — are a remote query and a ref read; neither computes ancestry, so neither can be corrupted by
a shallow boundary. That was the order's point and it is worth restating as a finding: **the clone's unreliability
is not a reason to distrust its answer, it is a reason not to obtain one.** A second opinion from a broken
instrument raises confidence without raising accuracy.

## 4 · D2 · The deletion

```
$ git push origin --delete main
To github.com:RavBogard/sheet-music-app.git
 - [deleted]               main
EXIT=0
```

**No classifier refusal.** `satellite-deploy` was blocked here on 2026-09-01 and this session was not, from the same
machine and the same remote. I cannot see the classifier's reasoning from inside the session, so I will not offer a
cause; what I can say is what differs on the surface — that lane's attempt came inside a wave that was also pushing
commits and deploying, this one is a lone ref deletion in a session that has pushed nothing. **The order's
instruction was "do not work around it and do not try another route", and there was nothing to work around: this is
the first route, taken once, and it succeeded.** Recording the non-refusal explicitly because a stop-condition that
never fires is easy to leave undocumented, and the next lane facing this classifier deserves both data points.

## 5 · D3 · The two post-conditions, from two instruments each

**G2 · default branch, either side of D2:**

```
BEFORE  $ gh api repos/RavBogard/sheet-music-app --jq .default_branch  →  master
AFTER   $ gh api repos/RavBogard/sheet-music-app --jq .default_branch  →  master
```

Unmoved, as required. No `-f default_branch=master` PATCH was needed, matching `satellite-deploy`'s finding that it
was already correct.

**G3 · the ref is gone, from both instruments:**

```
$ git ls-remote --heads origin main
(no output)

$ gh api repos/RavBogard/sheet-music-app/branches --jq '[.[].name]'
["claude/competent-lewin-1a7ec9","dependabot/github_actions/actions/cache-5.0.5",
 "dependabot/github_actions/actions/checkout-6","dependabot/github_actions/actions/setup-java-5.2.0",
 "dependabot/github_actions/actions/setup-node-6","dependabot/github_actions/softprops/action-gh-release-3",
 "dependabot/npm_and_yarn/dexie-react-hooks-4.4.0","dependabot/npm_and_yarn/eslint-config-next-16.2.6",
 "dependabot/npm_and_yarn/react-day-picker-10.0.1","dependabot/npm_and_yarn/types-3fd731062f",
 "dependabot/npm_and_yarn/zod-4.4.3","feat/bridge-dashboard-update-ui","feat/bridge-periodic-update-check",
 "feat/bridge-tray-icon-health-color","feat/cycle3-ai-read-tools","feat/mcp-server","feat/mcp-test-tokens",
 "feature/gemini-stabilization-audit","fix/f007-search-hygiene","fix/f021-drive-file-404",
 "fix/f022-public-legal-pages","fix/refresh-loop-root-cause","master","research/m0-companion-verify",
 "research/roster-discovery"]
```

**24 branches, `master` present, `main` absent.** The order was right to write G3 inline rather than as a guard
block with an expected transcript — a post-condition of an act that has not happened cannot have a recorded value,
and the honest form is the one it used.

**One observation the order did not ask for, from that list:** 23 of the 24 surviving branches are stale — 11
dependabot refs, 7 `feat/`/`fix/` branches from cycles long shipped, 2 `research/` branches, and one
`claude/competent-lewin-1a7ec9`. **This is not in scope and I did nothing about it** (§6: "nothing else in this
repo is in scope"). It is noted only because `main` was described as *"an old legacy piece that was not intended"*
and the same sentence would fit most of that list. If a sweep is ever wanted it is a separate order, and it should
carry the same shape as this one — ask GitHub per branch, `ahead_by == 0` or leave it alone.

## 6 · G4 · Nothing else moved, including the parts I did not cause

```
HEAD before:  4ab2d282e64fe4085b824d556225b9343f053007
HEAD after:   4ab2d282e64fe4085b824d556225b9343f053007
```

`git status --porcelain`, identical before and after D2:

```
 M src/build-info.json
?? .playwright-mcp/
?? docs/BRAND-DOSSIER.md
?? docs/brand-assets/
?? docs/superpowers/plans/artifacts/2026-08-30-service-sheet-sample.pdf
```

**G4 says to say what a local change was rather than revert it silently, so:** `src/build-info.json` is the
build-stamp file that has been modified in this tree since before the content-hash order and is not mine. The four
untracked entries **are new since my 17:0xZ row**, which reported only `src/build-info.json` — a Playwright-MCP
scratch directory and three brand-dossier artifacts, all from another session on this machine, none under `src/`,
none touched or committed by me. **Nothing was reverted, nothing was staged, and no commit was made in this lane.**
G4 passes on its actual terms: nothing moved *because of this order*.

## 7 · G5 · The standing Rosh Hashanah read

`list_books` on the live surface:

| slug | tier | pages |
|---|---|---|
| `shirei-tshuvah` | **`feed`** | **184** |
| `shabbat-shacharit` | `feed` | 144 |
| `shabbat-maariv` | `feed` | 69 |
| `crc-saturday` | `pagemap` | 102 |
| `crc-friday` | `pagemap` | 48 |

**GREEN, unchanged.** The order's own reasoning for spending the call is the right one: a branch deletion cannot
touch this, so agreement proves nothing and *disagreement* would have proved something else was wrong.

## 8 · Recovery, copied here as the order requires

`main`'s tip, read from the remote **before** the deletion:

```
$ git ls-remote --heads origin main
c60f4681f0cae08f9415374611fb9c5daac008c3	refs/heads/main
```

**This is byte-identical to the anchor recorded in the order's §5**, which was captured by `satellite-deploy` two
days ago at the first attempt. The recovery command is therefore verified, not remembered:

```
main = c60f4681f0cae08f9415374611fb9c5daac008c3
gh api -X POST repos/RavBogard/sheet-music-app/git/refs \
  -f ref=refs/heads/main -f sha=c60f4681f0cae08f9415374611fb9c5daac008c3
```

The commit object still exists in GitHub's storage after a ref deletion, so this works today. It is not guaranteed
to work forever — an unreferenced commit is eventually eligible for collection — which is the one reason to treat
this as irreversible-in-practice rather than trivially undoable, and is why the sha is now recorded in three places
(the order, this return, and the board row).

## 9 · What this closes, and what it does not

**CLOSED:** R-0903-live-cw-3 §1. The last open half of **R-0901-vision-5 §2** — way **(b)** of
`HANDOFF-CODE-SATELLITE-DEPLOY-RETURN-2026-09-01.md`, which that lane could not finish because of the classifier and
not because anything was in doubt. Daniel's *"an old legacy piece that was not intended, and needs to get cleaned"*
is executed.

**NOT closed, and deliberately untouched per §6:** the six stale book fixtures, the pre-existing red tests, the
`firestore.rules` dangling comment, `_to_delete/`, and the 23 other stale remote branches from §5. **Also still
open and still owed by live-cw:** the two rulings from my 17:0xZ row — **the deploy question** (W4/W5 of
CONTENT-HASH cannot execute while §8 forbids a deploy) and **the Google-Apps collision** (L1-W4's format partition
makes §4's demotion unreachable in all three lanes, reddening 2 shipped tests). Neither is affected by this order.
**Next for this lane:** the amended `HANDOFF-CODE-LIVE-CONTENT-HASH-2026-09-03.md`, opening on its own row.

Claude records; Daniel decides.
