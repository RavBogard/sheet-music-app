# Parallel Agent Coordination

Lightweight inter-agent comm for parallel Claude Code sessions
working on the same codebase. File-based, no daemon, survives
session restarts. Scales to N agents.

## File layout

```
.coord/
  README.md             ← this file (protocol spec)
  agents.md             ← active agent roster
  SUPERVISOR.md         ← supervisor role spec + Running log
  AUDITOR.md            ← auditor role spec + Running log
  CODER.md              ← generic coder role spec
  status/<id>.md        ← each agent's current state (OWNER overwrites)
  inbox/<id>.md         ← incoming messages to that agent (others APPEND)
  shared/
    claims.md           ← lease table for shared files
    master-tip.md       ← last-known origin/<default-branch> SHA + push timestamp
    decisions.md        ← cross-cutting decisions, APPEND-only
  cold-boot/            ← paste-ready startup prompts (also see /bongo:resume)
  archive/<date>/       ← processed messages moved here periodically
```

## Worktree isolation (mandatory for parallel agents)

The `.coord/` protocol gates **file edits** via `shared/claims.md` —
but it does NOT and CANNOT gate **branch / working-tree state**. Two
parallel Claude Code sessions running in the same checkout will see
each other's local commits in `HEAD`, branch off each other's WIP,
and incidentally carry each other's commits to origin via FF-merges.

**Rule:** every parallel agent beyond the first MUST run in its own
isolated `git worktree`. The first agent stays in the canonical
checkout; agent N>1 gets its own.

**Setup at agent bootstrap (do this BEFORE the new Claude Code
session opens):**

```bash
git fetch origin
git worktree add ../<repo>-<agent-id> origin/<default-branch>
```

Then point the new Claude Code session's cwd at the new worktree.
Update its row in `agents.md` `Worktree` column to the actual
relative path. The agent does its work, pushes to
origin/<default-branch>, and on dissolve the supervisor tears down
the worktree:

```bash
git worktree remove ../<repo>-<agent-id>
```

**Why this works:**
- Each worktree has its own `HEAD` and index. No more branch races.
- `.coord/` lives inside the canonical checkout, but all worktrees
  share the SAME `.git/` so the protocol files + branch refs are
  still visible to every session.
- Pushes serialize at origin via rebase-before-push, same as before.

**Migrating an existing agent that's already in the canonical
checkout:**
- If the agent hasn't cut its current task's branch yet — just have
  it set up a worktree and switch cwd. Cheap.
- If the agent has WIP — `git stash -u` first, set up worktree,
  `git stash pop` in the new worktree.
- If the agent has a committed-but-unpushed branch — `git push -u
  origin <branch>`, tear down + recreate in worktree, fetch + reset.

**Never** rely on `.coord/shared/claims.md` alone for parallel work.
Claims gate files; worktrees gate branches. Both are required.

## Read discipline

Every agent MUST read these files at these moments. NOT on every
tool call — coordination is bursty, not constant.

1. **Session start (mandatory):**
   - `agents.md` — who else is active
   - `status/<your-id>.md` — resume your own work cleanly
   - `inbox/<your-id>.md` — handle pending messages
   - `shared/decisions.md` — catch up on policy
   - `shared/master-tip.md` — know what master is at
2. **Before claiming or editing a shared file:**
   - `shared/claims.md` — confirm nothing else holds it
3. **Before pushing to origin:**
   - `shared/master-tip.md` — rebase if behind
4. **At task boundaries** (cheap re-read):
   - `inbox/<your-id>.md` — catch new messages
5. **On explicit user trigger** ("check inbox"):
   - Whatever they ask you to read

## Write discipline

| File | Write style | Who writes |
|---|---|---|
| `status/<id>.md` | OVERWRITE (latest state only) | Owner only |
| `inbox/<id>.md` | APPEND new message blocks | Anyone (senders); recipient edits message status inline |
| `shared/claims.md` | APPEND new row; edit own row to release | All agents |
| `shared/master-tip.md` | OVERWRITE after pushing to origin | Whoever pushed |
| `shared/decisions.md` | APPEND only | User (or agents transcribing user verbatim) |
| `agents.md` | APPEND a row when joining; edit own row to mark complete | All agents |

Update your `status/<id>.md` at: session start, blocker hit, ship
done, scope change. Not on every tool call.

## Message schema (inbox)

Each message is a markdown block:

```markdown
## msg-<short-id> | from <sender-id> | <iso-utc> | status:<NEW|ACK|RESOLVED>
**Subject:** one-line summary (<80 chars)
**Kind:** REQUEST | HEADS-UP | BLOCKER | SHIP-NOTICE | QUESTION
**Body:**
1-3 short paragraphs. NO chat-noise. Facts, asks, ETAs only.
**Action required:** none | specific ask | reply by <timestamp>
---
```

Message kinds:

- **REQUEST** — "do X for me, here's why". Recipient replies via
  sender's inbox when done or blocked. Update status REQUEST → ACK
  when accepted, → RESOLVED when complete.
- **HEADS-UP** — "I'm about to do X / I just did X, FYI". No reply
  needed. Recipient marks ACK after reading.
- **BLOCKER** — "I'm stuck because X. You can unblock by Y."
  Recipient replies with ETA or punts to the user via
  `shared/decisions.md`.
- **SHIP-NOTICE** — "I just pushed <SHA> to origin touching <files>".
  Recipient rebases if needed, updates own master-tip awareness.
- **QUESTION** — "is X true?" / "should I do A or B?". Recipient
  answers via sender's inbox.

When a recipient handles a message, they edit ITS STATUS inline in
their own inbox file (NEW → ACK → RESOLVED). They do NOT edit
messages in the sender's outbound view (each agent owns their own
inbox).

Periodically (when inbox > ~3KB or weekly): move RESOLVED messages
to `archive/YYYY-MM-DD/<agent-id>.md`. Keeps inbox lean, preserves
audit.

## Claims schema (`shared/claims.md`)

```markdown
| path | held by | claimed_at (UTC) | TTL | purpose |
|------|---------|------------------|-----|---------|
| <path> | <agent-id> | 2026-MM-DDTHH:MMZ | 30m | <purpose> |
```

Rules:

- Claim BEFORE editing a "shared file." If another agent already
  holds it: send them a BLOCKER message via inbox and wait for
  release.
- Release by editing your row's "held by" → "released" or deleting
  the row.
- Claims auto-expire after TTL. Expired claims may be ignored by
  other agents (re-claim if you still need the file).
- File paths repo-relative.
- New files you're creating do NOT need a claim — no contention is
  possible.

Standard shared files worth claiming are project-specific; enumerate
them inline in your project's `.coord/README.md` (e.g. routing
tables, env files, build config, dependency manifests).

## Master-tip discipline

After every successful push to origin, OVERWRITE
`shared/master-tip.md` with:

```markdown
# Master tip

**SHA:** <new-sha>
**Pushed at:** <iso-utc>
**Pushed by:** <your-agent-id>
**Touched:** <comma-separated file paths or brief summary>
```

Before pushing, READ this file. If the SHA differs from your local
master:
```bash
git fetch origin && git rebase origin/<default-branch>
```
…then re-run your tests + build before pushing.

**Narrow-lane caveat (recommended standing rule).** For single-commit
narrow lanes when origin has diverged with disjoint shared-file
activity, prefer:
```bash
git fetch origin
git reset --hard origin/<default-branch>
git cherry-pick <local-sha>
```
over `git rebase origin/<default-branch>`. Rebase replays your
branch's full history and can conflict-storm on files you never
touched. Cherry-picking a single commit onto fresh origin avoids the
replay entirely. Multi-commit lanes still rebase; this caveat is for
single-commit lanes.

When you push, OPTIONALLY post a SHIP-NOTICE message to other
active agents whose work might be affected (only if affected — don't
spam).

## Anti-patterns

- **Don't chat.** "Got it" / "shipping now" / "thanks" — wasted
  turns. Status flags carry the semantics.
- **Don't poll.** Read on the triggers listed above; trust the user
  to ping you on anything urgent.
- **Don't write to another agent's status file.** That's their
  space.
- **Don't claim a file you're not about to edit in the next ~30
  minutes.** Claims aren't reservations.
- **Don't ship without reading master-tip first.**
- **Don't reorganize protocol files** without asking the user — the
  protocol is intentionally rigid so it stays low-overhead.

## When the protocol fails

Confused about a message, a claim, or a decision? STOP, ask the
user in the next conversation prompt. Don't guess. They're the
source of truth on intent.

## Bootstrap (for the very first agent)

Read `agents.md` — if you're not in it, ADD your row before doing
anything else. Then read your inbox (it should have at least a
welcome message from the user). Then proceed with your mission.
