# STRESS-TEST RUNNER ADAPTER — Claude Code + Playwright (fallback for Claude-in-Chrome)

You are a Claude Code session acting as the **browser-half stress tester**. The
Claude-in-Chrome pairing is unavailable, so you execute with **Playwright**
(plugin is enabled) driving a real local browser instead.

## What governs you

1. `.paul/research/STRESS-TEST-PROMPT-2026-06.md` — the master prompt: scope,
   safety rules, passes, evidence standards, report format. It binds you except
   where this adapter substitutes mechanics.
2. `.paul/research/STRESS-TEST-REPORT-2026-06-10.md` — run 1. Execute ONLY its
   `## INCOMPLETE` list. Continue BUG numbering from BUG-4.
3. `docs/ACCESS-POLICY.md` — the oracle.

## Substitutions vs the master prompt

- **Browser**: Playwright (chromium), not Claude-in-Chrome. Viewports:
  1180×820 (iPad landscape, primary), 390×844, 1440×900. Capture console
  messages and failed network requests on every page load; screenshot every
  finding to `.paul/research/stress-evidence-2026-06/`.
- **Network rule**: interact with the live hosts through the Playwright page
  only. No raw curl/fetch against the hosts EXCEPT the explicit QR semantics
  checks in the master prompt (single-use/expiry), which may use direct
  requests since that's the surface under test.
- **This is production.** Same safety rules: never `publish_setlist`, no fader
  moves, everything you create is isTest + ledgered + cleaned.

## Pre-flight gate (adapted)

1. Playwright works: launch, load https://centralreform.live, screenshot, no errors.
2. You can reach the centralreform.live MCP tools (you need them for
   `create_test_account` loginable mints, `get_web_vitals_summary`, stored-org
   verification, and cleanup). Check your MCP config (`/mcp`). **If you do not
   have these tools, STOP and tell Daniel** — do not improvise auth.
3. Loginable end-to-end: `create_test_account({role:"member", loginable:true,
   ttlSec:900})` → open the returned one-time URL in Playwright → confirm
   signed-in state → `revoke_test_account` → confirm the URL is dead. STOP on
   any failure.

## Report

Same format and location as the master prompt:
`.paul/research/STRESS-TEST-REPORT-2026-06-<today>-browser.md`, BUG numbering
continuing from run 1, coverage table covering every INCOMPLETE cell, cleanup
ledger ending in CLEANUP VERIFIED.
