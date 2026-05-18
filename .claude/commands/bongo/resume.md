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

**Paste fallback:** The canonical role prompts live at
`sheet-music-app/.coord/cold-boot/{SUPERVISOR,AUDITOR,CODER}-startup.md`
and can be pasted directly into any session if `/bongo:resume` is
unavailable.
</objective>

<context>
$ARGUMENTS
</context>

<process>
Parse `$ARGUMENTS`:

- `boss` → you are the SUPERVISOR. Read
  `sheet-music-app/.coord/cold-boot/SUPERVISOR-startup.md` and follow
  it exactly. Sign messages `from supervisor`.

- `auditor` → you are the AUDITOR. Read
  `sheet-music-app/.coord/cold-boot/AUDITOR-startup.md` and follow it
  exactly. Sign messages `from auditor`.

- `1`, `2`, `3`, `4`, `5`, `6`, or `7` → you are coder-<N> where `<N>`
  is the numeric argument. Read
  `sheet-music-app/.coord/cold-boot/CODER-startup.md` with `<N>`
  substituted to your number throughout, and follow it exactly. Sign
  messages `from coder-<N>`.

- empty or unrecognized → ask Daniel which role to resume via
  `AskUserQuestion`. Do not guess.

Once the startup file is read, follow its instructions to completion
(reading `.coord/{SUPERVISOR,AUDITOR,CODER}.md` as appropriate,
`shared/master-tip.md`, `shared/decisions.md`, `shared/claims.md`,
your own inbox if a coder, etc.) before reporting back to Daniel.

"boss" is a slash-command keyword only — the supervisor role is still
named `supervisor` internally and signs `from supervisor`. Do not
rename anything.
</process>
