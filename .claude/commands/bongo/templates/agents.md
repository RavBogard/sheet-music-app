# Active agents

Every implementer agent (coder) APPENDS a row when it joins, then
edits its own row to mark complete on dissolve. Supervisor + auditor
do NOT appear here (they're standing meta roles tracked in their
own `.coord/SUPERVISOR.md` / `AUDITOR.md` Running logs).

| lane-id | started | status | worktree | branch | status-file |
|---------|---------|--------|----------|--------|-------------|
| _(no agents yet)_ | | | | | |

## Conventions

- **lane-id:** short kebab-case identifier, e.g. `cycle1-followup`,
  `auth-rewrite`, `mcp-monitor-control`. Distinct from coder numeric
  identity (which is shell-tab convention only).
- **started:** `YYYY-MM-DD` (and optional clock time if multiple
  agents land same day).
- **status:** `active` while working, `complete YYYY-MM-DD — <one-line outcome>`
  when shipped + torn down.
- **worktree:** path relative to repo parent (e.g.
  `../<repo>-<lane-id>/`).
- **branch:** the `feat/<lane-id>` branch (or similar). After
  FF-push to origin/<default-branch> + teardown, can be marked
  `consumed via FF-push to origin/<default-branch> @ <sha>`.
- **status-file:** path to the agent's status file inside `.coord/`.
