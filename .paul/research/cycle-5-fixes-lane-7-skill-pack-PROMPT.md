# Cycle-5-fixes Lane 7 — Cold-boot command-pack (Phase 1 of /bongo:)

You are `cycle5-fixes-7-skill-pack`, a coder lane in the cycle-5-fixes
parallel wave. Source-of-truth scoping:
`sheet-music-app/.paul/research/2026-05-19-cold-boot-skill-pack-DESIGN.md`
(read this end-to-end before writing any file).

This is **Phase 1 of a multi-phase project** ending in a fully portable
`/bongo:` skill installable across projects + computers (see
`[[project_bongo_portability]]` in supervisor's memory + the §"Multi-phase
roadmap" section of the DESIGN doc). Phase 1 ships CRC-local thin
pointers; Phase 2+ generalizes paths and packages for distribution.
**Do not pre-bake portability into this lane** — Daniel ratified
shipping CRC-local now, generalizing later.

---

## §1 — Identity, branch, worktree

- **Lane ID:** `cycle5-fixes-7-skill-pack`
- **Branch:** `feat/cycle5-fixes-7-skill-pack`
- **Worktree:** `sheet-music-app-cycle5-fixes-7-skill-pack/`
- **Base SHA:** `f6ed276fa`
- **Estimated:** 30-45 min

## §2 — Coord startup (mandatory)

1. Read `sheet-music-app/.coord/README.md` (protocol).
2. Read `sheet-music-app/.coord/shared/master-tip.md` (baseline SHA).
3. Read `sheet-music-app/.coord/shared/decisions.md` (most recent
   blocks — your work doesn't touch contested ground, but you should
   know what shipped in cycle-5-fixes lanes 1-6 in parallel with you).
4. Read `sheet-music-app/.coord/shared/claims.md` — Confirm no other
   lane has claimed `.claude/commands/` or `.coord/cold-boot/` (both
   should be unclaimed).
5. Read `sheet-music-app/.coord/agents.md` — find your row.
6. Read `sheet-music-app/.coord/inbox/coder-7.md` msg-001 (your lane
   assignment).
7. **Read the DESIGN doc end-to-end:**
   `sheet-music-app/.paul/research/2026-05-19-cold-boot-skill-pack-DESIGN.md`.
8. Read the PAUL precedent files for shape parity:
   - `C:/Users/dsbog/.claude/commands/paul/resume.md`
   - `C:/Users/dsbog/.claude/commands/paul/pause.md`
   - `C:/Users/dsbog/.claude/commands/paul/apply.md` (for `$ARGUMENTS`
     pattern)
9. ACK msg-001 to `sheet-music-app/.coord/inbox/supervisor.md`.

## §3 — Scope (Phase 1, CRC-local)

### Files to write (NEW)

1. **`sheet-music-app/.claude/commands/bongo/resume.md`** — see DESIGN
   §"Files to write" for the exact body. Frontmatter: `name: bongo:resume`,
   `argument-hint: "[boss | auditor | 1-7]"`,
   `allowed-tools: [Read, Bash, Grep, Glob, AskUserQuestion]`.

2. **`sheet-music-app/.claude/commands/bongo/pause.md`** — see DESIGN
   §"Files to write" for the exact body. Frontmatter: `name: bongo:pause`,
   `argument-hint: "[optional role override: boss | auditor | 1-7]"`,
   `allowed-tools: [Read, Write, Edit, Bash, AskUserQuestion]`.

### Files to edit

3. **`sheet-music-app/.coord/cold-boot/README.md`** — update the
   "Optional skill packaging" section per DESIGN §"Files to edit".
   Replace the original `.claude/skills/` sketches with the actual
   shipped `.claude/commands/bongo/` paths. Delete the old sketches
   or convert them to inline references — your call, but the README
   must not lie about where the skill lives.

### Files to commit (alongside the implementation)

4. **`sheet-music-app/.paul/research/2026-05-19-cold-boot-skill-pack-DESIGN.md`**
   — currently untracked. Commit it as part of this lane so the design
   record lands with the implementation.

### Hard NO scope

- ❌ Do NOT pre-parameterize paths for portability. Phase 2 lane does
  that. Hardcode `sheet-music-app/.coord/cold-boot/...` in this phase.
- ❌ Do NOT add verbs beyond `:resume` and `:pause`. (`:ship`, `:status`,
  `:audit`, `:init` etc. are Phase 2+.)
- ❌ Do NOT touch `src/`, `bridge/`, `mcp/`, `firestore.rules`,
  `package.json` — your work is in `.claude/commands/` and
  `.coord/cold-boot/` only.
- ❌ Do NOT modify SUPERVISOR.md, AUDITOR.md, or CODER.md content
  (those are the role spec files; the cold-boot/*-startup.md files are
  what your commands point at).

## §4 — Pre-write checks

1. **Verify `$ARGUMENTS` is the substitution token.** Read
   `~/.claude/commands/paul/apply.md` line-by-line for the `$ARGUMENTS`
   pattern inside `<context>` blocks. Mirror that exact usage. If you
   discover a different convention while reading other PAUL files, use
   what PAUL actually uses (precedent > assumption).

2. **Verify `name:` frontmatter convention.** All PAUL files use
   `name: paul:<verb>`. Use `name: bongo:resume` and `name: bongo:pause`
   exactly.

3. **Verify `argument-hint` syntax.** Some PAUL files use quoted form,
   some use bracketed. Match whichever is more common; both work but
   prefer consistency.

4. **Test path resolution mentally.** When `/bongo:resume boss` fires,
   the relative path `sheet-music-app/.coord/cold-boot/SUPERVISOR-startup.md`
   must resolve from the user's CWD. The CWD will be the repo root
   (`C:/Users/dsbog/centralreform.live/`) since Claude Code is typically
   invoked from there. Test this assumption — if Daniel sometimes
   invokes from inside `sheet-music-app/`, the path needs to be
   `.coord/cold-boot/SUPERVISOR-startup.md` instead. Mention what
   you decided in the SHIP-NOTICE.

## §5 — Validation (mandatory before SHIP-NOTICE)

Per DESIGN §"Validation plan (coder-7)":

1. **Frontmatter parity check** — diff your two files' frontmatter
   structure against `~/.claude/commands/paul/{resume,pause}.md`.
   Should match key-for-key (allowing for different `name:`,
   `description:`, `argument-hint:`, `allowed-tools:` values, but
   same keys).

2. **Smoke test via subagent** — spawn an Agent with
   `subagent_type=general-purpose` and this exact directive:

   > Without executing any role: inspect the files
   > `sheet-music-app/.claude/commands/bongo/resume.md` and
   > `sheet-music-app/.claude/commands/bongo/pause.md`. Confirm:
   > (a) frontmatter is well-formed (yaml parses, name field is
   > `bongo:resume` / `bongo:pause`); (b) the resume body correctly
   > redirects to the three cold-boot files based on `$ARGUMENTS`;
   > (c) the pause body correctly instructs auto-detect with sensible
   > fallback. Report each finding as PASS or FAIL with one-line
   > evidence. Do NOT execute the commands, do NOT push, do NOT
   > edit src/.

3. **Paste-fallback regression check** — read
   `.coord/cold-boot/SUPERVISOR-startup.md`, `AUDITOR-startup.md`,
   `CODER-startup.md`. They should still work as direct-paste
   prompts — no accidental coupling to `/bongo:` introduced. If you
   touched their content (you shouldn't have to), explain in
   SHIP-NOTICE.

4. **`next build --webpack`** — NOT REQUIRED. Your changes are in
   `.claude/commands/` and `.coord/`, neither of which affects the
   Next.js build. Skip unless you accidentally touched `src/`.

## §6 — Push protocol

Standard cycle-5 lane shape:

1. Single commit on `feat/cycle5-fixes-7-skill-pack` with all 4 files
   (2 new commands + README edit + DESIGN doc).
2. Commit message:
   ```
   feat(coord): /bongo:resume + /bongo:pause Phase 1 commands

   Phase 1 of multi-phase /bongo: command pack — CRC-local thin
   pointers over .coord/cold-boot/*-startup.md. Phase 2+ will
   generalize paths and package for cross-project portability.

   - .claude/commands/bongo/resume.md: cold-boot/warm-resume any
     role (boss|auditor|1-7) by reading the matching startup file.
   - .claude/commands/bongo/pause.md: write a pickup pointer for
     the current role; auto-detects from in-session persona.
   - .coord/cold-boot/README.md: reflect shipped surface.
   - .paul/research/2026-05-19-cold-boot-skill-pack-DESIGN.md:
     design record.
   ```
3. Rebase against origin/master if origin advances (see push protocol
   in `.coord/README.md`).
4. Push via `git push origin feat/cycle5-fixes-7-skill-pack:master`.
5. Update `.coord/shared/master-tip.md` per the protocol template.
6. Post SHIP-NOTICE to `inbox/supervisor.md` with §7 contents.

## §7 — SHIP-NOTICE contents

Per DESIGN §"SHIP-NOTICE expected contents", plus the standard cycle-5
SHIP-NOTICE fields:

- New master-tip SHA.
- File diff summary.
- Smoke-test transcript (PASS/FAIL per finding from the subagent run).
- Path-resolution decision (CWD-relative vs `sheet-music-app/`-relative).
- Paste-fallback regression result.
- Phase-2 handoff candidate: surface to supervisor any
  CRC-specific paths or assumptions you noticed while writing that
  the Phase 2 lane will need to parameterize. (No need to fix in
  Phase 1 — just enumerate.)

## §8 — Hard rules (standard cycle-5 lane)

- NEVER touch repo-root `mcp/`, `bridge/`, `SetlistGrid.tsx`.
- NEVER touch `src/lib/mcp/errors.ts` or `error-envelopes.ts`.
- NEVER touch another lane's claimed files without HEADS-UP (none of
  yours overlap with lanes 1-6).
- NEVER self-tear-down your worktree (supervisor does that on Daniel's
  go-ahead per `[[feedback_worktree_teardown_timing]]`).
- ALWAYS claim shared files in `shared/claims.md` before editing
  (`.coord/cold-boot/README.md` is a shared-ish file — claim it; the
  two new command files are NEW, no claim needed).

## §9 — Done condition

- 2 new command files exist, parse, and pass smoke test.
- README updated.
- DESIGN doc committed.
- SHIP-NOTICE posted.
- Auditor verifies → PASS → Daniel green-lights teardown.

When auditor verifies PASS and Daniel confirms, supervisor tears down
the worktree per `[[feedback_worktree_teardown_timing]]` — do NOT
self-teardown.

Phase 2 begins as a separate lane after Daniel ratifies the Phase 1
SHIP-NOTICE.

Go.
