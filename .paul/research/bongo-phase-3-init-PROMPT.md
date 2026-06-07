# Bongo Phase 3 — `/bongo:init` scaffolder

> **Coder lane prompt** — Phase 3 of the multi-phase `/bongo:`
> portability project. Single focused code lane; single-commit
> narrow lane preferred.
>
> Runs in parallel with cycle-6-fixes Wave A (coder-1 Lane 2, coder-2
> Lane 1, coder-3 Lane 5). Fully disjoint file-set — your touches are
> in `.claude/commands/bongo/**` and nothing else.

---

## §0 — Identity, branch, scope

**Lane:** `bongo-3-init`
**Branch:** `feat/bongo-3-init` (cut from current `origin/master` at lane start)
**Output:** single-commit FF-push preferred; cherry-pick over fresh origin/master per master-tip.md narrow-lane caveat if origin advanced mid-lane.

**No bearer needed.** Validation is smoke-test against a temp dir.

**Scope:** ship `/bongo:init` slash command at `.claude/commands/bongo/init.md` that scaffolds a fresh `.coord/` directory into any target repo from the Phase 2 templates.

**SHIP-NOTICE protocol (Daniel-ratified 2026-05-19 — non-negotiable):** include a `## Repros` section pasting each REPRO block from §6 verbatim. Auditor BLOCK-TEARDOWNs without it.

---

## §1 — Phase 2 prerequisites (already shipped — verify at lane start)

At cut SHA `3e640a905`, the following are present and form the input to Phase 3:

- `.claude/commands/bongo/resume.md` + `pause.md` — Phase 1+2 commands
- `.claude/commands/bongo/README.md` — surface doc (Phase 2c)
- `.claude/commands/bongo/templates/` — 17 substantive template files + 2 `.gitkeep`:
  - `SUPERVISOR.md`, `AUDITOR.md`, `CODER.md` — role specs (3)
  - `protocol-README.md` — generic parallel-agent protocol doc (1)
  - `cold-boot/{SUPERVISOR,AUDITOR,CODER}-startup.md` + `cold-boot/README.md` (4)
  - `shared/{master-tip,decisions,claims}.md` — empty shared dir (3)
  - `inbox/{supervisor,auditor}.md` — empty inbox (2)
  - `agents.md` — empty roster (1)
  - `README.md` — index doc with Mustache placeholder convention (1)
  - `status/.gitkeep` + `archive/.gitkeep` (2)

**Mustache placeholder convention** (documented in `templates/README.md`):

| Placeholder | Meaning | Example |
|---|---|---|
| `{{PROJECT_NAME}}` | Human-readable project name | `CRC music dashboard` |
| `{{COORD_ROOT}}` | Repo-relative path to project containing `.coord/` | `sheet-music-app/` |
| `{{REPO_NAME}}` | Top-level repo dir name | `sheet-music-app` |
| `{{MAX_CODERS}}` | Concurrent coder ceiling | `7` (or default `5`) |

**Pre-flight verified 2026-05-19T20:45Z by supervisor:**
- `git show 3e640a905:.claude/commands/bongo/init.md` → fatal: does not exist (scope is real, no prior `init.md` to compete with)
- All 17 substantive templates + 2 .gitkeep present at `3e640a905`.

---

## §2 — `/bongo:init` behavior

**Invocation:** `/bongo:init` (no args required; optional `--repo <path>` to target a specific repo root if not running from inside one).

**Behavior:**

1. **Resolve target repo root:**
   - If `--repo <path>` provided: validate it's a directory; use as target root.
   - Otherwise: walk up from cwd looking for `.git/` (use `git rev-parse --show-toplevel` if git is available; else manual walk). Bail with helpful message if cwd is not inside a git repo.

2. **Refuse if `.coord/` already exists at target root:**
   - Print `target already has .coord/ — refusing to clobber. Either delete it manually or re-target a different repo.` and exit.

3. **Refuse if templates not found:**
   - Look for templates at `~/.claude/commands/bongo/templates/` (cross-platform path expansion).
   - If missing: print `bongo templates not found at ~/.claude/commands/bongo/templates/. Did you complete the Phase 2 install? See ~/.claude/commands/bongo/README.md.` and exit.

4. **Gather placeholder values via AskUserQuestion (or equivalent prompt sequence):**
   - `{{PROJECT_NAME}}` — required. Free-text. Default derived from `REPO_NAME` if user wants.
   - `{{COORD_ROOT}}` — default `.` (i.e. `.coord/` at repo root). User can override if `.coord/` should live in a subdir (e.g. `sheet-music-app/.coord/` for CRC's monorepo-ish layout).
   - `{{REPO_NAME}}` — default = basename of target root.
   - `{{MAX_CODERS}}` — default `5`. User can override (1-9 reasonable range).

5. **Gitignore policy** (Daniel-ratified Option 2 default from Phase 2c):
   - Ask: "Add `.coord/` ops state to `.gitignore` while keeping the protocol surface doc tracked?" with options:
     - Default Yes (Option 2 — tracked README, gitignored ops state).
     - No (track everything per Option 1 — useful if pickup pointers should sync via git).
   - If yes: append `<COORD_ROOT>/.coord/` line to the target's `.gitignore` (creating it if absent). Surface the gitignore diff to user.

6. **Copy + substitute:**
   - Source: every file under `~/.claude/commands/bongo/templates/**` EXCEPT `templates/README.md` (the index doc — explicitly excluded per `templates/README.md` itself).
   - Destination: `<TARGET_ROOT>/<COORD_ROOT>/.coord/<matching subpath>`.
   - For each file, read content + Mustache-substitute every `{{PLACEHOLDER}}` occurrence with the resolved value. Files with no placeholders copy verbatim.
   - Preserve directory structure (`shared/`, `inbox/`, `cold-boot/`, `status/`, `archive/`).
   - `protocol-README.md` → renamed to `<COORD_ROOT>/.coord/README.md` per Phase 2's spec (mentioned in `templates/README.md` index).
   - `.gitkeep` files copied verbatim (preserve empty `status/` + `archive/` dirs in git if user chose to track).

7. **Final report:**
   - Print: tree of files created, total count, location of `.coord/` root, instructions for first use (`/bongo:resume boss` from that repo's root).
   - Hint: "Next, mint your first roster row in `<COORD_ROOT>/.coord/agents.md`, drop a HEADS-UP into `inbox/supervisor.md`, and cold-boot the supervisor."

---

## §3 — Files you'll touch

- **NEW** `.claude/commands/bongo/init.md` — the slash command body. Follow the PAUL pattern (frontmatter + `<objective>` + `<context>` + `<process>` body). Frontmatter parity with `resume.md` + `pause.md` (4-key shape: `name`, `description`, `argument-hint`, `allowed-tools`).
- **NO other source files modified.** Templates are read-only inputs to Phase 3; do NOT edit them in this lane.
- **NO edits to `.coord/`** in this repo. Phase 3 operates on TARGET repos, not the source repo.

Possibly:
- Updates to `.claude/commands/bongo/README.md` describing the new `:init` verb in the surface doc (additive — describes Phase 3 alongside Phase 1+2 commands).

---

## §4 — Coord coordination contract

- Lane 1 (coder-2 gig-packet): touches `src/lib/mcp/tools/library-download.ts` + `src/lib/drive/*` — fully disjoint.
- Lane 2 (coder-1 template MCP): touches `src/lib/mcp/tools/templates.ts` + `index.ts` + `firestore.rules` — fully disjoint.
- Lane 5 (coder-3 unauth-edge): touches `src/app/accessibility/page.tsx` + `Footer.tsx` + `src/proxy.ts` — fully disjoint.
- **You touch only `.claude/commands/bongo/init.md`** (+ optionally the surface doc). Zero overlap with any active wave-A lane.

No claims needed — your file-set is fully isolated.

---

## §5 — Binding rules

1. **SHIP-NOTICE `## Repros` section is MANDATORY** (decisions.md 2026-05-19T~19:30Z Decision 1). Paste each REPRO-P3-* block from §6 verbatim. Auditor BLOCK-TEARDOWNs without it.
2. **Auditor verdicts are BINARY** (ACCEPT or BLOCK-TEARDOWN; no DEFER).
3. **Single-commit narrow lane → cherry-pick over fresh origin/master** at push time, not rebase.
4. **Pre-flight before writing code** per `[[feedback_cowork_prompt_verify_before_write]]`. Supervisor already pre-flighted Phase 3 scope at 2026-05-19T20:45Z; your own pre-flight should re-verify nothing new shipped during your boot window.

---

## §6 — REPRO blocks (paste verbatim into SHIP-NOTICE)

```
### REPRO-P3-no-init-pre-fix (scope verification at cut SHA)
preconditions: master at <cut-sha>
steps: git show <cut-sha>:.claude/commands/bongo/init.md
expected_pre_fix: fatal: path '.claude/commands/bongo/init.md' does not exist
observed_pre_fix: fatal: path '.claude/commands/bongo/init.md' does not exist (verified at 3e640a905 by supervisor 2026-05-19T20:45Z; coder re-verifies at boot)

### REPRO-P3-init-fresh-target (happy path)
preconditions: empty temp dir T; T is a git repo (T/.git/ exists); T has no .coord/; ~/.claude/commands/bongo/templates/ populated per Phase 2 ship
steps: cd T && /bongo:init  → answer placeholders interactively (PROJECT_NAME='test-project', COORD_ROOT='.', REPO_NAME defaults, MAX_CODERS=3, gitignore=yes)
expected: T/.coord/ created with full tree (README.md, SUPERVISOR.md, AUDITOR.md, CODER.md, agents.md, cold-boot/, shared/, inbox/, status/, archive/); placeholders substituted ({{PROJECT_NAME}} → 'test-project', etc); T/.gitignore contains '/.coord/' line; /bongo:resume boss from T resolves correctly
observed_pre_fix: /bongo:init does not exist; nothing happens

### REPRO-P3-init-refuses-clobber
preconditions: temp dir T already has T/.coord/ (from prior init or pre-existing)
steps: cd T && /bongo:init
expected: refuses with message 'target already has .coord/ — refusing to clobber'; T/.coord/ unchanged
observed_pre_fix: command does not exist

### REPRO-P3-init-refuses-non-git
preconditions: empty temp dir N; N is NOT a git repo (no .git/)
steps: cd N && /bongo:init
expected: refuses with helpful 'not inside a git repository' message
observed_pre_fix: command does not exist

### REPRO-P3-init-refuses-no-templates
preconditions: temporarily rename ~/.claude/commands/bongo/templates/ to /tmp/bongo-templates-backup/
steps: cd <any git repo> && /bongo:init
expected: refuses with 'templates not found' message + install hint
observed_pre_fix: command does not exist
(restore the rename after testing: mv /tmp/bongo-templates-backup ~/.claude/commands/bongo/templates)

### REPRO-P3-init-substitution-correctness
preconditions: post-init T/.coord/ from happy-path test
steps: grep -rE '\{\{(PROJECT_NAME|COORD_ROOT|REPO_NAME|MAX_CODERS)\}\}' T/.coord/
expected: zero matches (every placeholder substituted; no stragglers)
observed_pre_fix: N/A (init doesn't exist)

### REPRO-P3-readme-index-excluded
preconditions: post-init T/.coord/
steps: ls T/.coord/templates/README.md
expected: file does not exist (templates/README.md is the index doc; explicitly excluded from copy per its own docs)
observed_pre_fix: N/A

### REPRO-P3-protocol-readme-rename
preconditions: post-init T/.coord/
steps: ls T/.coord/README.md && ls T/.coord/protocol-README.md
expected: T/.coord/README.md exists (renamed from templates/protocol-README.md); T/.coord/protocol-README.md does NOT exist
observed_pre_fix: N/A
```

---

## §7 — Effort estimate

1.5-2.5h. Mostly prompt-authorship + smoke testing. The actual logic is straightforward Read+substitute+Write loop; the interactive AskUserQuestion sequence is the trickiest piece (handling defaults + validation).

---

## §8 — Hard NOs

- Do NOT touch any `src/` files. Phase 3 is `.claude/commands/bongo/**` only.
- Do NOT edit templates in this lane. Phase 2 owns templates; if you find a template bug, file as OPEN-FOLLOWUP for a follow-up bongo-N lane (or Phase 4 candidate).
- Do NOT auto-scaffold memory tiers (`daniel/`, `bongo-protocol/`) — that's Phase 4a, not Phase 3. Phase 3 is `.coord/` scaffolding ONLY.
- Do NOT add `:sync`, `:scaffold-memory`, or other Phase 4+ verbs in this lane.
- Do NOT trigger destructive operations on the target repo without a confirm prompt (the `.gitignore` edit is the only write outside `.coord/`; surface its diff to user before applying).
- Do NOT skip the smoke-test in §6 REPROs — auditor executes the happy path post-deploy.

---

## §9 — Post-ship supervisor TODO (NOT your job, FYI)

After auditor ACCEPT + Daniel teardown go-ahead:
1. Supervisor re-syncs `~/.claude/commands/bongo/` from the worktree (per Phase 1+2 precedent).
2. Supervisor or Daniel smoke-tests `/bongo:init` against a fresh temp project to validate cross-project use end-to-end.
3. Phase 4 (4a memory split + 4b persona + 4c distribution + 4d update story) opens next as a fresh design pass.
