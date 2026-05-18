# `/bongo:` — parallel-agent slash commands

`/bongo:` is a lightweight slash-command pack for running a
file-based parallel-agent coordination system on top of Claude Code.
It's the user-facing surface for a `.coord/` directory that holds
supervisor / auditor / coder role state, inbox messages, file claims,
and a shared push baseline.

This README is the tracked surface doc — it ships with the code so
the protocol is visible on GitHub even though the running `.coord/`
state files are gitignored / local-only.

## What's installed

| File | Purpose |
|---|---|
| `resume.md` | `/bongo:resume <boss\|auditor\|N> [--repo <path>]` — cold-boot or warm-resume a parallel-agent role. Resolves coord-root via walk-up-from-cwd or explicit `--repo` override. |
| `pause.md` | `/bongo:pause [<role>] [--repo <path>]` — write a pickup pointer for the current role; auto-detects role from in-session persona. |
| `templates/**` | Project-agnostic generic snapshots of the `.coord/` directory structure. Consumed by Phase 3 `/bongo:init` to scaffold a fresh project. |

## How to use

### Wake up as a role

```
/bongo:resume boss            # supervisor
/bongo:resume auditor         # auditor
/bongo:resume 3               # coder-3
/bongo:resume boss --repo ~/proj  # explicit project root
```

The command resolves `<coord-root>` by walking up from the current
working directory until it finds `.coord/cold-boot/`. Override with
`--repo <path>`. Helpful failure message if neither resolves.

It then reads
`<coord-root>/.coord/cold-boot/{SUPERVISOR,AUDITOR,CODER}-startup.md`
and follows the paste-fallback prompt exactly. Same path either way
— `/bongo:resume` is a thin pointer, not a replacement.

### Pause and write a pickup pointer

```
/bongo:pause                  # auto-detect role from sign-off
/bongo:pause auditor          # explicit override
/bongo:pause --repo ~/proj    # explicit project root
```

Pickup pointer lands in:

- **supervisor** → prepended to
  `<coord-root>/.coord/SUPERVISOR.md` Running log
- **auditor** → prepended to `<coord-root>/.coord/AUDITOR.md`
  Running log
- **coder-N** → HEADS-UP appended to
  `<coord-root>/.coord/inbox/supervisor.md` + status file at
  `<coord-root>/.coord/status/coder-N.md` updated

## The `.coord/` system at a glance

A `.coord/` directory holds the operational state of a
parallel-agent setup. Three role types:

- **Supervisor** (1, standing) — monitors, maintains, bootstraps
  agents. Doesn't ship code.
- **Auditor** (1, standing) — independently verifies SHIP-NOTICEs,
  cross-lane regression sweep, memory hygiene. Doesn't ship code.
- **Coder-N** (up to N, transient) — implementation agents working
  in isolated `git worktree`s. Ship code.

Coordination is **file-based**: inbox messages, status files,
shared claims, master-tip SHA, decisions log. No daemon. Survives
context clears.

Full protocol at `<coord-root>/.coord/README.md` once the system is
initialized in a project. Generic template at `templates/protocol-README.md`.

## Paste fallback

If `/bongo:` is unavailable in a session (e.g. on a machine without
the user-level install, or a session where the commands didn't
register), the canonical role prompts at
`<coord-root>/.coord/cold-boot/{SUPERVISOR,AUDITOR,CODER}-startup.md`
can be pasted directly into a fresh Claude Code session. Same
result.

## Multi-phase roadmap

`/bongo:` is being built out across phases:

- **Phase 1** (shipped 2026-05-19) — CRC-local thin pointers:
  `/bongo:resume` + `/bongo:pause`, hardcoded paths.
- **Phase 2** (this lane) — cross-project portability: `<process>`
  resolves coord-root dynamically; templates extracted from
  canonical CRC role specs for Phase 3 consumption.
- **Phase 3** (planned) — `/bongo:init`: scaffold a `.coord/`
  directory in any new project from `templates/**`.
- **Phase 4** (planned) — cross-machine distribution: GitHub repo
  + install script (or Claude Code plugin if that format fits).

Verb vocabulary will expand post-Phase-4: `:ship`, `:status`,
`:audit`, `:claim`, `:release`, `:help` are likely candidates.

See the originating project's roadmap doc at
`sheet-music-app/.paul/research/2026-05-19-bongo-phases-2-3-4-ROADMAP.md`
for the full plan.

## Naming

"bongo" is provisional — Phase 4 distribution may rename. "boss" is
a slash-command keyword only; the supervisor role stays named
`supervisor` internally and signs `from supervisor`.
