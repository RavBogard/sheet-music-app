# `/bongo:` templates

This directory holds **generic, project-agnostic templates** of the
`.coord/` parallel-agent system. Phase 3 (`/bongo:init`) consumes
them to scaffold a fresh project's coordination directory.

Templates are **derived** from the canonical CRC files at
`sheet-music-app/.coord/*` in the originating project. They strip
project-specific Running-log content, lane history, and memory cross-
references, leaving only protocol-level prose.

## Layout

```
templates/
  README.md                    ← this file
  SUPERVISOR.md                ← supervisor role spec (Mission/Authority/Cadence/Escalation/Identity; empty Running log)
  AUDITOR.md                   ← auditor role spec (same shape, with binary-verdict + memory-hygiene workflow)
  CODER.md                     ← generic coder role spec
  protocol-README.md           ← parallel-agent protocol doc (file layout, schemas, push-protocol, anti-patterns) — Phase 3 copies to `<target>/.coord/README.md`
  cold-boot/
    SUPERVISOR-startup.md      ← paste-ready supervisor cold-boot prompt
    AUDITOR-startup.md         ← paste-ready auditor cold-boot prompt
    CODER-startup.md           ← paste-ready coder cold-boot prompt (substitute `<N>` per tab)
    README.md                  ← role-map + cold-boot procedure
  shared/
    master-tip.md              ← empty header (overwritten on first push)
    decisions.md               ← empty header (Daniel-append-only log)
    claims.md                  ← empty lease table
  inbox/
    supervisor.md              ← empty header with schema reference
    auditor.md                 ← empty header with schema reference
  status/                      ← empty dir (per-coder status files land here)
  archive/                     ← empty dir (rolled-over RESOLVED messages land here)
  agents.md                    ← empty agent roster table header
```

## Placeholder convention

Mustache-style placeholders (`{{NAME}}`) mark substitutions that
Phase 3 `/bongo:init` resolves at scaffold time:

| Placeholder | Resolved to | Example |
|---|---|---|
| `{{PROJECT_NAME}}` | Human-readable project name | `CRC music dashboard` |
| `{{COORD_ROOT}}` | Absolute or repo-relative path to project containing `.coord/` | `sheet-music-app/` |
| `{{REPO_NAME}}` | Top-level repo dir name | `sheet-music-app` |
| `{{MAX_CODERS}}` | Concurrent coder ceiling (optional) | `7` |

A template with no placeholders is project-agnostic as-is and Phase 3
copies it verbatim.

## When templates drift from canonical

The CRC `.coord/` files at `sheet-music-app/.coord/` remain the
**working reference**. When the protocol evolves (e.g. the
binary-verdict rule landed 2026-05-19), the canonical CRC files are
updated first; templates here are then re-derived to capture the
amendment.

Phase 4 distribution may pin a template-version tag so downstream
projects can resync.

## Not in scope here

- `/bongo:init` itself (Phase 3).
- Cross-machine distribution (Phase 4, likely GitHub repo).
- Verb expansion (`:ship`, `:status`, `:audit`, `:claim`, `:release`,
  `:help` — Phase 4+).

See `sheet-music-app/.paul/research/2026-05-19-bongo-phases-2-3-4-ROADMAP.md`
for the full roadmap.
