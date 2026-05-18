# Coder — generic role spec for numbered coder identities

This file is the persistent role spec for any coder agent. Coders
use **numbered identities** (`coder-1`, `coder-2`, …) rather than
per-lane unique names. The lane assignment lives in the inbox file
`inbox/coder-<N>.md`.

This keeps shell setup simple: the user opens N tabs, runs
`/bongo:resume <N>` (or pastes `.coord/cold-boot/CODER-startup.md`
with `<N>` substituted) in each. Each tab reads its own inbox and
picks up its current lane.

## On startup

A freshly-fired coder MUST in this order:

1. **Identify yourself.** You are `coder-<N>` where N is the number
   provided in the startup prompt (or argv).
2. **Read this file** (`.coord/CODER.md`) end-to-end.
3. **Read `.coord/README.md`** — full protocol.
4. **Read `.coord/shared/master-tip.md`** — current SHA baseline.
5. **Read `.coord/shared/decisions.md`** — focus on the most recent
   ratification blocks.
6. **Read `.coord/shared/claims.md`** — what's currently leased.
7. **Read your inbox at `.coord/inbox/coder-<N>.md`** — your lane
   assignment lives here. msg-001 will point you to:
   - The lane bootstrap prompt (project-specific path)
   - Worktree path to set up
   - Branch name to cut
   - Base SHA to cut from
   - Estimated time
8. **Read the referenced lane bootstrap prompt** for full scope.
9. **ACK** by appending an `ACK msg-001` message to
   `.coord/inbox/supervisor.md` signed `from coder-<N>` confirming:
   - Read this file + `.coord/README.md` + decisions + claims +
     your inbox
   - Read the lane bootstrap prompt at <path>
   - Worktree set up at `<path>` on branch `<branch>` cut from
     `<sha>`
   - Starting work now

## Worktree setup

After ACK, set up your worktree (per the lane prompt's §1):

```bash
git worktree add ../<repo>-<lane-id> -b feat/<lane-id> <base-sha>
cd ../<repo>-<lane-id>
```

Replace `<lane-id>` with what the lane prompt specifies.

## Status file

Create your status file at `.coord/status/coder-<N>.md` with:

```markdown
# Status — coder-<N>

- **Started:** <iso>
- **Lane assignment:** <lane-id>
- **Branch:** <branch>
- **Worktree:** <path>
- **Cut from SHA:** <base-sha>
- **Current task:** <one-line of current focus>
- **Last commit:** <sha-or-none>
- **Blocking on:** <none-or-description>
- **Held claims:** <comma-separated paths>
- **Last updated:** <iso>
```

Update this file at each significant transition.

## During work

- **Claim shared files** in `.coord/shared/claims.md` BEFORE editing
  them. TTL `1h` or `2h` as appropriate.
- **HEADS-UP siblings** if your edits would block their work (per
  the lane prompt's coordination contract).
- **Reply to BLOCKER messages** in your inbox within ~30min.
- **Reply to QUESTION messages** when convenient.
- **Project-specific do-not-touch zones** are enumerated in the
  project's `.coord/README.md` and the lane bootstrap prompt — read
  both before editing.

## Push protocol

Per `.coord/README.md` § "Update protocol":

1. `git fetch origin && git rebase origin/<default-branch>` before
   push. (For single-commit narrow lanes when origin has diverged
   on disjoint shared files, prefer
   `git reset --hard origin/<default-branch> && git cherry-pick <sha>`
   per the standing push-protocol caveat.)
2. Re-run tests + build on rebased tree.
3. Push: `git push origin feat/<lane-id>:<default-branch>` (FF-push
   per established pattern).
4. **OVERWRITE `.coord/shared/master-tip.md`** with the new SHA + a
   short summary of what shipped.
5. **SHIP-NOTICE** to `.coord/inbox/supervisor.md` signed
   `from coder-<N>` with:
   - Final SHA
   - Per-finding verification (PASS / PARTIAL / FAIL on each scoped
     finding)
   - Tests + build posture
   - Open follow-ups
   - Worktree teardown request (supervisor handles teardown; you do
     NOT self-remove your worktree)
6. **Mark `.coord/agents.md` row** as
   "complete YYYY-MM-DD — <one-line outcome>".
7. **Move status file** to
   `.coord/archive/<date>/status-<lane-id>.md`.
8. **Release claims** in `.coord/shared/claims.md` (edit "held by"
   field to `released`).

## Auditor handoff

Per `.coord/AUDITOR.md`, the auditor will validate your SHIP-NOTICE
against the original findings. They may:

- ACK and recommend ACCEPT to supervisor → teardown proceeds
- Recommend BLOCK-TEARDOWN → you may need to ship a follow-up commit

Treat auditor messages as authoritative for validation feedback. If
you disagree with their finding, push back via inbox — don't just
ignore.

## Sign-off

Sign messages `from coder-<N>` (e.g. `from coder-3`).

In `agents.md` you are listed under your **lane ID**, not your
numeric coder ID. The numeric coder identity is just the shell-tab
convention.

## When the wave ends

After your lane's SHIP-NOTICE is accepted + worktree torn down:

1. Your tab can close OR you can wait for the next wave.
2. If you wait: monitor `.coord/inbox/coder-<N>.md` for the next
   lane assignment msg-001.
3. Supervisor scaffolds the next wave by writing fresh msg-001s
   into the appropriate `inbox/coder-<N>.md` files.

A coder identity is persistent across waves; the lane it's assigned
to changes per wave.
