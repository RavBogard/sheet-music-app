# STRESS-TEST REPORT — Run 2 (2026-06-10)

Continuation of `STRESS-TEST-REPORT-2026-06-10.md` (Run 1). Per the stress-test
prompt's pre-flight gate (added after Run 1), this session was to execute ONLY
Run 1's `## INCOMPLETE` list — the browser-rendered surfaces.

> **RESULT: BLOCKED AT PRE-FLIGHT — same environment failure as Run 1.**
> The Claude-in-Chrome extension is not connected (`list_connected_browsers` → `[]`,
> two attempts). 100% of the INCOMPLETE list is browser-dependent, so no new cells
> could be exercised. Per the gate's hard rule I did **not** substitute curl/bash/fetch
> against the live hosts, and I created **no** test artifacts (nothing to clean up).
> BUG numbering is unchanged — no new findings. Run 1's findings (BUG-1..3) stand.

---

## Pre-flight gate results

| # | Check | Result |
|---|---|---|
| 1 | `list_connected_browsers` returns a connected browser | ❌ **FAIL** — `[]` on 2 attempts |
| 2 | centralreform.live MCP responds (`list_setlists`) | ✅ PASS — returned current setlists (CRC bearer) |
| 3 | `docs/ACCESS-POLICY.md` readable | ✅ PASS — v0.2, ratified 2026-06-10 |
| 4 | Loginable test account works end-to-end (mint `loginable:true` → open login URL in browser → land signed in → revoke → URL dead) | ⛔ **CANNOT RUN** — every step after minting requires the browser. Did not mint, since the verification half is impossible without Chrome and would only create an artifact to clean up. |

Check 1 is a STOP condition. Because the gate forbids testing around it, and
because the entire remaining workload depends on the browser, the session stops here.

## What remains untested (carried forward, unchanged from Run 1 `## INCOMPLETE`)

All of the following still require a connected Claude-in-Chrome extension, on
iPad landscape (1180×820) primary + iPhone (390×844) + desktop (1440×900) spot checks:

1. **Pass A step 1 — Anon, both hosts:** landing/branding, setlist list, setlist
   detail, Perform mode, chart deep link `/perform/[fileId]`, recording (D2),
   library URL (expect redirect/deny, D4), schedule (expect visible),
   `/manage` + `/admin` (expect deny), write controls invisible (inv 6). Capture
   console + network on every cold load.
2. **Pass A step 2 — cross-tenant deep links (D3):** open a broslaz chart/setlist
   URL from CRC context and as anon (expect opens); confirm UI lists stay
   host-scoped (inv 1); no CRC-brand leak on broslaz authed header (STATE BUG-6 retest).
3. **Pass A steps 3–5 — persona render gates:** test-member (library hidden D4),
   test-musician (full read, no buses), test-musician-bus (own-bus-only render D6),
   test-leader-crc on broslaz (clean authoring failure). **Depends on pre-flight #4**
   — a working loginable path must be confirmed first (Run 1 found UI accounts are
   minted `disabled:true`, blocking login; that's exactly what pre-flight #4 exists
   to verify, and it could not run).
4. **Pass A step 7 — QR (D5):** `/qr/[code]` + `/api/auth/qr` single-use / expiry /
   role fidelity.
5. **Pass B (all):** cold → find tonight's setlist → open → page/transpose → next
   song; play recording while viewing a chart; devtools-offline degradation; leader
   create → add 3 → reorder → delete *in the UI*. Journal friction.

The MCP/data-layer cells Run 1 marked ✅ were **not** re-tested (per the prompt).

## Cleanup ledger

No test artifacts created this session. Nothing to clean up. **CLEANUP VERIFIED (nothing to do).**

## To unblock the next run

Connect the Claude-in-Chrome extension on the testing machine and confirm it shows
under `list_connected_browsers`, then re-run this prompt. The MCP layer and policy
oracle are both confirmed live and ready.
