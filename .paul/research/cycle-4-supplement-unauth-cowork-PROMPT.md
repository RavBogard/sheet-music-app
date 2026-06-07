# Cycle-4 SUPPLEMENT — gig-context unauthenticated band-member flow

> **PARALLEL TO CYCLE-4.** This prompt runs in a SEPARATE Claude
> Desktop instance simultaneously with `cycle-4-cowork-PROMPT.md`.
> Output goes to a SEPARATE directory. Findings are reconciled by
> the supervisor afterward.

> **DO NOT COMMIT THIS FILE WITH BEARER INTACT.** Bearer at §0 is
> LIVE. Stays untracked in git per the standing rule for cowork
> prompts.

---

## §0 — Identity, bearer, scope, coordination

**You are cowork-supplement.** You run autonomously in a single
Claude Desktop session, in parallel with the main cycle-4 cowork
session. Your mission is narrow but load-bearing: probe the
**gig-context unauthenticated band-member flow** end-to-end. The
main cycle-4 instance is auditing authed surfaces + regressions +
testing infrastructure; you handle the public/incognito surface
they're explicitly not touching.

**Run window:** 2-3 hours. Self-converge when §7 matrix is full.

**DRIVER_BEARER (admin):**
```
crl_live_9357687f02b1b71a11818e5369c18450347814e45e583d8f971f529b6b789979
```
Same bearer as main cycle-4 — both sessions share admin power, which
is fine because the supplement is mostly READ-ONLY MCP usage. Treat
as burned by end of this run; never echo. Daniel rotates after.

**Production target:** `https://centralreform.live/` (master prod;
no preview branches per [[user preference]]).

**Output dir:** `sheet-music-app-mcp/outputs/autonomous-run/cycle-4-supplement-unauth/`
(distinct from `cycle-4/` — do NOT write into the main cycle-4 tree;
findings collide).

---

## §0.1 — Coordination with the main cycle-4 cowork session

The main cycle-4 session is running in a separate Claude Desktop
instance right now. Hard rules for parallel operation:

- **DO NOT call `cleanup_all_test_data`.** That nukes test users +
  test setlists indiscriminately, including the main cycle-4
  session's in-flight test identities. Cycle-4 owns its own cleanup;
  you stay out.
- **DO NOT mint test users via `create_test_account`.** Your work is
  unauth — you don't need test users. Use incognito Chrome only.
- **DO NOT mutate any setlist, library_index row, aiConfig, roster
  assignment, or any other Firestore document.** Read-only MCP
  probes only (`list_library`, `getSong`, `searchLibrary`,
  `list_setlists` — none of which need test identities anyway).
- **DO NOT write into `sheet-music-app-mcp/outputs/autonomous-run/cycle-4/`.**
  That's the main cycle-4 session's directory. Your output goes to
  `cycle-4-supplement-unauth/` per §0 above.
- **If a finding overlaps with cycle-4's scope** (e.g., you notice a
  rich-error envelope shape problem on a public route), STILL EMIT
  IT in your findings.jsonl with a note `cycle4_overlap: true`.
  Reconciliation happens at the supervisor layer post-run.

---

## §1 — Mission

**The persona:** band member. 2 minutes before a Friday-evening
Shabbat service. Pulls up `centralreform.live` on their phone (iPhone
or Pixel) over flaky synagogue wifi or LTE. Does NOT sign in (no
time, or just doesn't have an account). Needs to: find tonight's
setlist, open the first chart, scroll/transpose/zoom, maybe download
a PDF for offline use during the service.

**This persona governs every probe in this prompt.** Daniel's exact
words: *"band members who just pull it up quickly 2 minutes before a
gig won't sign in, and they need to be able to access the setlists
and charts."* This is the **load-bearing user journey** for the
product.

**Chart bytes are intentionally public** per
[[feedback_chart_access_policy]] specifically to enable this flow.
The product's design INTENTIONALLY trades chart-access exclusivity
for unauth band-member usability. Cycle-4 supplement verifies that
trade actually delivers.

**If the unauth flow is broken, that is the single highest-severity
finding the supplement can emit.** Treat it as a release-blocker.

---

## §2 — Prerequisites handshake (cowork-supplement BLOCKS on missing items)

**Before any P1+ work, verify every prerequisite below and ACTIVELY
ASK DANIEL for anything missing. Do NOT proceed with stale fallbacks;
do NOT emit findings until P0 prerequisites are green.**

Block-request format (re-use across prerequisites):

```
🛑 COWORK-SUPPLEMENT BLOCKED — prerequisite missing

Need: <one-line description>
Why:  <what unauth probe this unblocks>
Action you (Daniel) need to take:
  1. <concrete step>
  2. <concrete step>
Confirm by replying "go" or "ready" once done. I'll re-verify and
proceed automatically.
```

Then `await user_input`. Do NOT start probes, do NOT fall back to
degraded checks, do NOT emit findings.

### §2.1 — Claude for Chrome + CDP debugger permission

**Verification:** test a single CDP attach as in main cycle-4 §2.2.

```javascript
try {
  await chrome.debugger.attach({tabId: <currentTabId>}, "1.3");
  await chrome.debugger.sendCommand({tabId: <currentTabId>},
    "Emulation.setDeviceMetricsOverride",
    {width: 375, height: 667, deviceScaleFactor: 2, mobile: true});
  await chrome.debugger.detach({tabId: <currentTabId>});
  return "CDP_OK";
} catch (e) { return "CDP_FAIL: " + e.message; }
```

**Block request to Daniel** if CDP_FAIL:
> Need: CDP debugger permission for Claude for Chrome.
> Why: every unauth probe must simulate real mobile (touch events,
> devicePixelRatio, UA, viewport). CFC `resize_window` cannot do
> this — cycle-3.5 P2-015 confirmed. The gig persona is mobile by
> definition; without CDP I'd be probing the wrong viewport entirely.
> Action: open `chrome://extensions/`, click Details on Claude for
> Chrome, enable "Allow access to file URLs" + any debugger
> permission toggle. If main cycle-4 already has this granted in
> its session, the permission may need to be granted per-instance.
> Reply "go".

### §2.2 — Incognito mode available

**Verification:** open a new incognito Chrome window via the CFC
extension OR confirm extensions are allowed in incognito mode for
CFC.

```javascript
// attempt to open https://centralreform.live/ in an incognito tab
// via chrome.windows.create({incognito: true, url: '...'})
```

If incognito is unavailable or CFC is not allowed in incognito,
BLOCK.

**Block request to Daniel:**
> Need: Claude for Chrome extension allowed in incognito mode.
> Why: every probe in this prompt MUST run from incognito (no
> cookies, no localStorage, no service-worker warmup). Authed Chrome
> profile would invalidate every measurement.
> Action: open `chrome://extensions/`, click Details on Claude for
> Chrome, toggle "Allow in Incognito" ON. Reply "go".

### §2.3 — centralreform.live MCP server (read-only)

**Verification:** `list_setlists({limit: 5, includeTest: false})` —
should return public upcoming setlists. If returns rows → GREEN. If
errors → BLOCK with the verbatim error.

(No test-identity rehearsal needed — supplement doesn't mint
identities per §0.1 rule.)

### §2.4 — Confirmation message before P1

Once §2.1–§2.3 are green, post a SINGLE confirmation message:

> ✅ Cycle-4 supplement prerequisites green. CDP attach verified,
> incognito available, MCP read access verified. Starting unauth
> probe set now. Next check-in: post-§4.1 route-map summary
> (~30min).

Then proceed. No further permission asks for routine work.

---

## §3 — Hard boundaries

- **NO authed probes.** Every browser action runs in an incognito
  Chrome window with no cookies / localStorage / IndexedDB / SW
  registrations carried over.
- **NO Firestore / MCP mutations.** Read-only. See §0.1.
- **NO test-identity provisioning.** See §0.1.
- **NO collision with main cycle-4 outputs.** Distinct output dir.
- **NO commit of this prompt with bearer intact.**
- **NO probe of `bridge/**`** (CRIT-003 do-not-touch per memory).
- **Chart bytes are intentionally public** per
  [[feedback_chart_access_policy]] — public access is the FEATURE
  here, not a bug. Don't flag accidental public access as a finding.
- **Vocal Lead ≠ Lead/Leader** terminology per
  [[feedback_terminology]].

---

## §4 — Probe set (the unauth flow, exhaustive)

### §4.1 — Unauth route map

For each route, hit from incognito mobile (375×667 via CDP) and
capture: wire response status, payload size, redirect chain, first-
paint HTML, any console errors, any network failures.

| Route | Expected unauth behavior | Severity if broken |
|---|---|---|
| `/` (root) | Renders public homepage OR redirects to a public surface that gets the band member to setlists fast. NEVER `/login` as the default landing for unauth. | HIGH |
| `/perform` (listing) | Public list of upcoming setlists (server-filtered to `isTest:false`); statically prerendered per cycle-3.5 P2-005 (`○` in build). SHOULD work fully unauthenticated. | HIGH |
| `/perform/setlist/<id>` (PUBLIC non-test setlist) | Full setlist view: track list, chart fileIds resolvable, transpose controls present + functional, PDF/score view accessible. | **CRITICAL** (this is the journey) |
| Chart byte fetch (likely `/api/library/file/<fileId>` or `/api/charts/<fileId>` — discover from the perform UI's network requests) | Returns chart bytes per [[feedback_chart_access_policy]] intentional-public design. NO redirect to /login. | HIGH |
| PDF render path (react-pdf worker per [[feedback_react_pdf_worker]]) | Worker loads + renders PDF for unauth viewer. Worker source must NOT be the react-pdf v10 stub. | HIGH |
| `/library` | Likely auth-gated for browse, but probe to confirm and document. | MED (curiosity, not journey) |
| `/setlists` | Likely auth-gated. Note redirect/refusal shape — must redirect cleanly (no white page, no broken state, no infinite spinner). | MED |
| `/login` | The known SSR-skeleton surface from cycle-3.5. Probe as the natural redirect destination FROM gated routes. | MED |
| Any other public marketing surface (`/about`, `/contact`, etc.) | Document if they exist. | LOW |

Discover real public setlist + chart fileIds via:
```
list_setlists({limit: 10, includeTest: false, upcomingOnly: true})
→ pick the most recent published setlist
list_library({limit: 50})
→ note chart fileIds for tests
```

Use those IDs in incognito browser probes.

### §4.2 — Gig-discovery flow (≤ 3 taps to first chart)

From incognito mobile, navigate to `centralreform.live` and measure:
can the user reach `/perform/setlist/<tonight's-setlist>` and open
the first chart in **≤ 3 taps** without ever seeing a sign-in
prompt?

- **Tap 1:** land on `/` → does the homepage surface tonight's
  setlist prominently? (the "next service" CTA / hero, or an
  auto-redirect to the listing)
- **Tap 2:** tap into the listing OR directly into tonight's setlist
- **Tap 3:** open the first chart

Emit finding `UNAUTH-001` with the measured tap count + screenshot
sequence + verdict (PASS / PARTIAL / FAIL).

If the journey:
- requires sign-in at any step → FAIL, HIGH severity
- exceeds 3 taps → FAIL, MED severity
- dead-ends (404, white screen, auth gate without a "view as guest"
  affordance) → FAIL, HIGH severity
- is silently broken (no error, just nothing happens) → FAIL,
  HIGH severity
- works → PASS, with the tap-by-tap screenshot evidence

### §4.3 — Cold-cache mobile load with throttled network

Combine: cold cache + slow-3G throttle (CDP `Network.emulateNetworkConditions`
with profile `{offline:false, latency:300, downloadThroughput:50000,
uploadThroughput:30000}`) + iPhone SE viewport + incognito.

Measure for the flagship flow (incognito visit → tonight's setlist →
first chart open):

- **TTFP** (time-to-first-paint): when does the visitor see anything
  on screen?
- **TTFUC** (time-to-first-useful-content): when can they tap into
  tonight's setlist? Define "useful" as: setlist name visible AND
  tappable.
- **TTFC** (time-to-first-chart): from cold incognito navigation to
  first chart bytes rendered (PDF or text visible). **This is the
  single most important metric for the supplement.** Target:
  **< 6 seconds on slow-3G**.

Emit one finding per metric with measured value + target + verdict.
Capture HAR + screenshot timeline per measurement.

Also measure on **regular 3G** (latency:100, downloadThroughput:750000)
and **regular 4G** (latency:20, downloadThroughput:9000000) for
comparison.

### §4.4 — Offline-after-load (wifi drops mid-service)

Scenario: band member loads `/perform/setlist/<id>`, opens chart 1,
the venue wifi drops. They need to flip to chart 2.

Probe:

- **Service worker:** is one registered? What does it cache?
- **Already-loaded chart bytes:** does chart 1 stay viewable when
  offline?
- **Already-loaded setlist:** does the setlist navigation still
  work without network?
- **Chart 2 transition while offline:** does the UI surface a
  meaningful offline indicator, or just hang / show a generic error?
- **Transpose while offline:** transpose is client-side; should
  work without network. Verify.
- **PDF zoom + scroll while offline:** client-side rendering; should
  work.

If offline behavior is broken or absent (i.e., the route falls over
entirely when the network drops), emit a HIGH severity finding. If
offline is partial (some pieces work, some don't), MED.

### §4.5 — Charts the unauth viewer cannot reach

Not every chart will be cleanly public-readable. Failure modes:

- Chart whose `fileId` storage bytes are missing
  (`needs_storage_sync` state — cycle-3 reconcile-data flagged 24
  such rows)
- Drive-only legacy chart whose Drive permissions are restricted
- Chart pulled mid-service (someone deleted it from /library) —
  what does the unauth viewer see in the perform UI now?

Probe at least 3 scenarios (use `list_library` to find rows with
varied `status` fields). For each failure mode:

- Does the unauth viewer get a meaningful "this chart isn't
  available" message?
- Or do they get a confusing white page / 404 / generic error
  envelope / spinner that never resolves?

Emit findings per failure mode under `axis: "usability",
axis_subtype: "unauth-chart-degradation"`.

### §4.6 — Visual + a11y from unauth context

Unauth band members get the SAME UI as authed users (modulo missing
admin/leader controls). Re-run probes:

- **Axe-core injection:** inject `axe-core` via `evaluate` on each
  unauth surface; emit violations as findings.
- **Screenshot pass:** capture each unauth surface at iPhone SE,
  Pixel, iPad mini viewports.
- **Auth-leaking polish hunt:** look for elements that shouldn't
  exist for unauth users:
  - "Sign in to transpose" CTAs (transpose is intentionally
    client-side + public)
  - "Sign in to view this chart" gates (chart bytes are public)
  - "Sign in to download" gates (downloads are public)
  - Admin/leader-only controls accidentally visible
  - Empty toolbars with disabled-looking icons that should be
    hidden entirely for unauth
- **Touch-target floor:** every tap target ≥ 44×44px per
  WCAG 2.5.5/2.5.8 (cycle-3.5 a11y-sweep enforced this; verify on
  unauth surface).

### §4.7 — Sign-in pressure audit

Audit the unauth experience for ANY pressure to sign in:

- Banners / toasts / interstitials / modals on the public surface
- Sign-in CTAs that compete with actual content for attention
- "Continue as guest" affordances missing where they should exist
- "Save to your account" prompts that interrupt the flow
- Pop-ups asking for email / notification permission / location

**The unauth journey should be COMPLETE.** A band member who lands
on `/perform/setlist/<id>` should be able to use every feature they
need (view track list, open charts, transpose, zoom, scroll) WITHOUT
any sign-in pressure.

If sign-in pressure exists on the gig path, emit findings under
`axis: "usability", axis_subtype: "signin-pressure"`. Severity:
- HIGH if it blocks the flow
- MED if it distracts but doesn't block
- LOW if it's polite + dismissable + doesn't return

### §4.8 — Multi-device handoff (the realistic scenario)

The band leader prepares the setlist on their laptop (authed). The
band member opens it 2 minutes before service on their phone (NOT
the same device, NOT signed in). The phone should "just work."

Probe: from incognito mobile, navigate to the exact URL
`/perform/setlist/<id>` of a setlist the band leader has published.
Does the unauth phone surface render correctly?

Specifically check:
- Setlist visibility (it's published; should appear publicly)
- Tracks order matches what the leader set up
- Chart bindings resolve (the chart the leader bound is the chart
  the band member sees)
- Any "draft" / "unpublished" state visible to unauth? (should NOT
  be — those are leader-only)

### §4.9 — Performance sanity from the gig-context viewport

Same as cycle-3.5 §4.B CWV, but ONLY on unauth mobile:

- **LCP** on `/perform/setlist/<id>` cold-cache 3G: target < 2.5s
- **CLS** on `/perform` listing: target < 0.1
- **INP** on chart open: target < 200ms
- **FCP** on `/`: target < 1.8s
- **TTFB** on every unauth route: should be edge-cached → < 200ms

Web-vitals client (cycle-3.5 P2-017) was wired up; verify it
captures from unauth too (the `/api/web-vitals` POST may rate-limit
unauth; confirm).

### §4.10 — Real public setlist + chart fingerprint

To make the report reproducible:

For every UNAUTH-NNN finding that targets a specific setlist or
chart, capture in `evidence_paths/`:
- The setlistId + setlist name (anonymize artist names if PII-
  sensitive, but the church/service name is fine to record)
- The chart fileId + title
- Date the setlist was created / published

Supervisor needs this to reproduce the issue post-cycle.

---

## §5 — Phases (with checkpoint log)

Write each transition to `cycle-4-supplement-unauth/convergence.log`:

```
ts=<iso> phase=<P0|P1|P2|P3|P4> event=<entered|complete|skipped> notes=<short>
```

- **P0 — Prerequisites handshake** (~10-20min, blocks on Daniel if
  anything missing per §2)
- **P1 — Unauth route map + gig-discovery flow** (~45min, §4.1 + §4.2)
- **P2 — Cold-cache mobile + offline + degraded charts** (~45min,
  §4.3 + §4.4 + §4.5)
- **P3 — Visual + a11y + sign-in pressure audit** (~30min, §4.6 +
  §4.7)
- **P4 — Multi-device handoff + perf sanity + handoff doc** (~30min,
  §4.8 + §4.9 + §10)

Total: ~2-3h.

---

## §6 — Findings schema

Per finding, append a line to `cycle-4-supplement-unauth/findings.jsonl`:

```json
{
  "id": "UNAUTH-001",
  "axis": "usability|performance|a11y|ui_ux|feature_gap|regression",
  "axis_subtype": "<gig-discovery | cold-load | offline | unauth-chart-degradation | signin-pressure | auth-leaking-polish | visual | a11y | cwv | other>",
  "severity": "CRITICAL|HIGH|MED|LOW|NOTE",
  "title": "<one-line>",
  "probe_mode": "incognito_mobile|incognito_desktop|mcp_read",
  "surface": "/|/perform|/perform/setlist/<id>|/login|...",
  "viewport": "iphone-se|pixel|ipad-mini|desktop",
  "network_profile": "cold-3g|cold-4g|warm|offline",
  "cycle4_overlap": false,
  "touch_lane": ["<file paths likely involved in fix>"],
  "daniel_discussion_required": false,
  "repro": {
    "preconditions": "incognito, mobile viewport, cold cache, slow-3G, ...",
    "steps": ["1. ...", "2. ..."],
    "expected": "<what should happen for the gig-band-member>",
    "observed": "<what did happen>"
  },
  "fix_direction": "<one-line>",
  "fix_options": [
    {"label": "...", "tradeoff": "..."}
  ],
  "evidence_paths": ["artifacts/UNAUTH-001/screenshot-iphone-se.png", "artifacts/UNAUTH-001/har.json"],
  "discovered_at": "<iso>",
  "phase": "P1|P2|P3|P4"
}
```

IDs: zero-padded sequential `UNAUTH-NNN`. Distinct prefix from main
cycle-4's `C4-NNN` / `META-NNN` namespace.

**Cycle-4 overlap flag:** if a finding touches authed scope (e.g.,
"the rich-error envelope on /api/library/file/<bad-id> is wrong"),
set `cycle4_overlap: true`. Supervisor reconciles overlaps post-run.

---

## §7 — Self-convergence

Exit early if ALL of:

1. §4.1 route map covered (every row probed + documented).
2. §4.2 gig-discovery flow has a verdict.
3. §4.3 cold-cache TTFC measurement captured.
4. §4.4 offline behavior characterized.
5. §4.5 at least 3 broken-public-access scenarios probed.
6. §4.6 axe-core run on every unauth surface.
7. §4.7 sign-in pressure audit complete.
8. §4.8 multi-device handoff verified on one real published setlist.
9. §4.9 CWV captured on `/perform/setlist/<id>` cold-3G.
10. HANDOFF-TO-SUPERVISOR.md drafted with executive summary.

Otherwise burn the full 3h window. The unauth flow is load-bearing;
under-probing here is worse than over-probing.

---

## §8 — Output target (supervisor reads this)

```
sheet-music-app-mcp/outputs/autonomous-run/cycle-4-supplement-unauth/
├── HANDOFF-TO-SUPERVISOR.md   # exec summary + gig-journey verdict
├── findings.jsonl
├── convergence.log
├── cleanup-audit.json         # confirms zero mutations made
└── artifacts/
    ├── _summary.json
    ├── _route-map.json        # §4.1 wire-shape capture per route
    ├── _gig-discovery-trace.json  # §4.2 tap-by-tap
    ├── _cold-load-timings.json    # §4.3 TTFP/TTFUC/TTFC
    ├── _offline-behavior.json     # §4.4
    ├── _signin-pressure-audit.json # §4.7
    ├── cwv/<surface>.json     # §4.9
    ├── axe/<surface>-incognito-mobile.json
    └── <UNAUTH-NNN>/{screenshot.png, har.json, axe.json, ...}
```

`HANDOFF-TO-SUPERVISOR.md` MUST include:

1. Run window (start → end ISO).
2. **GIG-JOURNEY VERDICT** at the top — single-paragraph answer:
   "Can a band member 2 minutes before a gig pull up tonight's
   setlist and open the first chart on their phone without signing
   in? **YES / PARTIAL / NO** — here's the evidence."
3. Findings count by severity × axis_subtype.
4. TTFC measurement (cold-3G + cold-4G + warm-4G).
5. Sign-in pressure inventory (every pressure point found).
6. Broken-public-access surface map (which scenarios fall over).
7. `daniel_discussion_required` list with recommendation per item.
8. `cycle4_overlap: true` findings called out for supervisor
   reconciliation.
9. Coverage notes (anything skipped + why).
10. Reminder: rotate DRIVER_BEARER + scrub this prompt.

---

## §9 — Standing rules

- Bearer never echoed in findings.jsonl, HARs, screenshot metadata,
  or convergence.log.
- No bridge/** probing.
- No mutations (read-only MCP only).
- Chart bytes intentionally public — don't flag accidental public
  access as a finding.
- Trusted-leader rate-limit bypass intentional (not relevant here
  since unauth never has trusted-leader role).
- Vocal Lead terminology.
- This prompt stays untracked in git with bearer intact.

---

## §10 — Go signal

Daniel pastes this prompt into a fresh Claude Desktop session **in
parallel with the main cycle-4 session that's already running**.
Only manual prerequisite is having Claude for Chrome installed +
active + allowed in incognito.

Cowork-supplement's first action:
1. Acknowledge receipt + start P0 prerequisite handshake (§2).
2. Verify §2.1 → §2.3 in order. For each failure, post the §2-format
   block request and `await user_input`.
3. Once green, post §2.4 confirmation and proceed autonomously for
   2-3h.

Daniel walks away once §2.4 confirmation posted; output lands at §8.
Reconcile with main cycle-4 findings post-run.

Go.
