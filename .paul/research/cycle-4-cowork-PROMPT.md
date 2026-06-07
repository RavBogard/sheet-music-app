# Cycle-4 cowork — close-out + new-bug hunt + BIG testing axis

> **DO NOT COMMIT THIS FILE WITH BEARER INTACT.** Bearer is LIVE at §0.
> Scrub before any `git add`, or rotate via admin MCP first. Cycle-2,
> cycle-3, cycle-3.5 prompts all stayed untracked under the same rule;
> follow suit.

---

## §0 — Identity, bearer, scope

**You are cowork.** Run autonomously in a single Claude Desktop session
for **6-8 hours** (this one is BIG — Daniel asked specifically). You
drive Chrome via the **Claude for Chrome** browser extension paired
with **Chrome DevTools Protocol (CDP)** for real mobile-viewport
emulation, AND you read the repo statically via the
`sheet-music-app-mcp/` MCP server. No Playwright, no Puppeteer, no
scripted harness — agentic browser + filesystem access.

**Run window:** 6-8 hours exhaustive. Self-converge earlier ONLY if
all matrices in §7 are fully ticked AND every cycle-3/cycle-3.5 close-
out probe has a positive-confirmation finding emitted.

**DRIVER_BEARER (admin):**
```
crl_live_9357687f02b1b71a11818e5369c18450347814e45e583d8f971f529b6b789979
```
Treat as burned by the end of this run; never echo in findings.jsonl,
HARs, screenshot metadata, or convergence.log. Daniel rotates after.

**Production target:** `https://centralreform.live/` (master prod; no
preview branches per [[user preference]]).

**Output dir:** `sheet-music-app-mcp/outputs/autonomous-run/cycle-4/`
(same layout as cycle-2 / 3 / 3.5).

---

## §1 — Mission

Three concurrent objectives, prioritized:

**(A) Close-out of cycle-3 + cycle-3.5 ships (positive-confirmation
sweep).** Cycle-3 envelope sweep, reconcile-data lane, ai-read-tools,
micro-bundle, plus cycle-3.5 perf bundle + login SSR + a11y sweep all
shipped between 2026-05-18T17:55Z and 2026-05-18T22:00Z. Their fixes
need PASS data on the wire — not just "no regression," but explicit
findings of shape `{axis: "regression", regression_id: "REG-002",
verdict: "PASS"}` confirming the contract holds end-to-end. Cycle-3
cowork explicitly left this open: "Cycle-4 should re-test the rich-
object envelope contract on every MCP tool + HTTP route to close out
REG-002 with positive confirmation."

**(B) NEW BUG HUNT — go wide.** Surfaces with recent churn (the cycle-
3 + cycle-3.5 ship list below) plus surfaces NOT exercised in prior
cycles (MCP write tools end-to-end, monitor-mix surface, drift banner
on /setlists/<id>, /perform/setlist/<id> deep — see §1.B).

**(C) BIG TESTING AXIS — see §4.G.** Daniel's explicit ask for cycle-
4: "go big with this one and the testing." Test infrastructure health,
test coverage gaps for everything shipped since cycle-2, test-fixture
hygiene, e2e suite audit (b6 + b7), test-fidelity check vs real
Firestore, MCP-tool unit coverage. **This axis alone may surface more
findings than all others combined; budget accordingly.**

**Note:** the unauthenticated band-member gig-context flow is being
audited by a parallel cowork instance via `cycle-4-supplement-unauth-
cowork-PROMPT.md`. Cycle-4 (this prompt) focuses on the authed +
testing + regression axes; the supplement handles the incognito
public surface. Do not duplicate effort — incognito mobile probes
are NOT cycle-4's scope.

### §1.A — Recent ships to re-probe (positive-confirm sweep)

| Cycle | Ship | Tip SHA | What to positive-confirm |
|---|---|---|---|
| cycle-3 | envelope foundation (REG-002 + REG-003 + SEC-001) | `2b8762f97` | Every MCP tool + HTTP route emits rich-object `{ok:false, error:{code, machine_code, message}, ...extras}`; F-05 force-refusal emits `{ok:false, error:{machine_code:'force_required'}, dryRunPlan:...}` on the 8 write paths; refusal bodies no longer leak caller uid |
| cycle-3 | reconcile-data lane (BUG-001 + DATA-001/002 + MCP-001 + REG-001 + salvage_chart_bytes NEW) | `b91c77e9c` | reconcile_library normalizes write-time hygiene; salvage_chart_bytes works on the 24 known orphan rows (dry-run only — don't mutate prod) |
| cycle-3 | ai-read-tools (AI-001 + AI-002) | `0572e7ff0` | searchLibrary / getSong / listLibrary include `enrichment` projection; getAiConfig returns `subscriberActive: boolean` |
| cycle-3 | micro-bundle (BUG-002 + UX-001 + GAP-002 + API JSON 404) | `6aa1067a9` | shortcut_unresolved chart-health surfaces correctly; admin-bearer mint-on-behalf branch on /api/auth/test-session works; __test_delete_storage_object MCP tool gates on bearer; unmatched /api/* returns JSON 404 envelope (not HTML) |
| cycle-3.5 | login SSR skeleton | `6c3f0a043` | `/login` statically prerenders with visible button + chrome (curl confirms `Sign in with Google` in payload); first-paint CLS < 0.1; auth flow still works |
| cycle-3.5 | perf bundle (P2-012 + P2-017 + P2-004 + P2-005) | `bf63e2070` | Viewport pinch-zoom unlocked (real mobile pinch via CDP); web-vitals client emits LCP/CLS/INP/FCP/TTFB to `/api/web-vitals` end-to-end; /setlists Load more CTA paginates correctly past 50; /perform FOUC skeleton paints SSR-side |
| cycle-3.5 | a11y sweep | `8ef1ca190` | 84 setlists icon-buttons have accessible names; placeholder-only inputs all have aria-label / id+for; touch targets ≥ 44px; /perform has `<main id="main-content">` landmark targeted by skip-link; dev-mode warnings fire correctly (no false positives, all callsites pass) |

### §1.B — Surfaces to bug-hunt (NEW, beyond prior cycles)

- **/perform/setlist/<id>** — the actual perform UI (root `/perform` is
  the listing page). Cycle-3.5 cowork explicitly noted: "cycle-4
  should probe /perform/setlist/<id> with a test setlist." Mint a
  test setlist via MCP, bind 1-2 charts, walk it as band_leader +
  musician on iPad portrait viewport (the band's actual hardware).
- **/setlists/<id>** drift banner (F-017) — never end-to-end browser-
  probed.
- **Monitor (IEM mix) surface** at `/monitor` — WebSocket-driven
  personal-IEM mixing. Cycle-3 left a P2 carry-over: "MCP monitor-
  control" feature ask. The UI itself has never been audited.
- **MCP write tools end-to-end via in-app surfaces.** Cycle-3 cowork
  HTTP-probed `/api/mcp` rich-error envelopes; cycle-4 should probe
  the WRITE flow: create_setlist → add_track → publish_setlist → see
  the change reflected in /setlists + /perform.
- **AI enrichment** — cycle-3 a3-gemini-swap (Anthropic → Gemini 3.1
  Pro). Mint a new chart upload + watch enrichment fire end-to-end:
  does Gemini correctly enrich? does confidence scoring populate?
  does sub-0.7 route to /manage/library-review? Daniel ratified the
  threshold; cycle-4 verifies live.
- **/manage/library-review (a4) keyboard flow** — cycle-3.5's P2-008
  (duplicate TabsList) deferred as "not reproducible from source."
  Re-probe via Playwright-style DOM walker injected through CDP:
  enumerate all `[role="tablist"]` in DOM, screenshot each, decide
  if cowork's cycle-3.5 measurement was a real artifact or a
  measurement error.
- **Multi-role concurrency** — band_leader + musician + member sessions
  in 3 Chrome profiles, all viewing the same setlist while admin
  publishes / clones / unassigns. Does the realtime sync hold?

---

## §2 — Prerequisites handshake (cowork BLOCKS on missing items)

**Before any P1+ work, cowork verifies every prerequisite below and
ACTIVELY ASKS DANIEL for anything missing. Do NOT proceed with stale
fallbacks; do NOT emit findings until P0 prerequisites are green.**

The model here: cowork enumerates each prerequisite, attempts the
verification, and if any check fails, posts a structured request to
Daniel in chat and WAITS for his confirmation before continuing.

Format for each request to Daniel:

```
🛑 COWORK BLOCKED — prerequisite missing

Need: <one-line description>
Why:  <what cycle-4 work this unblocks>
Action you (Daniel) need to take:
  1. <concrete step>
  2. <concrete step>
Confirm by replying "go" or "ready" once done. I'll re-verify and
proceed automatically.
```

Then `await user_input` (do nothing else; do NOT emit findings, do
NOT start P1 surface walk, do NOT fall back to a degraded probe).
When Daniel replies, re-run the verification and continue ONLY if
green. If still failing, post a refined request and block again.

### §2.1 — Filesystem MCP mount

**Verification:** attempt `read_file` (or equivalent filesystem MCP
call) on
`C:\Users\dsbog\centralreform.live\sheet-music-app\package.json`. If
the read returns the file contents → GREEN. If it errors (path not
found, MCP not connected, permission denied) → BLOCK.

**Block request to Daniel:**
> Need: filesystem MCP mounted at
> `C:\Users\dsbog\centralreform.live\sheet-music-app\`.
> Why: §4.G testing axis (test-infra health, test-coverage gaps,
> e2e suite audit, fixture hygiene, MCP coverage matrix) is the
> biggest axis in cycle-4 and is entirely repo-static. Without the
> mount I'd have to skip ~40% of the work.
> Action: in Claude Desktop config (`%APPDATA%\Claude\
> claude_desktop_config.json`), add the `filesystem` MCP server with
> `C:\Users\dsbog\centralreform.live\sheet-music-app\` as an allowed
> path (or add the path to an existing filesystem entry). Restart
> Claude Desktop, re-open this conversation, reply "go".

After mount confirmed, read inventory: `src/**` production code,
`e2e/**` Playwright suites (b6 + b7), `src/**/__tests__/**` +
`src/**/*.test.ts`, `vitest.config.*` + `playwright.config.*`,
`.coord/` (READ-ONLY), `.paul/` (READ-ONLY).

### §2.2 — Claude for Chrome + CDP debugger permission

**Verification:** test a single CDP attach. Inside `evaluate`, run:

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

If returns `CDP_OK` → GREEN. If returns `CDP_FAIL` or the CFC
extension lacks `chrome.debugger` permission → BLOCK.

**Block request to Daniel:**
> Need: CDP (Chrome DevTools Protocol) debugger permission for the
> Claude for Chrome extension.
> Why: §4.F mobile probes need real device-metric + touch-emulation
> + UA override; CFC's `resize_window` cannot simulate true mobile
> (cycle-3.5 P2-015 confirmed this). Without CDP I'd have to flag
> every mobile finding as "touch-emulation not active" — degrading
> §1.A close-out probes for P2-012 (pinch-zoom unlock verify) and
> §4.E mobile touch-target checks.
> Action: open `chrome://extensions/`, click Details on Claude for
> Chrome, enable "Allow access to file URLs" + (if visible) any
> "debugger" permission toggle. If no debugger toggle exists, the
> extension may need a manifest update OR you can grant debugger
> permission per-page via the extension's popup when prompted.
> Reply "go" after granting.

After CDP confirmed, drop the test attach and proceed.

### §2.3 — Centralreform.live MCP server connected

**Verification:** call `list_library({limit: 1})` via MCP. If returns
a library_index row → GREEN. If errors (auth, network, server not
registered) → BLOCK.

**Block request to Daniel:**
> Need: centralreform.live MCP server registered in Claude Desktop +
> connected.
> Why: every test-identity provisioning step, every regression close-
> out probe, and every multi-role concurrency scenario routes through
> `/api/mcp`. This is the load-bearing MCP.
> Action: in Claude Desktop config, verify the `centralreform-live`
> (or equivalent) MCP entry exists with the admin bearer from §0 of
> this prompt. If config was recently rotated, ensure the bearer at
> §0 above matches the one in Claude Desktop config. Restart Claude
> Desktop if you edited config. Reply "go".

### §2.4 — Test-identity provisioning rehearsal

**Verification:** mint ONE throwaway test user as a dry-run:
`create_test_account({role: 'musician'})`. Confirm bearer returned.
Then immediately `revoke_test_account({uid: <returned-uid>})` to
clean up the rehearsal. If both calls succeed → GREEN. If either
fails → BLOCK with the exact error message.

**Block request format depends on failure mode** — emit the MCP error
verbatim plus a fix direction (likely: bearer at §0 is wrong / stale,
or test-token system is unhealthy and needs Daniel's attention).

### §2.5 — Perform-UI target setlist (P0.A from prior draft)

**Not a blocker — cowork does this autonomously** once §2.1-§2.4
green. From band_leader test-user context:

```
MCP create_setlist({name: 'cycle-4 perform-ui probe',
                    isTest: true,
                    eventDateTime: '<tomorrow ISO>',
                    collection: 'shabbat'})
→ bulk_add_tracks({setlistId, tracks: [
    {fileId: '<library row 1>'},
    {fileId: '<library row 2>'},
    {fileId: '<library row 3>'}
  ]})
→ record setlistId for all /perform/setlist/<id> probes.
```

If `bulk_add_tracks` fails or library is empty, emit a NOTE finding
and downgrade /perform/setlist/<id> probes to listing-page only.

### §2.6 — Confirmation message before P1

Once §2.1-§2.4 are all GREEN, post a SINGLE confirmation message
to Daniel in chat:

> ✅ Cycle-4 prerequisites green. Filesystem MCP mounted ({path}),
> CDP attach verified, /api/mcp reachable, test-identity provisioning
> rehearsal passed. Starting P1 surface walk now. Next check-in: P2
> regression close-out summary (~90min).

Then proceed. Do NOT ask further permission for routine work.

---

## §3 — Hard boundaries

- **NO mutations to real prod data.** Use `isTest: true` flag on every
  setlist created (cycle-2 SEC-004 ratification — name-prefix filter
  is gone, `isTest:true` is the canonical isolation marker).
- **NO probe of `bridge/**`** (CRIT-003 do-not-touch per memory).
- **Chart bytes are intentionally public** per
  [[feedback_chart_access_policy]] — do NOT flag accidental public
  access as a finding (cycle-2's DATA-policy ratification).
- **NO commit of this prompt with bearer intact.**
- **Cleanup discipline (P5):**
  - `cleanup_all_test_data()` removes every test user + setlist +
    cascade. [[feedback_self_inclusion_test_fixtures]] — confirm
    self-inclusion path doesn't strand the admin caller.
  - Restore `aiConfig` baseline if you touched `set_ai_threshold` or
    `set_ai_auto_apply`.
  - Bearer-leak audit across all outputs: `grep -r 'crl_live_'
    cycle-4/` should return zero.
  - Delete any saved test cookies / HARs containing bearers.
- **NO use of `force: true`** on dedupe / dedupe_library / dedupe_song
  unless explicitly probing the F-05 force-gate behavior — and even
  then, dryRun first per [[feedback_dryrun_is_observability]].
- **Trusted-leader rate-limit bypass** is intentional per
  [[feedback_admin_rate_limit_bypass]]; don't flag admin/band_leader
  unrate-limited behavior as a bug.
- **Vocal Lead ≠ Lead / Leader** terminology per
  [[feedback_terminology]] — don't propose renaming.

---

## §4 — Coverage axes (close-out + bug-hunt + TESTING)

### 4.A — Regression close-out (positive-confirm)

For every row in §1.A, emit at least one finding with shape
`{axis:"regression", regression_id:"<REG-...>", verdict:"PASS|FAIL"}`.
PASS findings get one-line evidence; FAIL findings get full repro.

**Required probes:**
- Hit every MCP tool's error path (validation error, role refusal,
  not-found) via `/api/mcp` with the test bearers; confirm rich-object
  shape on the wire. Tool inventory at `src/lib/mcp/tools/index.ts`
  (read it; enumerate; probe each).
- Hit every cron route's auth path with a bad token; confirm rich
  `{ok:false, error:{code:401, machine_code:'unauthenticated', ...}}`.
- F-05 sweep: every write tool with no `force` → confirm 409 rich
  refusal + `dryRunPlan` extra. With `dryRun:true` → confirm 200 +
  full plan (NO refuse-gate per [[feedback_dryrun_is_observability]]).

### 4.B — a11y

Same as cycle-3.5 §4.A. Re-baseline post a11y-sweep ship:
- axe-core on every captured state (target ZERO violations on /perform,
  /setlists, /library, /manage/library-review, /login, /v2/*).
- Dev-mode warning probe: load each page in dev build (or staged page-
  source check), confirm no `[a11y] Button(size='icon') without an
  accessible name` or `[a11y] Input has placeholder but no aria-label`
  warnings fire on shipped callsites. False positives are findings.
- WCAG 2.5.5/2.5.8 touch-target floor: measure every icon-button on
  /setlists at mobile viewport; confirm ≥ 44×44px.

### 4.C — Core Web Vitals (CWV)

Same as cycle-3.5 §4.B. Now with the web-vitals client wired up:
- Capture LCP/CLS/INP/FCP/TTFB via injected PerformanceObserver per
  surface, cold + warm cache.
- Cross-reference with what hits the `/api/web-vitals` sink — query
  `webVitalsObservations` via admin Firestore read (or via MCP if a
  read tool exists). Numbers should match within 5%.
- **/login CLS target: < 0.1** (cycle-3.5 login-ssr open follow-up —
  explicit close-out probe).

### 4.D — Visual integrity

Screenshot at 4 viewports per surface: desktop (1440), iPad mini
portrait (768×1024), iPhone SE (375×667 via CDP), Pixel-style Android
(412×915 via CDP). Compare /v1 vs /v2 where /v2 exists.

### 4.E — Keyboard flows

- /perform/setlist/<id>: arrow keys / space / transpose hotkeys;
  metronome controls; chart-binding picker keyboard nav.
- /manage/library-review: j/k navigate, 1/2/3 tabs, a/r/e actions,
  / filter, Esc cancel, Enter expand. b7 access-gating shipped but
  keyboard flow itself never end-to-end probed.
- /setlists: row navigation; Enter to edit.

### 4.F — Mobile / states / multi-role concurrency

- Mobile via CDP per §2.2.
- Pinch-zoom WORKS now (cycle-3.5 P2-012 unlock) — explicitly verify.
- Network-offline + slow-3G per surface.
- Empty states.
- Auth-expired mid-session.
- **NEW multi-role concurrency:** 3 Chrome profiles open
  simultaneously (admin, band_leader test, musician test) on same
  setlist. Admin publishes → other roles see update? Admin clones →
  visible? Admin unassigns musician → musician's view updates?
  Realtime listener health.

### 4.G — TESTING (BIG axis, Daniel's explicit ask)

Six sub-axes. Each is its own finding cluster — emit findings under
`axis: "testing", axis_subtype: "<sub-axis-key>"`.

#### 4.G.1 — Test-infrastructure health

Static read via mounted MCP repo at §2.1. Known carry-forward issues
flagged by prior cycles:

- `vitest.config.*` jsdom resolution (cycle-3 envelope sweep open
  follow-up)
- `@dnd-kit` type import resolution (b1-error-envelope-sweep + cycle-
  3-envelope)
- `NODE_ENV` write-only TS error
- `mcp-roster` mock arity mismatch (line ~56)
- `mcp-publish-setlist` regex flag (lines ~240, ~449)
- `SetlistGrid` test dir skipped per b1's master-tip note

For each: confirm still broken, identify root cause, propose 1-line
fix direction. These have been carried forward across 3 cycles — time
to triage them.

#### 4.G.2 — Test-coverage gaps for shipped features

For each feature shipped since cycle-2, audit test presence:

| Feature | Where to look | What "tested" means here |
|---|---|---|
| reconcile_library (a2) | `src/lib/mcp/tools/reconcile-library.ts` + sibling `.test.ts` | dryRun plan + force commit + Drive 200 mirror + Drive 404 orphan + transient retry |
| salvage_chart_bytes (cycle3-reconcile-data) | `src/lib/mcp/tools/<file>.test.ts` | sourceUrl probe + dryRun + commit + idempotency |
| AI enrichment Gemini (a3-gemini-swap) | `src/lib/library/ai-enrichment.ts` test | Gemini provider mock + shape preservation + sub-0.7 routing + auto-apply gate |
| /api/web-vitals (cycle3.5-perf P2-017) | `src/app/api/web-vitals/route.test.ts` | rate-limit + Zod validation + Admin SDK write + 401 on bad token |
| /setlists pagination (cycle3.5-perf P2-004) | `src/hooks/use-setlist-dashboard.test.ts` | cursor + Load more + subscription-wins de-dup |
| /login SSR (cycle3.5-login-ssr) | `src/app/login/page.test.tsx` (if exists) | prerender contains button shell; LoginClient mounts |
| a11y dev-mode warnings (cycle3.5-a11y-sweep) | `src/components/ui/button.test.tsx` + `input.test.tsx` | warn on missing accessible name; silent in prod; accepts all 5 affordances |
| `__test_delete_storage_object` (GAP-002) | `src/lib/mcp/tools/<file>.test.ts` | bearer-gated + admin-role-gated + dryRun + commit |
| Correction signals (c3) | `src/lib/library/correction-signals.test.ts` | emit on accept/reject/edit + admin stats aggregation |
| Roster MCP (c1) | `src/lib/mcp/tools/roster.test.ts` | 9-tool surface + assignment service refactor |
| Library-review MCP (a5) | `src/lib/mcp/tools/library-review.test.ts` | 7-tool surface mirroring a4 UI affordances |
| AI config MCP (c2) | `src/lib/mcp/tools/ai-config.test.ts` | set_ai_threshold + set_ai_auto_apply + GetAiConfigResult shape |
| Drive cron (a1 NEW-1) | `src/app/api/cron/drive-sync/route.test.ts` | bearer gate + Drive watcher behavior + subfolder collection mapping |

Emit one finding per feature with `verdict: covered | partial | missing`.

#### 4.G.3 — Test-fixture hygiene (cycle-3 envelope migration tail)

Cycle-3 envelope flagged: "Emulator test fixture cleanup for top-
level `message:` assertions that the multi-line perl move didn't
catch (production emit paths are correct; per-test cleanup remains)."

Grep all `__tests__/**` + `*.test.ts` for:
- `toMatchObject({ok:false, error:'<string>'` (flat shape — should be
  rich object now)
- `toMatchObject({ok:false, message:` at the top level (should be
  `error.message`)
- `throw new Error(r.error)` (should stringify if object)
- F-05 `refused:true` assertions (should be rich `force_required`
  shape asserting on `dryRunPlan`)

Emit one finding per cluster (group by test file). Each emit needs
fix_direction.

#### 4.G.4 — E2E suite audit (b6 + b7)

`e2e/*.spec.ts`:
- b6: perform-flow UAT suite (read it; enumerate tests)
- b7: Playwright access-gating UAT for /manage/library-review

For each:
- Count `test.skip`, `test.only`, `test.fixme` — flag if any in
  shipped master.
- Identify coverage gaps: what surface/flow does each spec actually
  exercise? Cross-reference with §4.B / §4.E findings.
- Bit-rot check: do tests still match current UI selectors? (Run mind-
  walk through each `page.locator(...)` call against current source.)
- Test-fidelity check: do tests hit emulator or real Firestore? Per
  [[feedback_harness_real_firestore]] some flows demand real Firestore
  fidelity.

Emit `META-EBN` findings (e2e bit-rot, e2e coverage gap).

#### 4.G.5 — Test-fidelity check (in-memory adapter risk)

[[feedback_harness_real_firestore]]: in-memory zero-latency adapter
misses cache-vs-fresh races. Sync-engine cutover phases (lazy-
hydration, dual-read, listener changes) need higher-fidelity adapter
OR Firebase emulator OR HUMAN-VERIFY repro.

Audit: which tests use in-memory adapter for sync-engine work that
SHOULD be hitting emulator? Tests live under `src/lib/sync/__tests__/`
+ similar. Flag false-confidence tests where adapter shape is too
simplified.

#### 4.G.6 — MCP-tool unit coverage matrix

Enumerate every tool registered in `src/lib/mcp/tools/index.ts`. For
each:
- Tool name
- File path
- Has dedicated `.test.ts`? Y/N
- If Y: validation/error tests? happy-path tests? F-05 tests?
- If N: severity (HIGH if write tool, MED if read tool, LOW if admin-
  only meta tool)

Emit one matrix as `MCP-COV-MATRIX` finding with full table embedded.

### 4.H — Security re-baseline (light)

Cycle-3 SEC-001 scrubbed uid from refusal envelopes. Confirm:
- No refusal body contains a Firebase uid string (`[A-Za-z0-9]{28}`
  pattern from prod uids).
- Bearer audit on /api/mcp tool responses: never echoed back.
- CSRF: any state-changing GET endpoints? (should be 0)

---

## §5 — Test identity provisioning

Same P0 setup as cycle-3.5 §5, with one addition:

**P0.A — Test-isolated setlist for /perform/setlist/<id> probes:**
1. Mint band_leader test user
2. From band_leader's cookie context, call MCP
   `create_setlist({name: 'cycle-4 perform-ui probe', isTest: true,
   eventDateTime: '<tomorrow ISO>', collection: 'shabbat'})`
3. `bulk_add_tracks({setlistId, tracks: [{fileId: '<existing chart>',
   ...}, ...]})` with 3-5 charts from library_index (use
   list_library to pick)
4. Capture setlistId — all `/perform/setlist/<id>` probes use this

P5 teardown adds:
- Verify cleanup_all_test_data also tore down the test setlist (it
  should, via `isTest:true` cascade).

---

## §6 — Phases (with checkpoint log)

Write each transition to `cycle-4/convergence.log`:

```
ts=<iso> phase=<P0|P1|P2|P3|P4|P5|P6|P7> event=<entered|complete|skipped> notes=<short>
```

- **P0 — Prerequisites handshake + bootstrap** (~10-30 min, blocks
  on Daniel if anything missing)
  - Run §2.1 (filesystem MCP), §2.2 (CDP), §2.3 (MCP server), §2.4
    (test-identity rehearsal) verifications. BLOCK on any failure
    per §2's block-request protocol. Wait for Daniel's "go" replies.
  - Once all green, post §2.6 confirmation message.
  - §2.5 + §5 mint test users + test setlist (no Daniel block — this
    is autonomous).
  - Open 9 surfaces in tabs (admin + per-role + mobile-emulated).
  - Snapshot baselines.

- **P1 — Surface walk** (~45 min)
  - Each surface authed + unauthed
  - HARs, screenshots, payload sizes, console errors
  - Note loading patterns

- **P2 — Regression close-out sweep** (§4.A) (~60-90 min)
  - **DO THIS FIRST AFTER P1.** Daniel-explicit close-out priority.
  - Every shipped row in §1.A gets a PASS/FAIL finding.
  - 8 MCP-tool error envelopes + 8 F-05 refusals + 3 cron auth paths
    + login SSR + perf bundle + a11y sweep.

- **P3 — a11y + CWV + visual + keyboard** (~60 min)
  - Surfaces × axes per §7 matrix.

- **P4 — Mobile viewports (CDP)** (~45 min)
  - iPhone SE + Pixel + iPad mini under CDP touch-emulation.

- **P5 — Multi-role concurrency** (~30 min)
  - 3 profiles, same setlist, admin mutates, watch realtime sync.

- **P6 — TESTING axis BIG sweep (§4.G)** (~90-120 min)
  - Static repo audit via filesystem MCP.
  - 4.G.1 → 4.G.6 in order; emit per sub-axis.
  - This is the largest single phase. Don't shortcut.

- **P7 — Cleanup + bearer-leak audit + emit summary** (~15 min)
  - cleanup_all_test_data; restore aiConfig if touched.
  - Grep all outputs for `crl_live_`. Zero hits required.
  - HANDOFF-TO-SUPERVISOR.md (exec table).
  - _summary.json + cleanup-audit.json.

Self-converge ONLY if all P2 + P6 close-out / testing findings emitted.
Cycle-4 is the "go big" cycle — burn the budget if needed.

---

## §7 — Per-surface probe matrix

| Surface | reg | a11y | CWV | visual | kb | mobile | states | tests |
|---|---|---|---|---|---|---|---|---|
| `/perform` (listing) | □ | □ | □ | □ | — | □ | empty | — |
| `/perform/setlist/<id>` | □ | □ | □ | □ | □ (transpose) | □ | empty / no-binds | b6 |
| `/setlists` | □ | □ | □ | □ | □ | □ | empty / >50 | b6 |
| `/setlists/<id>` | □ | □ | □ | □ | □ | □ | drift-banner | F-017 |
| `/library` | □ | □ | □ | □ | □ | □ | empty | — |
| `/manage/library-review` | □ | □ | □ | □ | □ (a4 kb) | □ | empty queue | b7 |
| `/monitor` | □ | □ | □ | □ | □ | □ | offline | — |
| `/v2/*` | □ | □ | □ | □ | □ | □ | beta-opt-in | — |
| `/login` | □ | □ | □ | □ | □ | □ | error | — |

Tick each cell as completed. Summary table in HANDOFF.

---

## §8 — Findings schema

Per finding, append a line to `cycle-4/findings.jsonl`:

```json
{
  "id": "C4-001",
  "axis": "regression|a11y|ui_ux|performance|usability|feature_gap|ops|testing|security",
  "axis_subtype": "<axe-rule | wcag-criterion | cwv-metric | keyboard | visual | state | test-infra | test-coverage | test-fixture | e2e-audit | test-fidelity | mcp-coverage | ...>",
  "regression_id": "REG-002|REG-003|SEC-001|BUG-001|... or null",
  "verdict": "PASS|FAIL|MISSING|null (only set for axis=regression or axis_subtype=test-coverage)",
  "severity": "HIGH|MED|LOW|NOTE",
  "title": "<one-line>",
  "probe_mode": "browser_surface|mcp_http|static_audit|cdp_emulation",
  "surface": "/perform|/setlists|... or null",
  "viewport": "desktop|ipad-mini|iphone-se|pixel|null",
  "touch_lane": ["<file paths likely involved>"],
  "parallelizable_with": ["<other C4-NNN IDs>"],
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
  "evidence_paths": ["artifacts/C4-001/screenshot.png", "artifacts/C4-001/axe.json"],
  "discovered_at": "<iso>",
  "phase": "P2|P3|P4|P5|P6"
}
```

IDs: zero-padded sequential `C4-NNN` (resets the P2-/REG-/BUG- prefix
namespace to avoid collision with prior cycles).

**Meta findings** use prefix `META-NNN` (harness/coverage issues that
aren't repo bugs): `META-001` filesystem MCP missing, `META-002` CDP
missing, `META-EBN-NNN` e2e bit-rot, `MCP-COV-MATRIX` (single
finding embedding the matrix table).

---

## §9 — Self-convergence

Exit early if ALL of:

1. Every row in §1.A has at least one `axis:"regression"` finding with
   PASS or FAIL verdict.
2. §7 matrix is fully ticked.
3. §4.G all 6 sub-axes have emitted at least one finding (test-infra,
   test-coverage, test-fixture, e2e-audit, test-fidelity, mcp-coverage).
4. All `daniel_discussion_required: true` findings have a rationale
   sketch.
5. P7 cleanup green (test users 0, bearer-leak audit 0 hits,
   `isTest:true` setlist cascaded to 0).

Otherwise burn the full 8h. This is the "go big" cycle.

---

## §10 — Output target (supervisor reads this)

```
sheet-music-app-mcp/outputs/autonomous-run/cycle-4/
├── HANDOFF-TO-SUPERVISOR.md   # exec summary + matrix table
├── findings.jsonl
├── convergence.log
├── cleanup-audit.json
└── artifacts/
    ├── _summary.json
    ├── _surface-inventory.json
    ├── _cookies/ (P7 deletes)
    ├── _regression-closeout.json  # NEW: §4.A summary by regression_id
    ├── _testing-matrix.json       # NEW: §4.G.6 MCP coverage matrix
    ├── cwv/<surface>.json
    ├── axe/<surface>-<viewport>.json
    ├── webvitals-sink-cross-check.json  # captured-PO vs Firestore-sink
    └── <FINDING_ID>/{screenshot.png, har.json, axe.json, ...}
```

`HANDOFF-TO-SUPERVISOR.md` MUST include:

1. Run window (start → end ISO).
2. Findings count by severity × axis (matrix).
3. **Regression close-out table** — one row per row in §1.A with
   PASS/FAIL/PARTIAL verdict.
4. §7 surface × axis matrix with ✅ / ⚠ / 🟥 per cell.
5. **Testing-axis summary** — counts for each §4.G sub-axis + MCP
   coverage matrix highlights.
6. `daniel_discussion_required` list with cowork's recommendation per
   item.
7. Coverage notes (anything skipped + why).
8. Reminder: rotate DRIVER_BEARER + scrub this prompt.

---

## §11 — Standing rules (carry forward, updated)

- **Rich error envelope is the wire shape now.** `{ok:false,
  error:{code, machine_code, message, debug?}, ...extras}`. Probe
  the contract; don't be a moving target.
- **F-05 dryRun is observability** per
  [[feedback_dryrun_is_observability]] — refuse-gates only fire on
  real writes; `dryRun:true` returns full report unconditionally.
- **Force-gated writes** emit `{ok:false, error:{machine_code:
  'force_required'}, dryRunPlan:...}` (rich, not flat).
- **Bearer never echoed.**
- **No bridge/** probing.
- **Test-data-only writes** with `isTest:true`. Cleanup mandatory.
- **Chart bytes public is intentional** per
  [[feedback_chart_access_policy]].
- **Vocal Lead** terminology per [[feedback_terminology]].
- **Trusted-leader** (admin + band_leader) rate-limit bypass is
  intentional per [[feedback_admin_rate_limit_bypass]] — don't flag.
- **Self-inclusion path** for cleanup tools per
  [[feedback_self_inclusion_test_fixtures]] — caller must not strand
  themselves out of admin role.
- **Dedup threshold stays 0.85 strict** + per-call `force: true`
  override per [[feedback_dedup_force_override]] — don't propose
  threshold tuning.

---

## §12 — Daniel-ops queue (FYI — these are post-cycle, not your work)

For context (do not act on these — Daniel handles):

- Rotate DRIVER_BEARER (priority post-run).
- Triage 24 known orphan upload-* rows via `salvage_chart_bytes`
  per-row. Cycle-3 reconcile-data ID'd the rows; salvage MCP exists.
- One-shot `backfill_library_index({force:true})` to drain cycle-2
  carry-over backlog.
- `webVitalsObservations` retention policy decision (cycle-3.5 perf
  open follow-up — unbounded growth).
- `/v2/library` 404 inline doc comment (Daniel-ratified defer to v2-
  migration phase but minor cleanup possible).
- Disk cruft cleanup (orphan worktree dirs from Windows handle issue).

---

## §13 — Go signal

Daniel pastes this prompt into a fresh Claude Desktop session. **The
only manual prerequisite is having Claude for Chrome installed +
active in his Chrome** — everything else (filesystem MCP, CDP
permission, centralreform.live MCP, test-identity rehearsal) is
verified by cowork itself in P0 (§2), and cowork BLOCKS with a
structured request if any item is missing.

Cowork's first action on receiving this prompt:
1. Acknowledge receipt + start P0 prerequisite handshake (§2).
2. Verify §2.1 → §2.4 in order. For each failure, post the
   §2-format block request and `await user_input`.
3. Once all green, post §2.6 confirmation and proceed autonomously
   for 6-8h.

Daniel walks away once §2.6 confirmation is posted; output lands at
§10.

Go big.
