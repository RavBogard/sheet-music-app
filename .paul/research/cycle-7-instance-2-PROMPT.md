# Cycle-7 Instance 2 — In-app editor + library UI deep-walk

**Read order:** `.coord/CODER.md` → `.coord/README.md` → `.coord/shared/master-tip.md` → `.coord/shared/decisions.md` → `.coord/shared/claims.md` → **`.paul/research/cycle-7-cowork-PARENT.md`** (full) → THIS FILE.

**Role:** PROBE instance, NOT implementer. Skip CODER.md §Worktree-setup. No branch, no ship.

**Bearer:** `<DANIEL-MINT crl_live_*>` (band_leader role).

**uidPrefix:** `c7i2`.

**Wall-clock budget:** 110 min. Boot ~10min + UI walk ~85min + HANDOFF ~15min.

---

## §0 — Mission

Walk the in-app authoring + consumer UI surfaces that **Daniel hasn't touched in weeks** per `[[user_mcp_is_primary_author_workflow]]`. These are David's and Randy's fallback paths when MCP misses, and they may have **silently rotted**. Per recon Agent A §5 ("hidden-dependency rot inventory") + Agent C §5 (browser-reality probe gap), this is one of the highest-likelihood undetected-failure-mode zones in the codebase.

**Use iPad-emulated Playwright via `cycle-4/harness/lib/probe.mjs`**, NOT Chromium desktop default. The real consumer surface is iPadOS Safari; Playwright iPad-mini profile (touch + isMobile + DPR 2) is the closest synthetic match available. Absolute CWV/RTT is structurally unattainable per PARENT §3; capture **layout, touch-target, interaction sequencing, console errors, network failures** instead.

---

## §1 — Routes to walk (in priority order)

For each route: navigate as authed band_leader (Web-SDK auth wired per PARENT §3); capture screenshot; run axe-core; assert load + interactive states; record console + network errors.

1. **`/setlists/[id]` setlist editor** — the load-bearing in-app authoring surface.
   - Pick a real setlist via `list_setlists` (read-only — do NOT create test data on this route; use a real existing setlist read-only).
   - Probes: SetlistGrid renders (do NOT touch the component — `SetlistGrid.tsx` is in CODER.md do-not-touch zone, but observing its rendered output is fine); drag-drop reorder interaction; vocal-lead picker per `[[feedback_terminology]]` ("Vocal Lead" not "Lead"); add-track flow; transpose; metronome; key-change. Visit BUT DO NOT MUTATE.
   - Read-only override: if probing requires a mutation, switch to a `c7i2`-prefixed test setlist instead (use `create_setlist({isTest:true})` per `[[feedback_setlist_public_policy]]`).

2. **`/library` library page + `UploadDialog` + `ScraperModal`** — 8+ endpoint surface (per Agent A §5) untouched by Daniel for weeks.
   - Probes: search bar response; alphabetical sort; pagination per cycle-5 Lane (50/page); filter "Shabbat morning"; open chart; **open `UploadDialog`** (don't submit); **open `ScraperModal`** (don't submit); annotation toolbar visibility.
   - This is the David/Randy MCP-fallback path. Render failures here = silent value-prop loss.

3. **`/manage/templates`** — template authoring UI; Lane 2 ships MCP wrapper but the UI itself remains an alternate path.
   - Probes: 16 hardcoded liturgical templates from `src/lib/liturgical-templates.ts` enumerate; user-created templates from `setlistTemplates/{templateId}` (Lane 2 collection) appear; create-template form interaction; clone-to-setlist flow.

4. **`/perform/setlist/[id]` consumer side** — public-by-design per `[[feedback_setlist_public_policy]]`.
   - Probes: Logic-Pro track row density per `[[feedback_no_cover_art]]`; chart-binder picker; track-tap → chart-fetch path; `PerformanceToolbar` (full) — transpose, annotate, zoom, metronome; `PerformanceBottomBar` per memory note "kept but no longer used in PDFOverlay" — confirm safe-to-delete OR find a forgotten consumer.

5. **`/perform/[fileId]` single-chart deeplink** — distinct from setlist view; push deeplinks may target this. Untouched by any prior cycle.
   - Probes: cold-route load; PDF render; auth gate behavior.

6. **`/settings` MCP token UI** — Daniel hits this every cycle to mint/revoke bearers. After 5 burned bearers + 7 reserved over cycle-6, the revoke UX at N=5 has never been measured.
   - Probes: list tokens; click revoke; confirm revoke; create new bearer. (Do NOT actually revoke your active bearer.)

7. **`/login` page** — refresh state for the Lane 5 unauth-edge `f9cfaaf02` ship (inline legal-nav + `/accessibility` route).
   - Probes: unauth render; legal-nav links resolve; CSP nonce path holds; bundle size sane.

---

## §2 — iPadOS Safari proxy (closest synthetic to real device)

In `probe.mjs` profile presets (per Agent B §1 capability g): iPad Mini = `{ viewport: 768×1024, isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: <iPad-Safari-string> }`. Use this for ALL routes above.

**Capture under this profile:**

- Viewport-overflow: any `position:fixed` or `bottom:0` element conflicting with iPad gesture-bar safe area (`env(safe-area-inset-bottom)` zone). HIGH severity if found on `/perform/setlist/[id]` `PerformanceToolbar`.
- Touch-target minimum 44×44 px per WCAG 2.5.5; axe-core can backstop.
- Tap delay / scroll-snap regressions.
- Pinch-zoom: viewport `maximum-scale=5` was unlocked at C6B-012 (cycle-6 POLISH); confirm still in effect.

---

## §3 — Acceptance assertions

- **A1.** All 7 routes render without console errors at iPad-Mini viewport.
- **A2.** axe-core run on each: HIGH violations = 0; MEDIUM ≤ 5 per route.
- **A3.** `PerformanceToolbar` on `/perform/setlist/[id]` does NOT overlap iPad gesture-bar safe area at any rotation.
- **A4.** `UploadDialog` and `ScraperModal` on `/library` open without 500/CSP errors.
- **A5.** Lane 2 user-created templates (in `setlistTemplates/{templateId}`) actually render in `/manage/templates` alongside the 16 hardcoded liturgical ones, NOT only via MCP.
- **A6.** `/perform/[fileId]` deeplink resolves to a valid chart-render path (no 404 / no orphaned-route).
- **A7.** `/settings` token-list page renders all minted bearers; revoke button visible.
- **A8.** `PerformanceBottomBar` — confirm via grep + render-observation whether it has any active consumer at master. Resolves the memory note's "safe to delete OR forgotten consumer" question.

---

## §4 — Real-data discipline (read-only override)

Per PARENT §5 standing rule 1 (no mutate prod): instance 2's default mode is **read-only navigation against real production setlists**. You may pick existing setlists from `list_setlists` to navigate, but **do not edit them**. If a probe requires an editable surface, create a `c7i2`-prefixed test setlist via `create_setlist({isTest:true, uidPrefix:'c7i2'})` and operate on that.

Chart access on `/perform/setlist/[id]` is public-by-design per `[[feedback_setlist_public_policy]]`; no privacy concern in opening real setlists. **Do not screenshot anything containing user PII** (e.g., individual musician names beyond "Vocal Lead" attribution which is intended).

---

## §5 — What this instance does NOT probe

- MCP tool multi-turn drift — Instance 1.
- Concurrent multi-user edits — Instance 3.
- Production data inspection / orphan baseline drift — Instance 4.
- Freeform contrarian narrative — Instance 5.
- Real-iPad hardware behavior — Daniel's Friday pillar.

SCOPE-NOTE findings (INFO severity) acceptable; do not deep-probe.

---

## §6 — HANDOFF requirements

Write `.paul/research/cycle-7-instance-2-HANDOFF.md` per PARENT §4. Specific to this instance:

- One `## Route walk` subsection per route with screenshot + axe summary + console-log capture.
- Per acceptance assertion (A1–A8): PASS/FAIL with evidence path.
- `## Repros` section with prod-SHA-stamped transcript for every HIGH/MED finding.
- `.paul/research/cycle-7-instance-2-findings.jsonl` per schema.
- Screenshots + HARs under `.paul/research/cycle-7-instance-2-artifacts/`.
- Cleanup checklist: zero residual `c7i2-*` test setlists; bearer burned.

ACK + HANDOFF-COMPLETE to `.coord/inbox/supervisor.md` signed `from coder-2`.

---

## §7 — Bail-out conditions

Per PARENT §3 boot expectations. Specific to this instance:

- HARD-BLOCK: bearer rejected, `probe.mjs` missing, iPad-mini profile preset absent in probe.mjs (synthesize inline acceptable if simple).
- DEGRADED-OK: axe-core lib unreachable (document, continue with manual a11y observation); `/settings/mcp` page itself broken (document as A7 FAIL, continue).

---

*from supervisor*
