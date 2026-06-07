# Lane: bongo-extract-plugin — Phase 4, Tier 2 (OUTWARD-FACING + CRC-mutating)

## Goal
Graduate **bongo** out of the CRC repo into its **own standalone Claude Code plugin repo**
so centralreform.live stops carrying bongo. Daniel-ratified 2026-05-21:
- **Name:** `bongo` (final — public repo + `/bongo:` command namespace stay).
- **Owner:** `RavBogard` → **github.com/RavBogard/bongo** (`gh` is already authed there).
- **Format:** **Claude Code plugin** (marketplace-installable), NOT a hand-rolled install script.

This is the highest-stakes bongo lane: it creates a PUBLIC repo, modifies CRC master (removes
files), and touches the live `/bongo:` command install that this very coordination system runs on.
**Sequence carefully and STOP at the two gates below before anything destructive.**

## What "bongo" is, on disk (VERIFIED 2026-05-21 — these paths exist)
1. **Commands + templates (the product), git-tracked in CRC AND user-level — identical copies:**
   - CRC-tracked: `sheet-music-app/.claude/commands/bongo/**` (21 files on origin/master:
     `README.md`, `init.md`, `pause.md`, `resume.md`, + `templates/{AUDITOR,CODER,README,SUPERVISOR,agents,protocol-README}.md`,
     `templates/cold-boot/{AUDITOR-startup,CODER-startup,README,SUPERVISOR-startup}.md`,
     `templates/inbox/{auditor,supervisor}.md`, `templates/shared/{claims,decisions,master-tip}.md`,
     `templates/{archive,status}/.gitkeep`).
   - User-level: `~/.claude/commands/bongo/**` (same 21 files — this is what actually runs today).
2. **Design-research, git-tracked in CRC:**
   - `sheet-music-app/.paul/research/bongo-evolution/{gsd,paul,carl}-teardown-FINDINGS.md`
     (gsd ✓ `dbad4d4d6`, paul ✓ `895f85ddc`; **carl FINDINGS landing in parallel — see dependency**).
   - `sheet-music-app/.paul/research/2026-05-19-bongo-phases-2-3-4-ROADMAP.md`.
   - Local-only (uncommitted, canonical tree): `bongo-evolution/ROADMAP.md` + the four
     `*-teardown-PROMPT.md` + this prompt + `.paul/research/2026-05-19-cold-boot-skill-pack-DESIGN.md`
     (verify which of these are tracked with `git ls-tree origin/master` before deciding what to move).
3. **The LIVE `.coord/` runtime** (`sheet-music-app/.coord/**`) is CRC's coordination STATE, gitignored.
   **DO NOT MOVE OR DELETE IT.** Only the GENERIC TEMPLATES (item 1's `templates/`) belong in the
   plugin; CRC's live coord state stays put. The plugin's `/bongo:init` scaffolds NEW projects FROM
   those templates — it does not carry any project's live state.

## Plugin format reference (research current format FIRST)
- Read `~/.claude/plugins/marketplaces/claude-plugins-official/.claude-plugin/marketplace.json`
  (marketplace schema) + a real plugin, e.g.
  `~/.claude/plugins/marketplaces/claude-plugins-official/plugins/claude-code-setup/.claude-plugin/`
  (a commands+skills plugin) — mirror their `.claude-plugin/plugin.json` shape.
- **Authoritative current format may have changed — verify.** Use the `claude-code-guide` agent
  and/or context7 for the up-to-date Claude Code plugin manifest + marketplace-distribution docs
  before finalizing the manifest. Don't ship a manifest shape you didn't confirm against current docs.

## Staged plan — STOP-and-report at gates ★

### Stage 1 — Build + publish the plugin repo (ADDITIVE, non-destructive)
- Research the plugin manifest format (above).
- Lay out a fresh repo with: `.claude-plugin/plugin.json` (name `bongo`, description, version `0.1.0`,
  command/skill globs), `commands/bongo/{resume,pause,init,README}.md` (from item 1, paths
  re-pointed to be project-agnostic — they already auto-detect coord-root by walk-up, confirm),
  `commands/bongo/templates/**` (the generic `.coord/` templates), `docs/` or `research/` carrying
  the bongo-evolution FINDINGS + roadmaps, `README.md` (install via marketplace, role overview,
  verb reference: resume/pause/init + the roadmap's planned ship/status/audit/help verbs as "future"),
  `CHANGELOG.md` (`v0.1.0` = extracted from CRC).
- Init git, commit, **create + push `github.com/RavBogard/bongo`** via `gh` — **PRIVATE**
  (Daniel-confirmed 2026-05-21; flip public later if desired).
- **★ GATE 1 — STOP and report** the repo URL + manifest before touching the live install or CRC.

### Stage 2 — Install from marketplace + verify (carefully — the live session runs on these commands)
- Add the repo as a marketplace source + install the `bongo` plugin (document the exact commands).
- Verify `/bongo:resume`, `/bongo:pause`, `/bongo:init` resolve **from the plugin** and behave
  identically (coord-root walk-up still works; `init` still scaffolds; templates intact).
- **Leave `~/.claude/commands/bongo/` IN PLACE** as a fallback until the plugin is proven over
  multiple sessions — do NOT delete the user-level install in this lane (removing it mid-session
  could break the supervisor/auditor/coders that depend on `/bongo:`). Flag its eventual removal
  as a follow-up.

### Stage 3 — Remove bongo from CRC (DESTRUCTIVE to CRC master — depends on carl)
- **DEPENDENCY:** wait until **carl-teardown (coder-2) has shipped** its FINDINGS to CRC master,
  so you sweep the COMPLETE `bongo-evolution/` trio in one removal (don't orphan carl's file).
  Coordinate via the supervisor inbox; if carl hasn't shipped, hold Stage 3 and report.
- `git rm` from CRC: `.claude/commands/bongo/**` + `.paul/research/bongo-evolution/**` +
  `.paul/research/2026-05-19-bongo-phases-2-3-4-ROADMAP.md` + the cold-boot-skill-pack DESIGN doc
  (only the tracked ones — verify each with `git ls-tree origin/master` first).
- **★ GATE 2 — STOP and report the exact removal list for supervisor/Daniel OK before you commit
  the CRC deletion.** Then narrow-lane cherry-pick FF onto fresh origin/master, push, update
  master-tip.md + agents.md.
- Add a one-paragraph `MIGRATION` note to the CRC commit body: bongo now lives at
  github.com/RavBogard/bongo; install via the marketplace; `~/.claude/commands/bongo/` stays as
  a transitional fallback.

## Hard rules
- **NEVER touch CRC's live `.coord/` runtime** (only the `.claude/commands/bongo/` tracked copies + research).
- **NEVER delete `~/.claude/commands/bongo/`** in this lane (live-session safety).
- Do not touch any non-bongo CRC code. bridge/**, src/**, mcp/ — out of scope.
- `gh` authed under RavBogard (coder-1 published the bridge release there). Confirm with `gh auth status`.
- Repo visibility is **PRIVATE** (Daniel-confirmed) — `gh repo create RavBogard/bongo --private`.
- Two STOP gates (★) are mandatory: report repo+manifest before live-install/CRC changes; report
  the CRC removal list before committing the deletion.
- Cut your worktree off fresh origin/master (`git fetch` first; shallow repo — confirm base).

## Deliverables
1. Published `github.com/RavBogard/bongo` (Claude Code plugin, v0.1.0).
2. Documented marketplace install/verify (Stage 2).
3. CRC removal commit on master (Stage 3, after carl + after Gate 2 OK) → CRC carries no bongo.
4. SHIP-NOTICE to supervisor at each gate + at final ship.

SHIP-NOTICE to supervisor (Tier 2, outward-facing). Auditor verifies the CRC-removal commit +
that `/bongo:` still resolves post-extraction.
