# /bongo: Phase 2 lane — Cross-project portability

You are `bongo-2-portable`, the first lane in the /bongo: project's
own lane series (breaking out from `cycle5-fixes-*` per
`[[project_bongo_portability]]`). Phase 1 (`cycle5-fixes-7-skill-pack`,
shipped `db89e5ba7`) delivered the CRC-local thin pointers; Phase 2
generalizes them.

Source-of-truth scoping: `sheet-music-app/.paul/research/2026-05-19-bongo-phases-2-3-4-ROADMAP.md`
§"Phase 2" — read end-to-end before writing any file.

---

## §1 — Identity, branch, worktree

- **Lane ID:** `bongo-2-portable`
- **Branch:** `feat/bongo-2-portable`
- **Worktree:** `sheet-music-app-bongo-2-portable/`
- **Base SHA:** `5c546920d` (cycle-5-fixes Lane 2 ship)
- **Estimated:** 2-3h
- **Coder:** coder-7 (reused — bongo expert from Phase 1; the parallel
  Phase 1 worktree at `sheet-music-app-cycle5-fixes-7-skill-pack/`
  stays parked awaiting Daniel teardown; coder-7's tab creates this
  NEW worktree for Phase 2)

## §2 — Coord startup (mandatory)

1. Read `sheet-music-app/.coord/CODER.md` (your generic role).
2. Read `sheet-music-app/.coord/README.md` (protocol).
3. Read `sheet-music-app/.coord/shared/master-tip.md` (`5c546920d`).
4. Read `sheet-music-app/.coord/shared/decisions.md` — focus on:
   - 2026-05-19 binary-verdict-rule (your auditor verdict is now
     binary; no DEFER).
   - 2026-05-18T21:35Z cherry-pick caveat (single-commit narrow
     lanes when origin advances).
   - The shallow-clone push-protocol observation surfaced by coder-1
     during cycle5-fixes-1-sec (`.git/shallow` boundary turns rebase
     into a conflict storm; recovery via `reset --hard origin/master
     && cherry-pick <SHAs>`).
5. Read `sheet-music-app/.coord/shared/claims.md` — confirm no other
   lane has claimed `.claude/commands/bongo/*` (should be uncontested).
6. Read `sheet-music-app/.coord/agents.md` — find your row.
7. Read `sheet-music-app/.coord/inbox/coder-7.md` msg-002 (this
   assignment).
8. **Read the ROADMAP doc end-to-end:**
   `sheet-music-app/.paul/research/2026-05-19-bongo-phases-2-3-4-ROADMAP.md`.
9. **Read the Phase 1 DESIGN doc** for context:
   `sheet-music-app/.paul/research/2026-05-19-cold-boot-skill-pack-DESIGN.md`.
10. ACK msg-002 to `sheet-music-app/.coord/inbox/supervisor.md`.

## §3 — Scope (Phase 2 combined: 2a + 2b + 2c, Layout A)

### 2a — Path generalization (critical path)

**Files to edit (in coder-7's worktree, then synced to user-level on push):**

- `sheet-music-app/.claude/commands/bongo/resume.md`
- `sheet-music-app/.claude/commands/bongo/pause.md`

**What to change:**

Currently both files hardcode `sheet-music-app/.coord/cold-boot/...`
in their `<process>` sections. Replace with prose instructing the
LLM to resolve the coord-root dynamically. Two strategies, both
documented in the body so the LLM picks based on context:

1. **Walk up from cwd** — start at cwd, look for `.coord/cold-boot/`
   directory; if not found, go up one level; repeat until found or
   reach filesystem root. If found, use that as coord-root.

2. **Explicit `$ARGUMENTS` override** — if the user passes
   `--repo <path>` (in addition to the role keyword), use that path
   as coord-root directly.

3. **Helpful failure** — if neither resolves, post a clear message
   explaining that no `.coord/cold-boot/` was found and asking for
   either a `--repo <path>` arg or that the user `cd` into a
   bongo-initialized project.

Example resume.md `<process>` rewrite (sketch — finalize wording):

```
1. Resolve coord-root:
   - Parse `$ARGUMENTS`. If it contains `--repo <path>`, use that
     path as coord-root (strip the flag from the role keyword).
   - Otherwise walk up from cwd looking for `.coord/cold-boot/`.
   - If neither resolves, abort with a helpful message.

2. Parse role keyword from $ARGUMENTS (boss / auditor / 1-7).

3. Read <coord-root>/.coord/cold-boot/<SUPERVISOR|AUDITOR|CODER>-startup.md
   and follow it exactly.
```

Mirror the same resolution prose in `pause.md`'s `<process>` step 1
(currently locked to writing into `sheet-music-app/.coord/...`
specific paths). Pause needs:
- coord-root for SUPERVISOR.md / AUDITOR.md (Running-log prepends)
- coord-root for inbox/supervisor.md (coder pause HEADS-UP)
- coord-root for status/coder-N.md (coder pause status update)

All three become `<coord-root>/.coord/...` after this lane.

### 2b — Role-spec template extraction

**New directory:** `sheet-music-app/.claude/commands/bongo/templates/`

**Files to create (parameterized from canonical CRC files):**

- `templates/SUPERVISOR.md` — generic role spec, derived from
  `sheet-music-app/.coord/SUPERVISOR.md`. Strip the entire "Running
  log" section (project-specific). Keep §"Mission" / §"Authority" /
  §"Cadence" / §"Escalation triggers" / §"Identity" — these are
  protocol, not project-specific. Replace CRC-specific examples
  (e.g., `[[feedback_admin_rate_limit_bypass]]`) with generic
  placeholders (e.g., `[[project-specific memory refs]]`).

- `templates/AUDITOR.md` — same treatment for
  `sheet-music-app/.coord/AUDITOR.md`. Note: AUDITOR.md was recently
  amended with the binary-verdict rule + sweep-before-verdict; KEEP
  those changes in the template (they're protocol).

- `templates/CODER.md` — generic version of
  `sheet-music-app/.coord/CODER.md`.

- `templates/README.md` — generic version of
  `sheet-music-app/.coord/README.md` (protocol doc).

- `templates/cold-boot/SUPERVISOR-startup.md`,
  `templates/cold-boot/AUDITOR-startup.md`,
  `templates/cold-boot/CODER-startup.md` — generic startup prompts
  that reference `<coord-root>` instead of `sheet-music-app/.coord/...`.

- `templates/cold-boot/README.md` — generic role-map doc.

- `templates/shared/master-tip.md`, `templates/shared/decisions.md`,
  `templates/shared/claims.md` — empty initial headers per CRC's
  format.

- `templates/inbox/supervisor.md`, `templates/inbox/auditor.md` —
  empty headers with schema reference.

- `templates/agents.md` — empty table header.

**Do NOT touch the canonical CRC files at
`sheet-music-app/.coord/SUPERVISOR.md` etc.** — they remain the
working reference for this project. Templates are derived snapshots.

**Parameter convention:** when a placeholder substitution will be
needed by Phase 3's `/bongo:init`, mark it as `{{PROJECT_NAME}}`,
`{{COORD_ROOT}}`, etc. — readable Mustache-style. Phase 3 will fill
them in at init time.

### 2c — `.coord/` gitignore decision (Daniel-ratified: Option 2)

Per the roadmap, Daniel will ratify the option in his dispatch
ratification. The supervisor's recommended default is **Option 2:**
move shipped-surface docs to a tracked location.

If Daniel ratified Option 2:

- Confirm `sheet-music-app/.gitignore:5` still excludes `.coord/`.
  (Don't change.)
- Create new tracked file `sheet-music-app/.claude/commands/bongo/README.md`
  describing the bongo command surface (the "what you can do with
  /bongo:" doc currently sketched in `.coord/cold-boot/README.md`).
- Leave the `.coord/cold-boot/README.md` in place as the
  project-internal protocol doc (gitignored, local-only).

If Daniel ratified Option 1 (un-ignore `.coord/`):

- Edit `sheet-music-app/.gitignore` to remove line 5
  (`/.coord`).
- Stage and commit the existing `.coord/` content (massive diff).
- Document the policy change in `.coord/shared/decisions.md`.

If Daniel ratified Option 3 (accept divergence):

- No action needed; document the decision in
  `.coord/shared/decisions.md`.

**Surface to Daniel in SHIP-NOTICE if his ratified option diverges
from this lane's default assumption (Option 2).**

### Files to commit

- `.claude/commands/bongo/resume.md` (EDITED, 2a)
- `.claude/commands/bongo/pause.md` (EDITED, 2a)
- `.claude/commands/bongo/templates/**` (NEW, 2b — many files)
- `.claude/commands/bongo/README.md` (NEW, 2c Option 2)
- The roadmap doc itself if not already committed
  (`.paul/research/2026-05-19-bongo-phases-2-3-4-ROADMAP.md` — was
  written by supervisor during the Phase-2 brainstorm).

### Hard NO scope

- ❌ Do NOT touch `src/`, `bridge/`, repo-root `mcp/`, `firestore.rules`.
- ❌ Do NOT touch canonical CRC role spec files
  (`.coord/SUPERVISOR.md`, `AUDITOR.md`, `CODER.md`, `README.md`)
  — they are the working reference. Templates are derived.
- ❌ Do NOT write `/bongo:init` here — that's Phase 3.
- ❌ Do NOT touch the `~/.claude/commands/bongo/` user-level install
  directly from this lane. Supervisor will re-sync user-level after
  this lane lands by copying the new file content into
  `~/.claude/commands/bongo/`.

## §4 — Pre-write checks

1. **Re-read Phase 1's path-resolution assumptions** in resume.md /
   pause.md. The `<process>` blocks make implicit CWD assumptions
   today; the rewrite needs to be explicit.

2. **Confirm walk-up traversal is sane on Windows.** Bash on Windows
   uses forward-slash paths; the walk-up logic (`while cd ../;`
   pattern) needs to work both ways. Test mentally against
   `cwd=C:/Users/dsbog/`, `cwd=C:/Users/dsbog/centralreform.live/`,
   `cwd=C:/Users/dsbog/centralreform.live/sheet-music-app/`.

3. **Identify which CRC-specific references in templates need
   genericizing.** Grep canonical files for `sheet-music-app`,
   `centralreform`, `CRC`, `band_leader`, etc. Document substitution
   choices in the template README.

## §5 — Validation (mandatory before SHIP-NOTICE)

Auditor will run sweep BEFORE verdict per binary-rule. You should:

1. **Frontmatter parity** — resume.md / pause.md still have
   well-formed YAML + same key set after the edits.

2. **Smoke test via subagent.** Spawn an Agent (subagent_type =
   general-purpose) with this directive:

   > Inspect `.claude/commands/bongo/{resume,pause}.md`. Confirm
   > the rewritten `<process>` blocks describe coord-root resolution
   > via (1) `--repo <path>` arg parsing AND (2) walk-up-from-cwd.
   > Confirm a graceful failure path exists. Confirm pause's per-role
   > pickup-pointer paths now use `<coord-root>/.coord/...` instead
   > of hardcoded `sheet-music-app/.coord/...`. Report each as PASS
   > or FAIL with evidence. Do NOT execute the commands.

3. **Template completeness check** — count files written under
   `templates/`. Should match expected list in §3 §2b. Report
   count in SHIP-NOTICE.

4. **Generic-ify spot-check** — pick 3 random templates and grep
   for CRC-specific strings (`sheet-music-app`, `centralreform`,
   `band_leader`, etc.). Should return zero. If non-zero, fix
   before SHIP.

5. **Paste-fallback regression** — canonical
   `.coord/cold-boot/*-startup.md` files unchanged (this lane
   should NOT edit them). Confirm via `git diff` summary.

6. **Build/test posture** — N/A. This lane only touches
   `.claude/commands/` + `.paul/research/`. No `src/` or build-
   affecting files.

## §6 — Push protocol

Standard cycle-5 narrow-lane shape (with shallow-clone awareness per
coder-1's caveat):

1. Single commit on `feat/bongo-2-portable` with all files (edits +
   new templates + new README + roadmap doc if not yet committed).
2. Commit message:
   ```
   feat(bongo): Phase 2 — cross-project portability + templates

   - resume.md / pause.md: coord-root resolution via walk-up-from-cwd
     OR --repo <path> override (no more hardcoded sheet-music-app
     paths).
   - templates/**: generic SUPERVISOR/AUDITOR/CODER role specs +
     cold-boot/* startup files + shared/* + inbox/* + agents.md
     placeholder, derived from canonical CRC files with project-
     specifics stripped. Consumed by Phase 3 /bongo:init.
   - README.md: tracked surface doc (per Phase 2c Option 2).
   - .paul/research/...ROADMAP.md: committed if not already.
   ```
3. Rebase against origin/master if origin advances. Apply
   shallow-clone caveat if rebase explodes: `git reset --hard
   origin/master && git cherry-pick <SHA>`.
4. Push via `git push origin feat/bongo-2-portable:master`. FF.
5. Update `.coord/shared/master-tip.md` per protocol template.
6. Post SHIP-NOTICE to `inbox/supervisor.md` per §7.

## §7 — SHIP-NOTICE contents

- New master-tip SHA.
- File diff summary (count of new templates + files touched).
- Smoke-test transcript (subagent PASS/FAIL).
- Generic-ify spot-check result (which 3 templates checked, grep
  result).
- Template-count check (expected vs actual).
- Path-resolution verification: paste the rewritten `<process>`
  block from resume.md so supervisor + auditor can review.
- `.coord/` gitignore decision: which option Daniel ratified + what
  this lane did about it.
- Phase 3 handoff readiness: confirm templates are in shape for
  `/bongo:init` to consume; flag any open parameters Phase 3 will
  need to decide.
- Phase 4 handoff candidates: any CRC-specific assumptions
  remaining that the GitHub distribution will need to address.

## §8 — Hard rules (standard)

- NEVER touch repo-root `mcp/`, `bridge/`, `SetlistGrid.tsx`.
- NEVER touch `src/lib/mcp/errors.ts` or `error-envelopes.ts`.
- NEVER touch canonical CRC `.coord/SUPERVISOR.md` / `AUDITOR.md` /
  `CODER.md` / `README.md` / `cold-boot/*-startup.md` — those are
  working reference; this lane derives templates from them, not
  edits them.
- NEVER touch another lane's claimed files without HEADS-UP. (No
  lane currently claims `.claude/commands/bongo/*`.)
- NEVER self-tear-down your worktree — supervisor handles it on
  Daniel's go-ahead.
- ALWAYS claim shared files in `shared/claims.md` before editing
  (`.claude/commands/bongo/{resume,pause}.md` are about to be
  edited; claim them).

## §9 — Done condition

- `resume.md` + `pause.md` rewritten with coord-root resolution.
- `templates/**` populated (all expected files present, generic-ified).
- `README.md` written (or skipped per Daniel's gitignore option).
- SHIP-NOTICE posted.
- Auditor sweep + binary verdict.
- On ACCEPT + Daniel go-ahead: supervisor tears down BOTH
  worktrees (Phase 1 at `sheet-music-app-cycle5-fixes-7-skill-pack/`
  AND Phase 2 at `sheet-music-app-bongo-2-portable/`) AND re-syncs
  the new resume.md / pause.md to user-level
  `~/.claude/commands/bongo/`.

Phase 3 (`/bongo:init`) dispatch comes after this lane lands.

Go.
