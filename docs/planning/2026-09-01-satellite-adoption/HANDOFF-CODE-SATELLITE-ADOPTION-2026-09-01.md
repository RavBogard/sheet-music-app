# HANDOFF → Code: satellite adoption + hygiene (policy, not development)

Executor: Code (satellite-adoption lane) — a session on the HOST, not through the Cowork mount
Status: **DISPATCHABLE**
Authority: **R-0901-vision-4** · R-0901-vision-3 · R-0901-cont-1 §3 · R-0831-live-pagemap-1
No ruling ids spent by the executor.

**Assume no prior context.** Read, in this order: `~/shireishabbat/COORDINATION.md` (the law,
v1.1 — fifteen rules), `~/shireishabbat/AUDIT-FAMILY-2026-09-01.md` (why this order exists —
its §CentralReform.live is your defect list), `sheet-music-app/CLAUDE.md` (new, this ruling).
**Open a family row** on `~/shireishabbat/STATUS.md` before touching anything (this order was
minted cross-repo and retires frameworks — rule 2 applies); claim your paths, check the tail.

**Scope guard, hard:** Daniel is keeping DEVELOPMENT here quiet (R-0901-cont-1 §3). This order
is policy adoption and hygiene ONLY. No feature work, no dependency bumps, no deploy, nothing
under `src/` except W5's one instructions-string edit. Every git act host-side (rule 8 addendum);
every commit carries `Lane: satellite-adoption (Code)` (rule 13). Nothing is DELETED anywhere in
this order — retirement means MOVED, reversibly.

## W1 — commit the policy files (rule 12: tracked, never local-only)

In `sheet-music-app/`: commit `COORDINATION.md` (the stub, currently untracked), `CLAUDE.md` and
`AGENTS.md` (new, written by the vision lane 2026-09-01). Move the EXECUTED
`HANDOFF-CODE-FABLE-WAVE1-2026-08-31.md` (root, untracked — its work landed in the 08-31
commits) into `docs/` with the other historical handoffs, and commit it there. Doc-only wave,
doc-only gate: 0 NUL, 0 CRLF-flips beyond the files named, nothing under `src/` rides along.

## W2 — retire the non-family frameworks (rule 14)

Create `archive/frameworks/` at the CentralReform.live ROOT (outside the repo). MOVE, do not
delete: `.carl/`, `.gemini/`, `_claude-config/` → there. Inside `sheet-music-app/`: `.paul/` →
`archive/frameworks/paul/`; replace the CARL boilerplate in `.claude/CLAUDE.md` with one line
pointing at the repo-root `CLAUDE.md` — but KEEP `.claude/` itself working (settings, skills
stay; judgment call per file, state what you kept and why in the return). If any framework
config is tracked in git, the removal commits with the same lane trailer.

## W3 — worktree hygiene

Host-side, in `sheet-music-app/`: `git worktree list` → `git worktree remove` the four prunable
worktrees (all at the late-May commit; `--force` only if the tree is clean of non-generated
files — otherwise stop and list them in the return) → `git worktree prune`. MOVE the ~12 dead
husk directories (`sheet-music-app-*` siblings with no `.git`, incl. the `.STALE-BAK`) into
`_to_delete/` at the root. Nothing is deleted; Daniel empties `_to_delete/` himself.

## W4 — the root junk drawer

At the CentralReform.live root, MOVE into `_to_delete/`: the loose screenshots/PNGs, the 615 MB
`.claude-src-snapshot.tar.gz`, stray root `node_modules/` and `.next/`. MOVE into
`archive/root-scratch/`: `stitch_pro_music_dashboard/`, `.auditor-sweep*`, day-plan/letter
drafts, `FRAMEWORK-RESEARCH-2026-06-10.md`. LEAVE: `design-system/`, `design-mockups/`,
`AUDIT-PROMPT.md`, `COORDINATION.md`, this order and its return. If in doubt about any file,
archive rather than _to_delete, and say so.

## W5 — the MCP server posts the law (rule 12)

Find where the centralreform.live MCP server's `instructions` field is composed (it injects the
agent guide at startup; likely under `src/lib/mcp/`). Append one short paragraph: this server is
part of the family; the coordination policy is canonical at `shireishabbat/COORDINATION.md`;
cross-repo or liturgy-data work takes a family row on `shireishabbat/STATUS.md`. One string, no
behavior change. Commit; do NOT deploy — the string ships whenever Daniel next deploys.

## W6 — return

Write `HANDOFF-CODE-SATELLITE-ADOPTION-RETURN-<date>.md` beside this order: what moved where
(exact paths), what was committed (SHAs), what you kept in `.claude/` and why, anything you
stopped on. Append your CLOSED row to the family board with queue lines, including:
**FOR DANIEL:** (a) `origin/main` is stale since April while work ships on `master` — push
master over main, or change the default branch, or leave it? Not taken by this order. (b)
`_to_delete/` is loaded and awaits your `rm`. (c) the pagemap checklist
(`plans/artifacts/2026-08-30-crc-pagemap-checklist.md`) is still marked UNVERIFIED against the
physical books.
