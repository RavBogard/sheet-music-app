# iPad Fleet Launch — Autonomous Stress-Test Program (PARENT)

**Status:** dispatched 2026-05-22 (Friday — fleet launches TONIGHT Fri-eve + TOMORROW Shabbat morning). HIGH stakes, hard deadline.
**Goal:** find + stomp the last remaining bugs across the ENTIRE iPad user experience + system, with **NO humans in the loop** for the test runs. Setlists are already loaded for tonight + tomorrow morning.
**Author:** supervisor.

## The arc (this is step 1)
1. **Research (NOW, 2 parallel coders, this program):** verify the autonomous-test capability, design the thorough test matrix, and produce **ready-to-run prompts** for Claude Code (Playwright) + Claude Cowork test instances. Each lane validates its approach with a small live smoke before declaring the prompts ready.
2. **Execute:** fire the produced test/cowork instances (autonomous, no humans).
3. **Triage → fix wave:** a parallel coder sweep on whatever the tests surface, before the services.

Be FAST — research must land today so execution can run before tonight's service.

## ★ Verified foundation — the no-human auth path (use THIS, it's confirmed in source)
- `cycle-4/harness/lib/probe.mjs` → `mintSession({ baseUrl, bearer, uid, firebaseAuth })`:
  1. POST `/api/auth/test-session` (bearer-gated; uid must be `test-*`) → sets `__session` cookie **and returns a `customToken`** (META-003 fixed, master @ `8fec5291f`).
  2. With a Firebase Web SDK `Auth` instance → `signInWithCustomToken(auth, customToken)` → client listeners (`onAuthStateChanged`, `onSnapshot`) wake up = a REAL authenticated client session.
- This is the canonical path. The old `__c7_auth_for_probes__` / `NEXT_PUBLIC_PROBE_HARNESS_AUTH` global is NOT the current mechanism (not in src) — do NOT rely on it; verify against origin/master.
- Test identities: MCP `create_test_account` (+ `cleanup_all_test_data`) with a per-instance `uidPrefix` for isolation ([[feedback_sandbox_test_isolation]]). Bearer = MCP test-user bearer.

## ★ HARD SAFETY CONSTRAINTS (every test instance MUST enforce — non-negotiable)
1. **NON-DESTRUCTIVE to live data.** The real setlists/charts loaded for tonight + tomorrow are **READ-ONLY**. All destructive/write/stress paths use **test-* isolated fixtures** (own setlists, own accounts, uidPrefix). NEVER mutate, reorder, publish, or delete a real setlist/chart/library row. A test run that corrupts tonight's setlist is a catastrophic failure.
2. **Service-time guard on the LIVE monitor desk.** Today is Friday: **NO live monitor-desk writes during Fri-eve (tonight) or Shabbat-morning (tomorrow)** services ([[project_shul_cadence]], America/Chicago). The desk is "poke freely" ONLY in non-service windows (Fri daytime now). The live-desk path = the EXISTING safe `scripts/monitor-live-probe.mjs` (P0-B2) oracle ONLY (snapshots → writes a monitor/IEM bus → restores byte-identical), monitor/IEM buses only, programmatic service-time guard ON. Heavy/novel monitor stress runs against MOCK/test fixtures, NOT the live desk.
3. **Real iPad fidelity.** 11" iPad = **820×1180 WebKit** ([[project_band_ipad_hardware]]) — Playwright `webkit` + that viewport/device, NOT chromium-desktop. WebKit-specific bugs (PDF/ArrayBuffer/offline-precache, touch) only reproduce there.
4. **No humans.** Fully autonomous: auth via mintSession, fixtures via MCP, assertions programmatic. Cowork reality: ~75min single-thread, NOT walk-away; CFC+chrome.debugger does NOT work; the in-sandbox Playwright harness IS the path ([[feedback_cowork_real_harness]]).

## Two lanes (parallel, disjoint concerns)
- **R1 — iPad Perform / charts UX E2E** (coder-3): the core musician experience.
- **R2 — System stress: monitor/IEM + multi-iPad concurrency + data integrity + the live setlists** (coder-4).

Each deliverable = a strategy doc + ready-to-run autonomous test prompts (Claude Code Playwright AND/OR Cowork), validated by a smoke. Both are Tier-0 READ-ONLY research (no src changes); they may run the harness against test fixtures + the safe live oracle.
