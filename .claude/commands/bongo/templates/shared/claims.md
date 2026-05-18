# File claims (shared-edit lease table)

Lease-style. Each row claims a file until its TTL expires. Other
agents read this BEFORE editing a shared file; if held by someone
else, send a BLOCKER message and wait.

| path | held by | claimed_at (UTC) | TTL | purpose |
|------|---------|------------------|-----|---------|
| _(no active claims)_ | | | | |

## Rules

- Claim BEFORE editing. APPEND a new row.
- Release by editing your row: "held by" → `released`, OR delete
  the row.
- TTL is human-readable: `30m`, `1h`, `2h`, `(session)`.
- Expired claims may be ignored by other agents.
- New files (no contention possible) need no claim.
- File paths are repo-relative.

## Standard shared files worth claiming

Enumerate project-specific shared files inline in your project's
`.coord/README.md`. Common examples across many projects:

- Route tables / middleware / proxy / catch-all routes
- Top-level layout / entry files
- Build config (e.g. `next.config.ts`, `vite.config.ts`)
- Dependency manifest (`package.json`, `pyproject.toml`, etc.)
- Test-suite config
- DB / auth rules
