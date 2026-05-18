# /bongo: project — Phases 2-4 roadmap

**Date:** 2026-05-19
**Author:** supervisor (post-Phase-1-ship, ratification-pending)
**Status:** DRAFT — Daniel ratifies sequencing + dispatches lanes
**Parent design:** `sheet-music-app/.paul/research/2026-05-19-cold-boot-skill-pack-DESIGN.md`
**Memory anchor:** `[[project_bongo_portability]]`

---

## Where we are after Phase 1

✅ Phase 1 shipped (`db89e5ba7`): `/bongo:resume <boss|auditor|1-7>` +
`/bongo:pause` — CRC-local thin pointers over
`sheet-music-app/.coord/cold-boot/*-startup.md`.

✅ User-level install on Daniel's primary machine: copy of the same two
files at `~/.claude/commands/bongo/`. Works from `cwd=centralreform.live/`.

❌ **Doesn't yet work** from any other cwd on this machine (paths
hardcoded). ❌ **Doesn't yet work** on other machines (no distribution).
❌ **Doesn't yet bootstrap** a new project that wants to adopt
`.coord/` (no scaffolder). ❌ **Verb vocabulary** is just `:resume` +
`:pause` — Daniel anticipated `:ship`, `:status`, `:audit`, `:init`,
`:help`.

---

## Phase 2 — Make it portable across projects on this machine

**Goal:** `/bongo:` works from any cwd, against any project that has a
`.coord/cold-boot/` directory at some ancestor of the cwd. CRC stops
being the only thing it knows about.

### 2a — Path generalization (critical path)

Pull `sheet-music-app/.coord/cold-boot/...` hardcoded paths out of
`resume.md` and `pause.md`. Replace with auto-detect logic:

- Walk up from cwd looking for nearest `.coord/cold-boot/` directory.
- Fall back to an explicit `--repo <path>` arg if not found.
- Fail gracefully with a helpful message if neither resolves.

Both command bodies need the same detection prose. Likely factored as
a shared prose block that the LLM follows during resolve.

**Files touched:** `~/.claude/commands/bongo/resume.md`, `pause.md`
(and the git-tracked copies at
`sheet-music-app/.claude/commands/bongo/*` — same content). Plus
re-sync user-level on this machine after the lane ships.

**Estimated:** ~30-45 min.

### 2b — Role-spec template extraction (Phase-3 prep)

Currently the canonical role specs live at:
- `sheet-music-app/.coord/SUPERVISOR.md`
- `sheet-music-app/.coord/AUDITOR.md`
- `sheet-music-app/.coord/CODER.md`
- `sheet-music-app/.coord/README.md`
- `sheet-music-app/.coord/cold-boot/{SUPERVISOR,AUDITOR,CODER}-startup.md`
- `sheet-music-app/.coord/cold-boot/README.md`

These are heavily CRC-specific in places (mentions sheet-music-app,
specific lane names, MEMORY.md cross-refs like
`[[feedback_admin_rate_limit_bypass]]`, etc.).

This phase extracts **generic templates** from them — parameterized
versions where:
- Project name is `<PROJECT_NAME>`
- Repo paths are relative-to-coord-root
- Memory cross-refs are removed or genericized
- Lane-numbering examples stay as patterns, not specific instances

Templates land at `~/.claude/commands/bongo/templates/{supervisor,auditor,coder}-role.md`
(or similar, project-agnostic location). Phase 3 (`/bongo:init`)
consumes them.

**Files touched:** new `templates/` directory under user-level bongo
install. No edits to canonical CRC files (they remain the working
reference; templates are derived snapshots).

**Estimated:** ~1-1.5h (careful read + generic-ify; preserving the
hard-won protocol details while stripping CRC-specifics).

### 2c — `.coord/` gitignore decision

Coder-7 surfaced that `sheet-music-app/.coord/` is gitignored
(`.gitignore:5:/.coord`). Consequence: coord-state updates
(`cold-boot/README.md` edits, decisions.md ratifications, etc.) live
only in canonical and don't sync to GitHub or to other worktrees on a
fresh clone.

**Three options:**

1. **Un-ignore `.coord/`** — let coord state ship with code via git.
   Pros: parallel-agent state survives clones, branch switches, fresh
   checkouts; supervisor's pickup pointers become permanently
   retrievable history. Cons: noisy diffs (claims.md churns every
   lane), inbox messages bloat the repo, decisions.md becomes a
   permanent public record.

2. **Move shipped-surface docs to a tracked location** —
   `.coord/cold-boot/README.md` and similar "this is how /bongo:
   works" docs move to `.claude/commands/bongo/README.md` or similar
   tracked path. Operational coord state (claims, inbox, status)
   stays gitignored. Pros: keeps protocol docs visible; keeps churn
   out of git. Cons: now we have two homes for "how to use /bongo:".

3. **Accept divergence** — `.coord/` stays gitignored; commands are
   self-documenting via their own frontmatter `description:`;
   project-level docs live in CLAUDE.md or README.md only.

**Recommendation:** Option 2 for Phase 2; ship coord-state divergence
as accepted. Phase 4 (distribution) revisits if a `/bongo:` plugin
ships its own bundled docs.

**Estimated:** ~15 min (gitignore edit + a directory rename or two).

### Phase 2 sequencing

Three sub-pieces. Two viable layouts:

**Layout A — single lane (Recommended):** one coder picks up all of 2a
+ 2b + 2c sequentially. ~2-3h total. Cleaner because 2b's templates
benefit from 2a's path-resolution patterns; 2c is a small policy edit
that piggybacks. One commit, one SHIP-NOTICE, one auditor verdict.

**Layout B — two concurrent lanes:** 2a (path-generalize) + 2b
(templates) in parallel; 2c folded into 2a. ~1-1.5h wall-clock. Riskier
because 2b will probably need to peek at 2a's resolution patterns to
write good templates.

---

## Phase 3 — `/bongo:init` scaffolder

**Goal:** A fresh project that wants to adopt the `.coord/`
parallel-agent system runs `/bongo:init` from its repo root. The
command creates the full `.coord/` directory structure populated from
the templates extracted in Phase 2b.

**What it generates:**
- `.coord/README.md` (protocol — populated from generic template)
- `.coord/SUPERVISOR.md` (empty Running log, role spec inline)
- `.coord/AUDITOR.md` (empty Running log, role spec inline)
- `.coord/CODER.md` (generic role doc)
- `.coord/cold-boot/{SUPERVISOR,AUDITOR,CODER}-startup.md` (paste fallbacks)
- `.coord/cold-boot/README.md`
- `.coord/shared/{master-tip,decisions,claims}.md` (empty headers)
- `.coord/inbox/{supervisor,auditor}.md` (empty headers)
- `.coord/status/` (empty)
- `.coord/archive/` (empty)
- `.coord/agents.md` (empty table)

**Behavior:**
- Refuses if `.coord/` already exists (no clobber).
- Prompts Daniel for `<PROJECT_NAME>` to substitute into templates.
- Optionally adds `.coord/` to project's `.gitignore` per Phase 2c
  decision (or asks).

**Files added (in the bongo install, not the target project):**
- New `~/.claude/commands/bongo/init.md` (the slash command).

**Estimated:** ~1.5-2h. Depends on Phase 2b templates landing first.

---

## Phase 4 — Cross-machine distribution

**Goal:** Daniel can install `/bongo:` on a fresh machine with one
command. Updates propagate via git pull.

### 4a — GitHub repo

Spin up `github.com/<owner>/bongo` (or similar) containing:
- `commands/bongo/{resume,pause,init}.md` — the user-level slash commands
- `commands/bongo/templates/{supervisor,auditor,coder}-role.md` — the templates
- `README.md` — install instructions, role overview, verb reference
- `CHANGELOG.md` — versioned releases as the verb vocab expands
- `install.sh` (or Windows `.ps1` equivalent) — copies into
  `~/.claude/commands/bongo/` from a clone

**Decision:** repo name. `bongo` is provisional. Alternatives:
`coord-agents`, `parallel-coord`, `crc-coord` (CRC-prefixed, doesn't
fit cross-project ambition), or something else.

### 4b — Install script

```sh
# Pseudocode
git clone https://github.com/<owner>/bongo ~/.bongo
~/.bongo/install.sh
# → copies commands/bongo/* into ~/.claude/commands/bongo/
# → optionally symlinks if available
```

Re-installable / re-runnable (idempotent).

### 4c — Versioning / update story

- Git tag releases (`v0.1.0`, `v0.2.0`, etc.).
- `/bongo:version` (new verb?) reports the installed version.
- Update flow: `cd ~/.bongo && git pull && ./install.sh`.

**Estimated:** ~2-3h (repo setup + install script + README + initial
commit).

### Open question for Phase 4

Should we publish as a **Claude Code plugin** (if such a format exists
in the marketplace today) instead of a hand-rolled GitHub repo? Plugins
get richer discovery and update affordances. Need to research current
plugin SDK before committing.

---

## Anticipated verb-vocabulary expansions (post-Phase 4)

Daniel flagged the verb set is open-ended. Likely future verbs:

- **`/bongo:ship`** — coder runs to write a structured SHIP-NOTICE +
  update master-tip.md + release claims. Currently manual prose; the
  protocol is fully specified in `.coord/README.md`, so this is
  scriptable. Lane 2's missed SHIP-NOTICE (post-Phase-1 incident) is a
  good motivation.
- **`/bongo:status`** — any role runs to dump current `.coord/` state
  (master-tip, active agents, open inbox, claims). Supervisor's
  "check in" answer codified.
- **`/bongo:audit <sha>`** — auditor runs to validate a specific SHA
  against findings. Bundles the regression-sweep ritual.
- **`/bongo:claim <path>`** — append a row to claims.md atomically.
- **`/bongo:release <path>`** — flip held-by → released atomically.
- **`/bongo:help`** — list available verbs + brief usage.

Each is a small (~20-line) command file. Easy to ship one-at-a-time
once Phase 2 generalizes paths.

---

## Recommended dispatch order

Given Daniel's "up to 2 concurrent lanes" ceiling and the dependency
graph:

**Wave A (now or next, can dispatch in parallel):**
- Lane 8 = **Phase 2** combined (2a + 2b + 2c, Layout A). One coder.
- Lane 9 = optional concurrent — pick one of:
  - **`/bongo:status` verb** (independent of Phase 2 path work — can
    hardcode `sheet-music-app/.coord/` for now and re-generalize when
    Phase 2 lands)
  - **`/bongo:ship` verb** (same reasoning; coders need this NOW given
    Lane 2's protocol gap)
  - **Phase 4 GitHub repo skeleton** (independent of Phase 2 since
    the repo is just packaging; can start scaffolding while Phase 2
    paths are still in-flux)

**Wave B (after Wave A ships):**
- **Phase 3** (`/bongo:init`) — depends on Phase 2b templates landing.
- **Phase 4 distribution** — depends on Phase 2a path-generalization
  (so the distributed commands actually work).

**Wave C+:** Iterate verb vocabulary as need surfaces.

---

## Decisions Daniel needs to make

1. **Dispatch first lane = Phase 2 combined (Layout A)?** Or
   different priority?
2. **Concurrent Wave-A second lane = `/bongo:status` OR `/bongo:ship`
   OR Phase 4 skeleton — OR none (keep it serial)?**
3. **Namespace name lock.** `bongo` is provisional. Final name before
   GitHub-repo creation?
4. **GitHub repo owner.** `dsbogard/bongo`? Org? Other?
5. **Phase 2c gitignore decision.** Recommendation = Option 2 (move
   shipped-surface docs to tracked location). Ratify, amend, or pick
   Option 1 / 3?
6. **Phase 4 plugin question.** Research Claude Code plugin format
   before committing to hand-rolled GitHub install?
