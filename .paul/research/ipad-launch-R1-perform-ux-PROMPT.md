# Lane R1 — iPad Perform / charts UX E2E test research (coder-3) — Tier 0 READ-ONLY research

Read `.paul/research/ipad-launch-stress-test-PARENT.md` FIRST (the verified auth path + the HARD safety constraints — both bind you).

## Mission
Design + VALIDATE a fully-autonomous (no-human) test of the **core iPad musician experience** — login → pick setlist → Perform → read/transpose/annotate charts → bind → gig-packet → offline — at the real iPad viewport, and produce **ready-to-run test prompts** (Claude Code Playwright + a Cowork exploratory pass). The single highest-value bug-catch for tomorrow: **does every chart in tonight's + tomorrow-morning's actual setlists render correctly on an 11" iPad?**

## Foundation (verify against origin/master, don't trust memory — [[feedback_cowork_prompt_verify_before_write]])
- **Auth:** `cycle-4/harness/lib/probe.mjs` `mintSession({baseUrl, bearer, uid, firebaseAuth})` → test-session cookie + `customToken` → `signInWithCustomToken` = real authenticated Web SDK session. Test uids via MCP `create_test_account` (uidPrefix isolation).
- **Viewport:** Playwright **webkit**, **820×1180** (iPad 11"). NOT chromium-desktop.
- **Surfaces:** `src/app/perform/{page,layout,error}.tsx`, `src/app/perform/setlist/[id]/page.tsx`, `src/app/perform/[fileId]/page.tsx`; chart renderers (MusicXML = SmartScoreViewer/OSMD — the STRATEGIC format, [[project_musicxml_goal]]; PDF = react-pdf, worker gotcha [[feedback_react_pdf_worker]]; scraped-text); PerformanceToolbar (transpose/annotate/zoom/metronome). Reuse `e2e/` (smoke.spec.ts) + `cycle-4/harness/`.

## Coverage matrix to design tests for
1. **Auth + entry:** mintSession → `/perform` setlist picker loads as an authenticated musician (Firebase listeners live).
2. **Setlist → Perform:** open `/perform/setlist/[id]`; nav next/prev chart; keyboard shortcuts; loading/error states.
3. **★ Chart render across ALL formats** (the launch-critical check): MusicXML/OSMD renders (SVG present, no throw), PDF renders (canvas present, worker resolves), scraped-text renders. Octet-stream mime routing ([[project_musicxml_goal]] weak link).
4. **Transpose / key-change** (MusicXML): transpose up/down → re-renders correctly, no crash.
5. **Annotate / zoom / metronome:** toolbar actions don't crash; state persists across chart nav.
6. **Chart-bind picker:** opens, lists candidates, binds (against TEST setlist only).
7. **Gig-packet:** generates/prints.
8. **Offline / precache:** F1 iPad WebKit ArrayBuffer precache path — load a setlist, simulate offline, charts still available.
9. **★ REAL-setlist render verification (READ-ONLY):** enumerate tonight's + tomorrow-morning's actual setlists (do NOT mutate); for EACH track/chart, drive Perform at iPad viewport and assert it renders. This is the bug that would embarrass us tomorrow — find it now.

## Oracles (programmatic, no human)
Console errors / unhandled rejections = fail; render success = expected DOM (canvas/svg/text node) present within timeout; visual screenshots per chart for the report; load-time perf budget; no infinite spinners.

## Deliverables (write to `.paul/research/`)
1. `ipad-launch-R1-STRATEGY.md` — the test matrix, the auth+viewport recipe, oracles, what's test-fixture vs read-only-real.
2. `ipad-launch-R1-claude-code-PROMPT.md` — a ready-to-paste Claude Code prompt that drives the Playwright/webkit autonomous run end-to-end (incl. the real-setlist render sweep).
3. `ipad-launch-R1-cowork-PROMPT.md` — a Cowork exploratory-UX prompt (within the ~75min single-thread reality; in-sandbox Playwright, NOT CFC).
4. **SMOKE PROOF:** actually run a minimal pass — mintSession → authenticated `/perform` at 820×1180 webkit → render ONE real chart → screenshot. Paste the result in the STRATEGY as proof the approach works. If the auth path or render fails, that IS a launch-blocking finding — surface it immediately to inbox/supervisor.md.

## Boundary
Tier-0 READ-ONLY: no `src/**` changes. May run the harness + write your research docs. Real setlists/charts/library = READ-ONLY (constraint #1). Coordinate with R2 (coder-4) on the real-setlist list: R1 = render/UX, R2 = data integrity of the same setlists. SHIP-NOTICE → inbox/supervisor.md (research) when the prompts + smoke are ready.
**Action required:** ACK in inbox/supervisor.md, then research + validate.
