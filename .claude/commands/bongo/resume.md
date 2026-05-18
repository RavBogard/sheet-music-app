---
name: bongo:resume
description: Wake up or warm-resume a parallel-agent role from any `.coord/`-initialized project. Pass one role keyword (`boss`, `auditor`, or a coder number), optionally followed by `--repo <path>` to point at a specific project root.
argument-hint: "<boss | auditor | 1-N> [--repo <path>]"
allowed-tools: [Read, Bash, Grep, Glob, AskUserQuestion]
---

<objective>
Wake up as the named parallel-agent role and pick up state from
`.coord/`. This serves both cold-boot (first session for a role) and
warm-resume (re-firing after context clear) — both operations are
identical: read the role's persistent home file and the latest pickup
pointer.

**When to use:** Starting any new Claude Code session that should act
as supervisor, auditor, or coder-N for a `.coord/`-based parallel-agent
system.

**Paste fallback:** The canonical role prompts live at
`<coord-root>/.coord/cold-boot/{SUPERVISOR,AUDITOR,CODER}-startup.md`
and can be pasted directly into any session if `/bongo:resume` is
unavailable.
</objective>

<context>
$ARGUMENTS
</context>

<process>
1. **Resolve coord-root.** `$ARGUMENTS` contains a role keyword and may
   optionally contain `--repo <path>`. Apply, in order:

   a. **Explicit override.** If `$ARGUMENTS` contains `--repo <path>`,
      strip the flag (plus its value) from `$ARGUMENTS`, expand `~` /
      env vars in `<path>` if needed, and treat that path as
      coord-root. Confirm `<path>/.coord/cold-boot/` exists; if not,
      abort with a clear message: "no `.coord/cold-boot/` found under
      `<path>` — is this the right project root?".

   b. **Walk up from cwd.** Otherwise, start at the current working
      directory and check for `.coord/cold-boot/`. If absent, go up one
      directory and check again. Repeat until found or the filesystem
      root is reached. On Windows the walk-up applies the same way
      (Git Bash + native paths both work; treat `C:/` as the root).

   c. **Helpful failure.** If neither (a) nor (b) resolves, abort
      with: "no `.coord/cold-boot/` found by walking up from `<cwd>`,
      and no `--repo <path>` supplied. Either `cd` into a
      bongo-initialized project or re-invoke with
      `/bongo:resume <role> --repo <path>`."

   Bind the resolved coord-root for the rest of this process. Use it
   ONCE when reading the startup file; the startup file itself
   references its own `.coord/` neighbours via relative paths (or via
   the same coord-root, project-specific).

2. **Parse role keyword from the remaining `$ARGUMENTS`.** After
   stripping `--repo <path>` (if any), the remaining token is the
   role keyword.

3. **Dispatch by role keyword:**

   - `boss` → you are the SUPERVISOR. Read
     `<coord-root>/.coord/cold-boot/SUPERVISOR-startup.md` and follow
     it exactly. Sign messages `from supervisor`.

   - `auditor` → you are the AUDITOR. Read
     `<coord-root>/.coord/cold-boot/AUDITOR-startup.md` and follow it
     exactly. Sign messages `from auditor`.

   - a positive integer (`1`, `2`, …) → you are coder-<N>. Read
     `<coord-root>/.coord/cold-boot/CODER-startup.md` with `<N>`
     substituted to your number throughout, and follow it exactly.
     Sign messages `from coder-<N>`. (The project's `.coord/README.md`
     governs the active coder-cap; the resume command itself does not
     enforce one.)

   - empty / unrecognized → ask Daniel which role to resume via
     `AskUserQuestion`. Do not guess.

4. **Follow the startup file to completion** (reading
   `<coord-root>/.coord/{SUPERVISOR,AUDITOR,CODER}.md` as appropriate,
   `shared/master-tip.md`, `shared/decisions.md`, `shared/claims.md`,
   your own inbox if a coder, etc.) before reporting back to Daniel.

"boss" is a slash-command keyword only — the supervisor role is still
named `supervisor` internally and signs `from supervisor`. Do not
rename anything.
</process>
