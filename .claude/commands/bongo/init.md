---
name: bongo:init
description: Scaffold a fresh `.coord/` parallel-agent coordination directory into a target git repo from the `~/.claude/commands/bongo/templates/` template set. Refuses if `.coord/` already exists, target is not a git repo, or templates are missing. Optional `--repo <path>` targets a repo other than the current cwd.
argument-hint: "[--repo <path>]"
allowed-tools: [Read, Write, Edit, Bash, Glob, Grep, AskUserQuestion]
---

<objective>
Initialize a brand-new `.coord/` parallel-agent coordination directory
in a target git repository, scaffolded from the
`~/.claude/commands/bongo/templates/` template set installed by the
Phase 2 `/bongo:` install.

**When to use:** First-time setup of the parallel-agent system in a
new project that doesn't yet have `.coord/`. After this scaffolds the
directory, the project can be cold-booted via
`/bongo:resume boss` (and friends) from inside it.

**Refuses (no partial writes) when:**
- target is not inside a git repository
- target already has a `.coord/` directory at the resolved coord-root
- `~/.claude/commands/bongo/templates/` is missing
</objective>

<context>
$ARGUMENTS (optional `--repo <path>` to target a repo other than the
current working directory)
</context>

<process>

## Step 1 — Resolve target repo root

`$ARGUMENTS` may contain `--repo <path>`.

a. **Explicit override.** If `$ARGUMENTS` contains `--repo <path>`:
   strip the flag and its value, expand `~` / env vars in `<path>` if
   present, and treat that path as the **target repo root**. Confirm
   `<path>` is a directory; if not, abort with: "target `<path>` is
   not a directory — re-invoke with `/bongo:init --repo <existing-
   directory>`."

b. **Auto-detect via git.** Otherwise, run `git rev-parse
   --show-toplevel` from the current working directory. If it
   succeeds, use that output (trimmed) as the **target repo root**.
   If it fails (cwd is not inside a git repo), abort with:
   "`<cwd>` is not inside a git repository — `/bongo:init` only
   scaffolds into git repos. Either `git init` first, `cd` into a
   repo, or re-invoke with `/bongo:init --repo <path>`."

Bind the resolved value as `<TARGET_ROOT>` for the rest of this
process.

## Step 2 — Verify templates exist

Resolve `~/.claude/commands/bongo/templates/` to its absolute path
(use `Bash` with `echo ~` or `$env:USERPROFILE`; the
`~/.claude/commands/bongo/templates/` location is fixed by the Phase
2 install).

Confirm the directory exists AND contains at minimum
`protocol-README.md`, `SUPERVISOR.md`, `AUDITOR.md`, `CODER.md`,
`agents.md`, `cold-boot/` subdir, `shared/` subdir, `inbox/` subdir.

If templates are missing, abort with: "bongo templates not found at
`~/.claude/commands/bongo/templates/`. Did you complete the Phase 2
install? See `~/.claude/commands/bongo/README.md`. If you have a
local checkout of the bongo repo, re-run its install script."

Bind the resolved absolute path as `<TEMPLATES_DIR>`.

## Step 3 — Early refusal: `.coord/` at target root

Quick sanity check: if `<TARGET_ROOT>/.coord/` already exists (this is
the default scaffold location, before COORD_ROOT override), abort
with: "target already has `.coord/` at `<TARGET_ROOT>/.coord/` —
refusing to clobber. Either delete it manually or re-target a
different repo. (If you meant to scaffold a second `.coord/` into a
subdirectory of this repo, use `/bongo:init --repo <subdir>`.)"

(A second, post-prompt check in Step 5 catches custom-COORD_ROOT
collisions; this early check fails fast on the common case.)

## Step 4 — Gather placeholder values via AskUserQuestion

Compute defaults BEFORE prompting so the questions offer them:

- `default_REPO_NAME` = basename of `<TARGET_ROOT>` (e.g. for
  `/home/dan/foo-app/` → `foo-app`).
- `default_PROJECT_NAME` = `default_REPO_NAME` (user usually wants to
  override with a prettier human-readable name; offer the basename as
  the recommended starting point).
- `default_COORD_ROOT` = `.` (i.e. `.coord/` at the repo root).
- `default_MAX_CODERS` = `5` (Daniel-ratified ceiling per
  `[[feedback_agent_count_quality_over_quantity]]`).

Then ask 4 questions in a single `AskUserQuestion` call. For each,
the first option (label-prefixed `<default> (Recommended)`) is the
computed default; users select "Other" to provide a custom value.

1. **PROJECT_NAME** — "Human-readable project name? (Used in the
   scaffolded surface doc as `{{PROJECT_NAME}}`.)" — options:
   - `<default_PROJECT_NAME> (Recommended)`
   - "Other" (free-text)

2. **COORD_ROOT** — "Where should `.coord/` live within the target
   repo? Repo-relative path to the directory that will CONTAIN
   `.coord/`. Most projects: `.` (i.e. `.coord/` at repo root). Monorepo
   subprojects: `<subdir>/` (e.g. `frontend/`)." — options:
   - `. (Recommended)`
   - "Other" (free-text — user enters relative path; will be
     normalized: trailing `/` stripped, `./` prefix stripped)

3. **REPO_NAME** — "Top-level repo directory name? (Used as
   `{{REPO_NAME}}` — typically the basename of the repo path.)" —
   options:
   - `<default_REPO_NAME> (Recommended)`
   - "Other" (free-text)

4. **MAX_CODERS** — "Concurrent coder ceiling? (How many parallel
   implementation agents can run at once. Daniel's calibrated
   ceiling: 5.)" — options:
   - `3`
   - `5 (Recommended)`
   - `7`
   - "Other" (free-text — validate as integer 1-9; abort with
     re-prompt if out of range)

Bind the resolved values as `<PROJECT_NAME>`, `<COORD_ROOT>`,
`<REPO_NAME>`, `<MAX_CODERS>` for substitution.

## Step 5 — Post-prompt refusal: `.coord/` at resolved COORD_ROOT

Compute `<SCAFFOLD_DIR>` = `<TARGET_ROOT>/<COORD_ROOT>/.coord/`
(collapse `./` and double-slashes). If `<COORD_ROOT>` is `.`, this is
`<TARGET_ROOT>/.coord/` (already checked in Step 3 — fast-path no-op).

If `<SCAFFOLD_DIR>` exists, abort with: "scaffold target
`<SCAFFOLD_DIR>` already exists — refusing to clobber. Either delete
it manually or choose a different COORD_ROOT."

If the **parent** of `<SCAFFOLD_DIR>` (i.e.
`<TARGET_ROOT>/<COORD_ROOT>/`) does not exist when `<COORD_ROOT>` is
not `.`, abort with: "COORD_ROOT directory
`<TARGET_ROOT>/<COORD_ROOT>/` does not exist — create it first or
choose a different COORD_ROOT."

## Step 6 — Gitignore policy

Ask via `AskUserQuestion` (single-question call):

"Add `.coord/` ops state to the target repo's `.gitignore`? The
protocol surface doc (`<COORD_ROOT>/.coord/README.md`) ships
project-tracked for visibility, but the running ops state (inboxes,
status files, claims, master-tip) is typically kept local-only to
avoid commit noise from agent coordination. (Daniel-ratified Option-2
default 2026-05-19.)"

Options:
- `Yes — gitignore .coord/ (Recommended)`
- `No — track everything (useful if pickup pointers should sync via git)`

If **Yes**:
- Compute the gitignore entry: `/<COORD_ROOT>/.coord/` when
  `<COORD_ROOT>` is not `.`, else `/.coord/`. (Anchored at repo root
  with a leading `/`.)
- If `<TARGET_ROOT>/.gitignore` does not exist, create it with:
  ```
  # Bongo parallel-agent coordination — ops state local-only
  <entry>
  ```
- If it exists:
  - Check if `<entry>` (or a less-specific pattern that already
    covers it, e.g. `.coord/`) is already present. If so, no edit.
  - Otherwise, append:
    ```

    # Bongo parallel-agent coordination — ops state local-only
    <entry>
    ```

- Surface the diff to the user (print a short before/after of the
  `.gitignore` lines added, so they see what changed).

If **No**: skip the `.gitignore` edit. Note in the final report.

## Step 7 — Copy + substitute templates

Walk every file under `<TEMPLATES_DIR>` recursively. For each file:

1. **Compute destination path.**
   - Skip `<TEMPLATES_DIR>/README.md` entirely — that's the templates
     index doc, NOT a runtime template. Per
     `templates/README.md` itself it is explicitly excluded.
   - For `<TEMPLATES_DIR>/protocol-README.md` → destination is
     `<SCAFFOLD_DIR>/README.md` (renamed; per Phase 2 spec).
   - All other files: destination is
     `<SCAFFOLD_DIR>/<subpath>` where `<subpath>` is the file's path
     relative to `<TEMPLATES_DIR>` (preserves `cold-boot/`,
     `shared/`, `inbox/`, `status/`, `archive/` directory
     structure).
   - `.gitkeep` files are copied verbatim (they preserve empty
     `status/` + `archive/` dirs in git when the user chose to
     track).

2. **Read template content.** Use the `Read` tool on the source
   file.

3. **Substitute placeholders.** For each occurrence of
   `{{PROJECT_NAME}}`, `{{COORD_ROOT}}`, `{{REPO_NAME}}`,
   `{{MAX_CODERS}}` in the content, replace with the resolved value.
   Files with no placeholders pass through unchanged. The
   substitution is a literal string replace, not a regex —
   placeholders are exact-match tokens.

4. **Write destination.** Use the `Write` tool. The Write tool
   creates any intermediate directories automatically.

After the walk completes, verify integrity:
- Run `Grep` for `\{\{(PROJECT_NAME|COORD_ROOT|REPO_NAME|MAX_CODERS)\}\}`
  recursively in `<SCAFFOLD_DIR>`. Expect zero matches. If any are
  found, abort with: "substitution incomplete — stragglers found:
  <list>. Bug in template content or substitution step; report this."
- Confirm `<SCAFFOLD_DIR>/README.md` exists (renamed from
  `protocol-README.md`).
- Confirm `<SCAFFOLD_DIR>/templates/` does NOT exist (the templates
  index was excluded, and we did not copy `<TEMPLATES_DIR>/README.md`
  into the scaffold).
- Confirm `<SCAFFOLD_DIR>/protocol-README.md` does NOT exist (the
  rename worked; no orphan copy left).

## Step 8 — Final report

Print to the user:

1. **Files created** — list every file written under
   `<SCAFFOLD_DIR>`, one per line, repo-relative. Group by
   subdirectory for readability if there are more than ~10.

2. **Total count** — `N files created in <SCAFFOLD_DIR>`.

3. **Gitignore status** — either "added `<entry>` to
   `<TARGET_ROOT>/.gitignore`" (with the diff lines), or "skipped
   gitignore edit per user choice — `.coord/` will be tracked".

4. **Next steps** — verbatim:
   ```
   `.coord/` is ready. To cold-boot the parallel-agent system:

   1. Open a Claude Code session at <TARGET_ROOT> (or any subdir).
   2. Run `/bongo:resume boss` to wake the supervisor.
   3. In a second session, run `/bongo:resume auditor`.
   4. Once the supervisor scaffolds lane assignments into
      `<COORD_ROOT>/.coord/inbox/coder-<N>.md`, open a session per
      coder and run `/bongo:resume <N>`.

   First-time hint: the supervisor will want a roster row in
   `<COORD_ROOT>/.coord/agents.md` and an opening HEADS-UP in
   `inbox/supervisor.md`. Either you add those before cold-boot, or
   let the supervisor's first response do it.
   ```

## Standing rules

- **Never** modify files outside `<TARGET_ROOT>` (other than reading
  templates from `~/.claude/commands/bongo/templates/`).
- **Never** edit the templates themselves — they are read-only inputs
  to scaffolding.
- **Never** scaffold without all three preflight refusals (Steps 1,
  2, 3+5) passing first. Refuse with a clear message — no partial
  writes.
- **Never** modify `<TARGET_ROOT>/.git/`, run `git commit`, or push.
  Scaffolding is filesystem-only; the user commits the result (or
  doesn't, per the gitignore choice).
- **Never** prompt for unmentioned placeholders — the placeholder set
  is fixed at 4 (`PROJECT_NAME`, `COORD_ROOT`, `REPO_NAME`,
  `MAX_CODERS`). New placeholders require a Phase 3+N amendment.

</process>
