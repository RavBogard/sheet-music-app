---
phase: v11-06-isolation-audit
plan: 03
status: complete
loop: APPLY done → UNIFY pending (phase transition: push + re-run probe + complete milestone)
date: 2026-06-09
---

# v11-06-03 SUMMARY — Live deployed-surface probe + AUDIT.md close-gate sign-off

## Result: BOTH TASKS DONE — live isolation proven (18/19), 1 deploy-pending UX item (not a leak)

## Task 1 — claim-free throwaway bearer + extended live probe — DONE_WITH_CONCERNS

- NEW `scripts/mint-throwaway-bl-bearer.mjs`: mints a BL-orgId mcpTokens doc tied to David's real uid,
  **NO setCustomUserClaims** (avoids issue-bl-bearer's orgIds-overwrite that would drop David's crc);
  prints raw→stderr, tokenId→stdout; `--revoke <id>` mode.
- Extended `scripts/e2e-bl-tenant-probe.mjs` with v11-05-collection coverage (templates/congregation/roster).
- LIVE RUN vs prod (throwaway BL + CRC_BEARER helper): **18/19 PASS**, throwaway **revoked**, David's claim
  verified intact (`orgIds=['crc','brotherslazaroff']`).
  - Isolated live: setlist by-id walls + create-stamp; templates (BL 0-id-overlap with CRC's 4); congregation
    identity (BL="Brothers Lazaroff", CRC="Central Reform Congregation"); CRC intact (5 setlists/4 templates/9 musicians).
  - **1 FAIL (not a security leak):** BL `leadHistory` showed 5 CRC setlists — v11-06-01's leadHistory scope
    fix is committed LOCAL but not yet deployed (ships on the phase push). Setlist names are public-by-design
    ([[feedback_setlist_public_policy]]); fix emulator-proven (11/11). Does NOT meet the cross-tenant-LEAK STOP
    criterion. → post-deploy re-run confirms 19/19.
- AC-1 (mostly, leadHistory deploy-pending), AC-2 (CRC intact), AC-3 (claim-free mint + revoke) satisfied.

## Task 2 — AUDIT.md close-gate sign-off — DONE

`.paul/phases/v11-06-isolation-audit/AUDIT.md`: all 3 adversarial axes (rules / MCP-escape / host-spoof) +
per-collection enforcement table + live-probe evidence + residual-risk register + coverage map. **VERDICT: GO.**
AC-4 satisfied.

## Quality floor
- mint + probe scripts node --check clean
- Live probe 18/19 (the 1 = deploy-pending public-by-design leadHistory)
- David's auth claim unchanged; throwaway bearer revoked
- No prod code change in this slice (probe/script/doc only); rules already deployed (v11-06-01)

## Deviations
- Live probe surfaced the leadHistory item as still-unscoped in PROD — expected (v11-06-01 fix not yet
  deployed). Resolution: the UNIFY phase transition pushes v11-06 → Vercel deploy → re-run probe → 19/19,
  then append the confirmation to AUDIT.md §Post-deploy re-run.

## Files created/modified
- `scripts/mint-throwaway-bl-bearer.mjs` (NEW)
- `scripts/e2e-bl-tenant-probe.mjs` (extended)
- `.paul/phases/v11-06-isolation-audit/AUDIT.md` (NEW)

## Next (UNIFY phase transition)
LAST plan in v11-06 → transition: stage `.paul/phases/v11-06-isolation-audit/` + scripts, commit, **push the
whole v11-06 phase** (99d625c492 + 666a4b60d5 + this) to `origin master` → Vercel deploy → **re-run the live
probe** (expect 19/19, append to AUDIT.md) → update ROADMAP/PROJECT → **/paul:complete-milestone** (v11.0).
