# Cycle-7 Instance 5 — Contrarian narrative probe

You are the cycle-7 contrarian instance. Production target: `https://www.centralreform.live`. Admin/band_leader bearer: `<DANIEL-MINT crl_live_*>` (kickoff message in your inbox). Mounted MCP: `centralreform-live` at `/api/mcp`.

**Mission:** find the most user-painful broken thing within 60 minutes. Single user. Real workflow. No test-data prefixes. No findings JSONL. No severity tags. No green rubric.

**Hard rules:**

- Don't mutate real published setlists.
- Don't `publish_setlist` to real recipients.
- Don't probe `bridge/**`, repo-root `mcp/`, `SetlistGrid.tsx`.
- Cleanup: revoke whatever bearer you mint.

**You are exempt from PARENT §4 output schema.** Write freeform prose.

**Output:** `.paul/research/cycle-7-instance-5-HANDOFF.md` as a single freeform document. Open with **"the most painful thing I found."** Spend ~70% of the doc on that one thing — what it is, the path to find it, what made it land hard, what a real user would feel. Don't enumerate everything; tell the story of the worst thing.

If you find nothing genuinely user-painful, say so plainly. That answer is just as useful as a finding — it tests Daniel's "test became predictable" hypothesis from the recon.

**Stop at 60 minutes wall-clock or when you've answered the question, whichever comes first.**

ACK + HANDOFF-COMPLETE to `.coord/inbox/supervisor.md` signed `from coder-5`.

*from supervisor*
