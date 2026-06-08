---
phase: v11-02-mcp-org-scoping
plan: 04
subsystem: mcp-multitenant
tags: [mcp, multi-tenant, orgId, bearer, custom-claims, prod-deploy, e2e, brotherslazaroff]

requires:
  - phase: v11-02-01
    provides: createMcpToken orgId field + verifyBearer org resolution from the token doc
  - phase: v11-02-02
    provides: read org-scoping (BL sees only BL)
  - phase: v11-02-03
    provides: write wall (BL cannot mutate CRC; creates stamp caller org)
provides:
  - David Lazaroff's live brotherslazaroff MCP bearer + orgIds:['brotherslazaroff'] claim
  - v11-02 org-scoping deployed to production (feat(v11-02) c7da31ac2a)
  - reusable scripts/issue-bl-bearer.mjs (bearer-mint + claim-merge) + scripts/e2e-bl-tenant-probe.mjs
  - docs/onboarding-brotherslazaroff.md (David's Claude-Desktop setup)
affects: [v11-03 host routing/branding, v11-05 cross-tenant isolation audit]

tech-stack:
  added: []
  patterns:
    - "Bearer mint outside the app: replicate createMcpToken's doc shape (tokenHash=sha256hex, uid, label, orgId, createdAt, lastUsedAt:null, revokedAt:null) so deployed verifyBearer accepts it"
    - "Custom-claim MERGE (never overwrite): setCustomUserClaims(uid, {...existing, orgIds:[...]}) preserves role"
    - "Live MCP e2e over JSON-RPC-on-SSE: POST /api/mcp, parse `data:` line; tools/call content[0].text is JSON"

key-files:
  created:
    - scripts/issue-bl-bearer.mjs
    - scripts/e2e-bl-tenant-probe.mjs
    - docs/onboarding-brotherslazaroff.md
  modified:
    - .paul/UAT-PENDING.md

key-decisions:
  - "David = his existing band_leader account (uid HTks9a8YRiVCQ5lVipUJcBsWjnB3, davidlazaroff@gmail.com) — Daniel decision 2026-06-08"
  - "Executor = this box via firebase-CLI-token→temp-ADC (Daniel 'you run it') — single-owner prod write"
  - "orgIds claim set by MERGE — preserve role:band_leader (set-role.js's overwrite pattern is the anti-pattern)"
  - "feat(v11-02) commit folded into APPLY (deploy must precede the live e2e), not the UNIFY transition"

patterns-established:
  - "Canonical prod MCP endpoint is https://www.centralreform.live/api/mcp (apex 307-redirects to www; curl -L drops the auth header — hit www directly)"
  - "Tenant-isolation e2e probe is reusable for v11-05 audit (parameterized by DAVID_BEARER + CRC_BEARER env)"

duration: ~55min
started: 2026-06-08T17:20:00Z
completed: 2026-06-08T18:15:00Z
---

# Phase v11-02 Plan 04: David's BL Bearer + Prod Deploy + Live e2e Summary

**Brothers Lazaroff is live as the first second tenant: David has an org-pinned MCP bearer, the v11-02 org-scoping shipped to production, and a 12/12 live e2e against www.centralreform.live/api/mcp proves David sees/edits only BL data and cannot touch CRC — with CRC unaffected.**

## Performance

| Metric | Value |
|--------|-------|
| Duration | ~55 min |
| Tasks | 3 completed (3 E/Q PASS) |
| Files created | 3 (2 scripts + onboarding doc) |
| Files modified | 1 (UAT-PENDING) |
| Checkpoints | 0 (autonomous; prod writes Daniel-authorized) |

## Acceptance Criteria Results

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: David has BL bearer + merged orgIds claim | ✅ Pass | tokenId `93JMXhT1OspFsWDMmb9V`, orgId=brotherslazaroff, tokenHash present, revokedAt null; claims read-back `{role:band_leader, orgIds:[brotherslazaroff]}` — role preserved |
| AC-2: v11-02 org-scoping live in prod | ✅ Pass | feat(v11-02) `c7da31ac2a` pushed; Vercel deploy `sheet-music-n8h5v0j4a` READY (2m); authed tools/list returns the tool set over SSE |
| AC-3: David tenant-isolated end-to-end | ✅ Pass | e2e probe 12/12: BL reads BL-only; create stamps BL (CRC can't see it); BL get/update/delete on CRC id `ncbvBvwFFxkqPey2HiuY` → not-found; CRC setlist unchanged; probe setlist cleaned up |
| AC-4: CRC unaffected by deploy | ✅ Pass | CRC bearer still lists its setlists (count=5, names intact) post-deploy |

## Accomplishments

- **First live second tenant.** David Lazaroff can now author Brothers Lazaroff setlists via Claude, fully isolated from CRC — the central promise of v11.0, proven on production.
- **v11-02 shipped.** The full caller-org seam + read isolation + write wall (v11-02-01/02/03) is deployed as one `feat(v11-02)` commit; CRC behavior unchanged (defaults to crc, all prod docs stamped in v11-01-03).
- **Live isolation proof, not just emulator.** 12/12 assertions against the real deployed endpoint, including an active "BL tries to HACK a CRC setlist" attack that returns not-found with zero mutation.
- **Reusable tooling:** `issue-bl-bearer.mjs` (idempotent bearer-mint + claim-merge, dry-run default) and `e2e-bl-tenant-probe.mjs` (parameterized isolation probe) — both serve the v11-05 audit.

## Task Commits

| Task | Commit | Type | Description |
|------|--------|------|-------------|
| Tasks 1–2 + all of v11-02-01/02/03 source | `c7da31ac2a` | feat | MCP org-scoping — caller-org resolution + read/write tenant isolation (the phase commit) |
| Task 3 artifacts | `779eab0a54` | test | live BL tenant-isolation e2e probe + David onboarding doc |

Both pushed to `origin master`. The raw bearer token was printed once at runtime and is NOT in git.

## Files Created/Modified

| File | Change | Purpose |
|------|--------|---------|
| `scripts/issue-bl-bearer.mjs` | Created | Resolve David + mint BL bearer + MERGE orgIds claim (dry-run default, --apply) |
| `scripts/e2e-bl-tenant-probe.mjs` | Created | Live JSON-RPC/SSE isolation probe (DAVID_BEARER + CRC_BEARER env) |
| `docs/onboarding-brotherslazaroff.md` | Created | David's Claude-Desktop MCP setup (token placeholder, no secret) |
| `.paul/UAT-PENDING.md` | Modified | Daniel: securely hand David the bearer + David's UX confirmation |

## Decisions Made

| Decision | Rationale | Impact |
|----------|-----------|--------|
| David = existing band_leader account | Daniel directive; no new account needed | Resolved uid HTks9a8… via DRY-RUN single-match scan |
| Executor = this box (CLI-token→ADC) | Daniel "you run it"; single-owner prod write | Bearer + claim written cleanly; temp ADC deleted |
| Claim by MERGE | Preserve role:band_leader | Avoided set-role.js's clobber bug |
| feat(v11-02) folded into APPLY | Live e2e needs deployed code | Phase commit landed in Task 2; UNIFY transition records-only |

## Deviations from Plan

| Type | Count | Impact |
|------|-------|--------|
| Sequencing clarification | 1 | None — improved correctness |

**1. Two commits instead of one.** The plan implied a single `feat(v11-02)`; in practice the deploy-critical code shipped as `c7da31ac2a` (Task 2) and the Task-3 test/doc artifacts (which don't affect the build) landed as a follow-up `779eab0a54`. No force-push, clean history, deploy integrity preserved. The follow-up's Vercel build is functionally identical (scripts/docs only).

## Issues Encountered

| Issue | Resolution |
|-------|------------|
| `git pull --rebase` refused ("unstaged changes") | Not a real blocker — we were 0 behind origin/master (it was an ancestor); nothing to integrate. Proceeded via `git reset --soft origin/master` to collapse the WIP commit + working tree into one feat(v11-02). |
| apex `centralreform.live/api/mcp` → 307; `curl -L` dropped the auth header | Canonical endpoint is `www.centralreform.live/api/mcp`; hit www directly with the bearer (documented in onboarding + probe). |
| MCP responds as SSE, not plain JSON | Probe parses the `data:` line; tools/call content[0].text is the JSON payload. |

## Next Phase Readiness

**Ready:**
- v11-02 done — MCP multi-tenancy is live and proven. v11-03 (host routing + brotherslazaroff.live branding + vocab trim) can build on a working BL tenant.

**Concerns / still-deferred (v11-04):**
- templates READ/LIST scoping, roster/musicians, congregation, service-personnel remain cross-tenant.
- **UAT-PENDING:** Daniel must securely send David the raw bearer (printed once, tokenId `93JMXhT1OspFsWDMmb9V`; revoke+re-mint if lost) + David's own UX confirmation. Server-side isolation is already proven.

**Blockers:** None.

---
*Phase: v11-02-mcp-org-scoping, Plan: 04*
*Completed: 2026-06-08*
