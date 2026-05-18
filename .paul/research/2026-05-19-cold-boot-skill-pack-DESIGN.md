# Cold-boot command-pack — design doc

**Date:** 2026-05-19
**Author:** supervisor (brainstormed with Daniel)
**Status:** Daniel-ratified 2026-05-19 (via brainstorming dialogue)
**Implementer:** coder-7 (lane `cycle5-fixes-7-skill-pack`)

## Goal

Replace the copy-paste cold-boot ritual with PAUL-style namespaced
slash commands. Two verbs cover the full lifecycle:

- `/bongo:resume <role-or-N>` — cold-boot OR warm-resume any role
- `/bongo:pause` — write a pickup pointer; auto-detects current role

The `.coord/cold-boot/*-startup.md` files remain the canonical role
prompts and the paste fallback if `/bongo:` is unavailable in any
session.

## Ratified design choices (brainstorm 2026-05-19)

1. **Scope:** slash sugar now; portable / cross-project packaging is
   a deferred separate effort.
2. **SoT:** thin-pointer commands. `.coord/cold-boot/*-startup.md`
   stays canonical; command bodies redirect there.
3. **Surface:** collapse to TWO files. Cold-boot and warm-resume are
   the same operation (both read latest pickup pointer); pause is
   the only genuinely new verb.
4. **Naming:** `/bongo:` namespace. `boss` is the resume keyword for
   supervisor (supervisor stays the role name internally — no rename
   ripple).
5. **Location:** PAUL pattern — `.claude/commands/bongo/`, not
   `.claude/skills/`. Precedent in repo: `.claude/commands/gsd/`.
6. **Args:** `$ARGUMENTS` body substitution (PAUL precedent at
   `~/.claude/commands/paul/apply.md`).
7. **Pause auto-detect:** at pause time the LLM IS the role (set by
   its startup prompt + sign-off pattern); the command body asks it
   to introspect and write the appropriate artifact. Fallback: ask
   Daniel if unclear.
8. **Validation:** coder-7 smoke-tests in a throwaway agent session.

## Files to write

### `sheet-music-app/.claude/commands/bongo/resume.md`

```markdown
---
name: bongo:resume
description: Wake up or warm-resume a parallel-agent role in the CRC music dashboard coord system. Takes one arg — `boss` (supervisor), `auditor`, or a coder number 1-7.
argument-hint: "[boss | auditor | 1-7]"
allowed-tools: [Read, Bash, Grep, Glob, AskUserQuestion]
---

<objective>
Wake up as the named parallel-agent role and pick up state from `.coord/`.
This serves both cold-boot (first session for a role) and warm-resume
(re-firing after context clear) — both operations are identical: read
the role's persistent home file and the latest pickup pointer.

**When to use:** Starting any new Claude Code session that should act
as supervisor, auditor, or coder-N for the CRC parallel-agent system.
</objective>

<context>
$ARGUMENTS
</context>

<process>
Parse `$ARGUMENTS`:
- `boss` → you are the SUPERVISOR. Read `sheet-music-app/.coord/cold-boot/SUPERVISOR-startup.md` and follow it exactly.
- `auditor` → you are the AUDITOR. Read `sheet-music-app/.coord/cold-boot/AUDITOR-startup.md` and follow it exactly.
- `1` through `7` → you are coder-<N>. Read `sheet-music-app/.coord/cold-boot/CODER-startup.md` with `<N>` substituted to your number, and follow it exactly.
- empty / unrecognized → ask Daniel which role to resume.

Sign messages with the appropriate role: `from supervisor`, `from auditor`, `from coder-<N>`.
</process>
```

### `sheet-music-app/.claude/commands/bongo/pause.md`

```markdown
---
name: bongo:pause
description: Pause the current parallel-agent role and write a pickup pointer so the next session re-fires cleanly. Auto-detects role from in-session persona.
argument-hint: "[optional role override: boss | auditor | 1-7]"
allowed-tools: [Read, Write, Edit, Bash, AskUserQuestion]
---

<objective>
Write a pickup-pointer artifact for whichever role this session has been
acting as, so a future `/bongo:resume <role>` (or context-cleared re-fire)
has a clean handoff.

**When to use:** Before a context clear, an explicit session end, or
when context window is filling up and the role wants to preserve state.
</objective>

<context>
$ARGUMENTS (optional explicit role override; otherwise auto-detect)
</context>

<process>
1. **Identify the current role.** Use `$ARGUMENTS` if provided. Otherwise
   introspect: the conversation's startup prompt and your sign-off
   pattern reveal whether you are supervisor (`from supervisor`),
   auditor (`from auditor`), or coder-<N> (`from coder-N`). If
   unclear after introspection, ask Daniel.

2. **Write the pickup pointer for the identified role:**

   - **supervisor** → prepend a new entry to the "Running log" section
     of `sheet-music-app/.coord/SUPERVISOR.md`, following the §A→§F
     PICKUP POINTER shape established by prior entries (read the most
     recent existing entry as a template — read order, wave state,
     watch list, Daniel-ops queue, standing decisions, go signal).

   - **auditor** → prepend a new entry to the "Running log" section of
     `sheet-music-app/.coord/AUDITOR.md`. Auditor pickup-pointer shape
     is less established; mirror the supervisor §A→§F structure as a
     starting template. Cover: current master-tip baseline, open
     VERIFICATION queue, regression-sweep baselines, memory-drift
     candidates, escalations pending.

   - **coder-<N>** → (a) append a HEADS-UP message to
     `sheet-music-app/.coord/inbox/supervisor.md` announcing the
     pause and any in-flight work that needs coord awareness; (b)
     update `sheet-music-app/.coord/status/coder-<N>.md` with current
     task, last commit, held claims, and a "PAUSED — re-fire via
     /bongo:resume <N>" marker; (c) do NOT tear down the worktree
     (per `[[feedback_worktree_teardown_timing]]` — supervisor handles
     teardown on Daniel's go-ahead).

3. **Report to Daniel** — one line: "Paused as <role>. Pickup pointer
   written to <path>. Ready for context clear or re-fire via
   `/bongo:resume <role-or-N>`."

4. **Standing rules:** never push, never edit `src/`, never modify
   another role's persistent file. Pause is read-mostly + targeted
   append; no destructive ops.
</process>
```

## Files to edit

### `sheet-music-app/.coord/cold-boot/README.md`

The "Optional skill packaging" section currently begins:

> These can be installed later; they're sugar over the paste-able files.

Update to:

> Installed at `sheet-music-app/.claude/commands/bongo/{resume,pause}.md`
> as of 2026-05-19. Invoke via `/bongo:resume <boss|auditor|1-7>` and
> `/bongo:pause`. The paste path (this directory's `*-startup.md`)
> remains the canonical source of truth and the fallback when
> `/bongo:` is unavailable in a given session.

The skill-body sketches earlier in the README (the `.claude/skills/`
variants) are now stale relative to the shipped `.claude/commands/`
implementation; replace them with the actual command-file paths or
delete the sketches entirely.

## Multi-phase roadmap (post-Daniel-2026-05-19 scope expansion)

Daniel committed (side message 2026-05-19, after the initial 2-file
design) that this is **not a single 45-min lane** — coder-7 plus up
to two additional concurrent lanes will continue work until `/bongo:`
is a **fully portable skill installable on multiple projects across
multiple computers**. Likely GitHub-repo distribution. Verb
vocabulary is open-ended (resume + pause is the starting set; ship,
status, audit, init, claim etc. may follow).

**Anticipated phase boundaries** (confirm with Daniel at each
SHIP-NOTICE before committing the next coder):

### Phase 1 — CRC-local thin pointers (this lane, coder-7)

What's in this DESIGN doc above. Two commands at
`sheet-music-app/.claude/commands/bongo/{resume,pause}.md`, point at
CRC-specific `.coord/cold-boot/*-startup.md`. Hardcoded paths. Ships
~30-45 min. Closes the "I'm tired of pasting the cold-boot prompt"
itch immediately.

### Phase 2 — Path-generalize + extract role specs

Pull the CRC-specific paths out of the command bodies. Make
`/bongo:resume` look for `.coord/cold-boot/*-startup.md` relative to
wherever the user invokes from (or accept a `--repo <path>` override).
Extract canonical role specs into the bongo skill itself (so SUPERVISOR.md
/ AUDITOR.md / CODER.md templates ship with the skill, not the
project). At this phase, a fresh project can install bongo and have
the role docs auto-populate.

Likely separate lane (`bongo-portability-1` or similar).

### Phase 3 — `.coord/` scaffolder

Add `/bongo:init` that bootstraps the `.coord/` directory structure
in a new project (creates `SUPERVISOR.md`, `AUDITOR.md`, `CODER.md`,
`README.md`, `shared/{master-tip,decisions,claims}.md`,
`inbox/`, `status/`, `cold-boot/*.md`). One command to scaffold an
entire parallel-agent system into any repo.

### Phase 4 — Cross-machine distribution

Package as Claude Code plugin OR user-level skill living at
`~/.claude/commands/bongo/` (so it follows Daniel across machines
via a single install rather than per-repo). Likely GitHub repo
(`github.com/<owner>/bongo`?) with install instructions. Naming and
distribution mechanism not yet locked.

### Out of scope (deferred even beyond Phase 4)

- Renaming "supervisor" → "boss" internally — explicitly rejected
  2026-05-19; `boss` stays as a slash-command keyword only.
- A web UI / dashboard for parallel-agent state — strictly CLI-only
  pending evidence of need.

## Risks

- **`$ARGUMENTS` substitution syntax.** PAUL precedent at
  `~/.claude/commands/paul/apply.md` uses `$ARGUMENTS` in the `<context>`
  block; coder-7 mirrors that pattern.
- **Pause auto-detect ambiguity.** If a session has acted as more than
  one role (unlikely but possible during testing), introspection may
  be unclear. Mitigation: fallback to `AskUserQuestion`.
- **Auditor pickup-pointer shape undefined.** Only one auditor
  entry exists today. Coder-7 establishes the template; future
  auditor pauses iterate on it.

## Validation plan (coder-7)

1. **Frontmatter/structure parity** — compare written files to
   `~/.claude/commands/paul/{pause,resume}.md` shape. Same
   frontmatter keys (`name`, `description`, `argument-hint`,
   `allowed-tools`); same `<objective>` / `<context>` /
   `<process>` body sections.

2. **Smoke test via subagent.** Spawn an Agent (subagent_type =
   general-purpose) in the throwaway-session context with this
   directive:

   > Without actually performing the role, verify that
   > `/bongo:resume boss` would load `sheet-music-app/.coord/cold-boot/SUPERVISOR-startup.md`
   > and that `/bongo:resume 3` would load `CODER-startup.md` with
   > `<N>` = 3. Report what file path the command would point to
   > for each input. Confirm `/bongo:pause` instructs an auto-detect
   > step. Do NOT push, do NOT edit `src/`.

3. **Paste-fallback regression check.** Confirm that
   `.coord/cold-boot/SUPERVISOR-startup.md`, `AUDITOR-startup.md`,
   `CODER-startup.md` still work as direct-paste prompts (no
   accidental coupling to `/bongo:` introduced).

## Lane coord posture

- Cut from `f6ed276fa` (master tip after Lane 3 a11y ship).
- Branch `feat/cycle5-fixes-7-skill-pack`.
- Worktree `sheet-music-app-cycle5-fixes-7-skill-pack/`.
- No claim contention — no other active lane touches
  `.claude/commands/` or `.coord/cold-boot/`.
- Estimated wall-clock: ~30-45 min (slightly more than the original
  3-skill design because pause's introspection prose needs careful
  writing for all three role variants).
- On SHIP-NOTICE → supervisor relays to auditor for verification →
  on PASS + Daniel go-ahead, supervisor tears down worktree.

## SHIP-NOTICE expected contents

- SHA of single commit on `feat/cycle5-fixes-7-skill-pack`.
- File diff: 2 new command files + 1 edit to `.coord/cold-boot/README.md`
  + this design doc committed alongside.
- Smoke-test result: PASS/FAIL transcript from the throwaway-session
  agent run.
- Recommendation to Daniel: "try `/bongo:resume boss` in a fresh tab
  to confirm it fires correctly on your end before next cold-boot."
