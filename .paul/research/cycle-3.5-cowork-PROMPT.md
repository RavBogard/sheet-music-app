# Cycle-3.5 cowork — P2 browser-surface sweep via Claude for Chrome

> **DO NOT COMMIT THIS FILE WITH BEARER INTACT.** Bearer is LIVE at
> §0. Scrub before any `git add` or rotate via admin MCP first.
> Companion of cycle-2 + cycle-3 prompts that already follow this
> discipline; both are still untracked (`??` in git status).

---

## §0 — Identity, bearer, scope

**You are cowork.** You run autonomously in a single Claude Desktop
session for 2-4 hours, driving Chrome via the **Claude for Chrome**
browser extension. You are NOT scripted (no Playwright, no Puppeteer,
no test files); you are an agentic browser with MCP tool access.

**Run window:** 2-4h exhaustive of the P2 coverage gaps cycle-3 left
open. Self-converge earlier if P2 axes settle clean.

**DRIVER_BEARER (admin):**
```
crl_live_8f8962746a5694ae1a1782213342e0ac49ace11178cb0631f6032fef8122a2a0
```
Treat as burned by the end of this run; never echo in findings.jsonl,
HARs, screenshot metadata, or convergence.log. Daniel rotates after.

**Production target:** `https://centralreform.live/` (master prod;
no preview branches).

**Output dir:** `sheet-music-app-mcp/outputs/autonomous-run/cycle-3.5/`
(same layout as cycle-2 / cycle-3 trees).

---

## §1 — Mission (P2-only)

Cycle-3 cowork ran in ~24min and explicitly left P2 browser-side
coverage UNEXECUTED — only HTTP-layer probes via curl. Quoting
cycle-3 HANDOFF-TO-SUPERVISOR.md:

> P2 (browser surface) — HTTP-layer only. Playwright viewport/a11y/CWV
> probes NOT executed. /manage/library-review confirmed authed-shipped
> (47KB HTML); no deeper visual probes. Cycle-4 pickup.

You ARE that pickup, with the harness swap: **Claude for Chrome**,
not Playwright. You navigate real Chrome with real auth cookies,
inject DevTools probes via `chrome.devtools` / `evaluate`, capture
screenshots + accessibility trees + CWV metrics + HARs.

**Disjoint from the in-flight wave.** Four implementer agents are
running in parallel right now (`cycle3-envelope`,
`cycle3-reconcile-data`, `cycle3-ai-read-tools`, `cycle3-micro-bundle`)
migrating MCP error shapes, hygiene tools, AI read projection, and
4 micro-fixes. You **do not probe** what they're touching. Your
lane is the **browser-rendered surfaces** they aren't editing:

| Surface | Why it's disjoint |
|---|---|
| `/perform` | Consumer surface; FaderStrip/MatrixPanel/BusAssignment + chart-binder. Wave touches none of this. |
| `/setlists` (list + edit) | Library mgmt UI; wave touches MCP tools but not UI. |
| `/library` tab | Catalog UI. |
| `/manage/library-review` (a4) | UI shipped at master `6a126f189`; wave only touches its HTTP routes (envelope sweep). UI surface stable. |
| `/v2/*` stub | Pro Performance Aesthetic foundation shipped at `73f63b4ec`. Cycle-3 light-probed (`/v2`, `/v2/library` 307'd); deeper walk now. |
| Login + auth flow | Existing surface. |
| Mobile viewports | iPhone SE, iPad mini, common Android — beyond cycle-3's iPad-only. |
| b6 / b7 Playwright suites (read-only audit) | Static analysis of test coverage. |

---

## §2 — Harness: Claude for Chrome

You drive Chrome via the **Claude for Chrome** browser extension
(NOT Playwright, NOT Puppeteer, NOT a headless harness). Conventions:

- **Auth:** Daniel's logged-in admin session is available in the
  active Chrome profile. For role-specific probing, use the MCP
  bearer at §0 to mint test users via `create_test_account`, then
  use `/api/auth/test-session` to acquire role-specific cookies in
  separate Chrome tabs/profiles.
- **Probes:** `evaluate` injected scripts for axe-core / CWV
  PerformanceObserver / accessibility tree dumps; native screenshots
  for visual artifacts; DevTools Network capture for HARs.
- **Mobile viewports:** Chrome DevTools device-emulation toggle —
  switch viewport + UA between probes.
- **Output:** save screenshots, HARs, axe reports as files under
  `cycle-3.5/artifacts/<FINDING_ID>/` mirroring cycle-3 layout.

**You SHOULD use these MCP tools** (admin bearer §0):
- `create_test_account({role: 'band_leader' | 'musician' | 'member'})`
- `cleanup_all_test_data()` (P5)
- `revoke_test_account({uid})` (P5)
- `list_test_accounts()` (P5 audit)
- `set_ai_threshold` / `set_ai_auto_apply` (only if needed for review-
  queue surface state setup; restore baseline at P5)

**You SHOULD NOT probe via MCP:**
- Error envelope shape (cycle3-envelope is migrating it; emits would
  be noise)
- F-05 refusal shape (REG-003 migration in flight)
- Hygiene tool response shape (cycle3-reconcile-data is adding coverage
  field)
- Library read-tool shape (cycle3-ai-read-tools is adding enrichment
  fields)
- `verify_setlist_charts` shortcut-mime behavior (cycle3-micro-bundle
  is fixing BUG-002)
- `/api/auth/test-session` admin-bearer branch (cycle3-micro-bundle is
  adding UX-001 — current behavior is self-mint-only; treat as known)
- Any /api/* unmatched 404 shape (cycle3-micro-bundle is adding JSON
  404 middleware)

These are MOVING TARGETS. Probing them emits stale findings the
moment the wave ships. Stay browser-side.

---

## §3 — Hard boundaries

- **NO mutations to real prod data.** Use test users + isolated test
  setlists ONLY. Same discipline as cycle-2 / cycle-3.
- **NO probe of `bridge/**`** (CRIT-003 per memory; do-not-touch).
- **Chart bytes are intentionally public** per
  [[feedback_chart_access_policy]] — do NOT flag accidental public
  access as a finding.
- **NO commit of this prompt with bearer intact.**
- **NO probe of MCP tools listed at §2 "SHOULD NOT".**
- **Cleanup discipline (P5):**
  - `cleanup_all_test_data` removes every test user + cascade.
  - Restore `aiConfig` baseline if you touched it.
  - Bearer-leak audit across all outputs (`grep -r 'crl_live_'`).
  - Delete any saved test cookies / HARs containing bearers.

---

## §4 — Coverage scope (P2 axes)

For each surface in §1 table, probe these axes:

### 4.A — Accessibility (a11y)
- Inject axe-core via `evaluate`, run on each page state, emit
  violations.
- Manual keyboard-only walk: Tab order makes sense; no traps; visible
  focus ring; Escape closes overlays.
- Screen-reader semantics: ARIA roles / labels / live regions present
  where needed (esp. for status banners + queue counts + toast
  notifications).
- Color contrast: WCAG AA on all text. Specifically check the v2
  Pro Performance Aesthetic palette tokens; amber + indigo +
  glass-v2 combinations.

### 4.B — Core Web Vitals (CWV)
- Inject PerformanceObserver for LCP, CLS, INP. Capture cold-cache
  + warm-cache numbers.
- LCP target: < 2.5s. CLS: < 0.1. INP: < 200ms.
- Per surface: which element is LCP? Is there a CLS culprit (font
  swap? lazy image?)?
- Capture as a single JSON per surface under `cycle-3.5/artifacts/cwv/`.

### 4.C — Visual integrity
- Screenshot at 3 viewports per surface: desktop (1440), tablet
  (iPad mini portrait), mobile (iPhone SE).
- Check: no overflow, no horizontal scroll on mobile, no broken
  Logic-Pro density rows, no orphaned glass-v2 panels.
- Compare /v1 vs /v2 surface aesthetic where /v2 exists.

### 4.D — Keyboard-driven flows
- /perform: arrow keys / space / transpose hotkeys; metronome controls.
- /manage/library-review (a4): j/k navigate, 1/2/3 tabs, a/r/e
  actions, / filter, Esc cancel, Enter expand. b7 shipped 3 access-
  gating tests but the keyboard flow itself is unverified UAT.
  PROBE IT END-TO-END.
- /setlists: arrow-key row navigation if present; Enter to edit.

### 4.E — Mobile viewport
- iPhone SE (375×667), iPad mini portrait (768×1024), common Android
  (412×915 Pixel-style).
- Touch targets ≥ 44px per WCAG.
- Pinch-zoom not disabled.
- Forms usable without keyboard hover.

### 4.F — Error + empty + loading states
- Network-offline simulation: each surface — does it surface a
  meaningful state?
- Slow-3G simulation: skeleton/loading UX present?
- Empty states: no setlists, no library rows, no charts bound to
  perform. Does the empty render guide the user?
- Auth-expired in mid-session: server-side gate kicks in?

### 4.G — Test-suite static audit (read-only)
- Inspect b6 + b7 e2e suite (`e2e/*.spec.ts`). Count `test.skip`,
  identify coverage gaps the suites declared. Cross-reference with
  what you observed.
- This is a META finding — `feature_gap` axis with `test_coverage`
  tag.

---

## §5 — Test identity provisioning

P0 setup:
1. Mint 3 test users via MCP: `create_test_account({role: 'band_leader'})`,
   `({role: 'musician'})`, `({role: 'member'})`. Capture bearers.
2. For each role, open a **separate Chrome profile** (or use
   `evaluate` to drop cookies into an incognito session) and POST
   to `/api/auth/test-session` with that role's bearer. Capture
   Set-Cookie. Save to `cycle-3.5/artifacts/_cookies/<role>.txt`.
3. NOTE: Admin role — Daniel's existing logged-in session in the
   default Chrome profile IS admin. Do NOT mint an admin via
   create_test_account; it intentionally refuses (per test-tokens.ts:53,
   admin not in TEST_ROLE enum). For admin browse, use the active
   profile.

P5 teardown:
1. `cleanup_all_test_data()` — cascade.
2. Delete `_cookies/` dir (cookies are dead once bearers revoked, but
   leaving them is sloppy).
3. `list_test_accounts()` should return `[]`.

---

## §6 — Phases (with checkpoint log)

Write each transition to `cycle-3.5/convergence.log`:

```
ts=<iso> phase=<P0|P1|P2|P3|P4|P5> event=<entered|complete|skipped> notes=<short>
```

- **P0 — Bootstrap** (~10 min)
  - Mint test users; capture cookies per §5.
  - Open all 8 surfaces in tabs (admin first, then per-role).
  - Snapshot initial state.
- **P1 — Surface walk** (~30-45 min)
  - Visit each surface authed + unauthed. Capture HARs, screenshots,
    HTML payload sizes, initial console errors.
  - Note loading patterns + first-render shape.
- **P2 — a11y exhaustive** (~30-45 min)
  - Run axe-core on every captured state.
  - Manual keyboard walk per §4.D.
  - Emit findings per violation cluster (don't emit one per axe rule —
    group thematically).
- **P3 — CWV** (~30 min)
  - PerformanceObserver per surface, cold + warm. Capture trace exports
    via DevTools if useful.
- **P4 — Mobile viewports** (~30-45 min)
  - Repeat surface walk under iPhone SE / iPad mini / Android Pixel.
  - Screenshot diff vs desktop.
- **P5 — Cleanup + bearer-leak audit + emit summary** (~10 min)
  - `cleanup_all_test_data`; restore aiConfig if touched.
  - Grep all outputs for `crl_live_`. Should be 0 hits.
  - Write HANDOFF-TO-SUPERVISOR.md (executive summary table).
  - Write `_summary.json` + `cleanup-audit.json`.

Self-converge if all 8 surfaces × 7 axes are exhausted before budget.

---

## §7 — Per-surface probe matrix

For each (surface, axis) cell, emit findings as discovered. Severities:
HIGH (band-blocking), MED (visible quality issue), LOW (polish),
NOTE (observational / next-cycle).

| Surface | a11y | CWV | Visual | Keyboard | Mobile | States | Test audit |
|---|---|---|---|---|---|---|---|
| `/perform` | □ | □ | □ | □ (transpose/metronome) | □ | offline + empty | b6 perform-flow |
| `/setlists` | □ | □ | □ | □ | □ | empty | b6 chart-bind-picker |
| `/setlists/<id>` | □ | □ | □ | □ | □ | drift-banner | F-017 |
| `/library` | □ | □ | □ | □ | □ | empty | — |
| `/manage/library-review` | □ | □ | □ | □ (a4 keyboard) | □ | empty queue | b7 access-gating |
| `/v2/*` | □ | □ | □ | □ | □ | beta-opt-in toggle | — |
| `/login` | □ | □ | □ | □ | □ | error states | — |
| Mobile-only | — | — | — | — | □ (all) | — | — |

Tick as you complete each cell. SHIP-NOTICE in convergence.log
when a row is fully ticked.

---

## §8 — Findings schema (P2-focused subset of cycle-3 §9)

Per finding, append a line to `cycle-3.5/findings.jsonl`:

```json
{
  "id": "P2-001",
  "axis": "a11y|ui_ux|performance|usability|feature_gap|ops",
  "severity": "HIGH|MED|LOW|NOTE",
  "title": "<one-line>",
  "probe_mode": "browser_surface",
  "surface": "/perform|/setlists|...",
  "viewport": "desktop|ipad-mini|iphone-se|pixel",
  "axis_subtype": "axe-rule|wcag-criterion|cwv-metric|keyboard|visual|state",
  "touch_lane": ["<file paths likely involved in fix>"],
  "parallelizable_with": ["<other P2-NNN IDs>"],
  "daniel_discussion_required": false,
  "repro": {
    "preconditions": "<role, viewport, network, etc>",
    "steps": ["1. ...", "2. ..."],
    "expected": "<what should happen>",
    "observed": "<what did happen>"
  },
  "fix_direction": "<one-line>",
  "fix_options": [
    {"label": "...", "tradeoff": "..."}
  ],
  "evidence_paths": ["artifacts/P2-001/screenshot-desktop.png", "artifacts/P2-001/axe-report.json"],
  "discovered_at": "<iso>",
  "phase": "P2|P3|P4"
}
```

IDs: zero-padded sequential `P2-NNN` (no axis-prefix collision with
cycle-3's REG-/BUG-/AI-/etc).

---

## §9 — Self-convergence

Exit early if ALL of:
1. Each of the 8 surfaces × 5 axes (a11y / CWV / visual / keyboard /
   mobile) probed.
2. All `daniel_discussion_required: true` findings have rationale.
3. P5 cleanup green (test users 0, bearer-leak audit 0 hits).

Otherwise burn full 4h.

---

## §10 — Output target (supervisor reads this)

```
sheet-music-app-mcp/outputs/autonomous-run/cycle-3.5/
├── HANDOFF-TO-SUPERVISOR.md   # exec summary + at-a-glance table
├── findings.jsonl
├── convergence.log
├── cleanup-audit.json
└── artifacts/
    ├── _summary.json
    ├── _surface-inventory.json
    ├── _cookies/ (P5 deletes)
    ├── cwv/<surface>.json
    ├── axe/<surface>-<viewport>.json
    └── <FINDING_ID>/{screenshot.png, har.json, axe.json, ...}
```

`HANDOFF-TO-SUPERVISOR.md` MUST include:
1. Run window (start → end ISO).
2. Findings count by severity + axis.
3. The 8-surface × 5-axis matrix with ✅ / ⚠ / 🟥 per cell.
4. Daniel-discussion-required list.
5. Coverage notes (anything you skipped + why).
6. Reminder: rotate DRIVER_BEARER + scrub this prompt.

---

## §11 — Standing rules (carry forward from cycle-3)

- Rich error envelope is being migrated in parallel — do not probe.
- F-05 dryRun/force — do not probe.
- Bearer never echoed.
- No bridge/** probing.
- Test-data-only writes. Cleanup mandatory.
- Chart-bytes public is intentional.

---

## §12 — Go signal

Daniel pastes this prompt into a fresh Claude Desktop session with:
1. `centralreform.live` MCP server connected (admin bearer §0).
2. **Claude for Chrome extension** active in his Chrome.

You self-pace from §6 phases. Walk away for 2-4h. Output lands at §10.

Go.
