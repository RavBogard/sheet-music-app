# Cycle-5 Instance A cowork — harness-heavy: cycle-4 close-out + Web-SDK probes + mobile re-run

> **DO NOT COMMIT THIS FILE WITH BEARER INTACT.** Bearer is LIVE at §0.
> Stays untracked in git per the standing rule for cowork prompts.
>
> **Part of the cycle-5 3-way parallel split.** Siblings:
> - Instance B — fresh unauth-website audit (cycle-5b-cowork-PROMPT.md)
> - Instance C — David's band_leader flow + Drive upload + wide-domain + optionals (cycle-5c-cowork-PROMPT.md)
>
> You are INSTANCE A. Stay in your lane (Missions A + B + D). Your
> writes use `test-5A-` prefix; your output goes to `cycle-5/instance-A/`;
> your findings are `C5A-NNN`. The siblings handle other missions in
> parallel — supervisor reconciles all three HANDOFFs after.

---

## §0 — Identity, bearer, output

**You are Instance A of the cycle-5 cowork sweep.** Single Claude
Desktop session, ~90-120min focused depth.

**DRIVER_BEARER (admin):**
```
crl_live_7079416c48436628d18a79e845e0587213b93035f3beaecbe3fad0cf3ea48b0b
```
Treat as burned by end of run. Never echo in findings.jsonl, HARs,
screenshots, or convergence.log. Daniel rotates after.

**Production target:** `https://centralreform.live/` (master prod;
no preview branches per user preference).

**Output dir:** `sheet-music-app-mcp/outputs/autonomous-run/cycle-5/instance-A/`

**Test-data prefix:** `test-5A-` (every test user, setlist, chart you
create MUST start with this prefix; `isTest:true` on every setlist;
makes parallel-instance cleanup safe).

**Findings ID prefix:** `C5A-NNN`.

**Baseline master tip:** capture `git log -1 --pretty=%H origin/master`
output as the first line of `convergence.log` alongside `HARNESS_HOME=<path>`.

---

## §1 — Ratified policies primer (READ FIRST; non-negotiable)

Policy-ratified surfaces emit `severity:"info"`, NOT HIGH/MED.

| Policy | Memory cite | Summary |
|---|---|---|
| Chart access | [[feedback_chart_access_policy]] | `/api/drive/file/<fileId>` public from in-app context only; bare-HTTP gated by `hasBrowserFetchMetadata`. By design. |
| Setlist contents public | [[feedback_setlist_public_policy]] | Setlist tracks/notes on `/perform/setlist/<id>` public by design. |
| No cover art | [[feedback_no_cover_art]] | Max-density text rows only. Don't propose cover-art features. |
| Vocal Lead terminology | [[feedback_terminology]] | "Vocal Lead" not "Lead"/"Leader". |
| Trusted-leader rate-limit bypass | [[feedback_admin_rate_limit_bypass]] | admin + band_leader bypass MCP rate-limits. Intentional. |
| F-05 dryRun is observability | [[feedback_dryrun_is_observability]] | dryRun:true returns full report without force. |
| Dedup threshold strict | [[feedback_dedup_force_override]] | 0.85 strict; force:true overrides per call. |
| Bridge | CRIT-003 deferred | `bridge/**` DO-NOT-TOUCH. |

---

## §2 — Harness reality

### §2.1 — CFC + chrome.debugger does NOT work

Standard CFC build doesn't ship `chrome.debugger` permission. Don't try.

### §2.2 — Cycle-4 Playwright harness — DISCOVER its location

The full harness (probe.mjs + scripts/* + node_modules/) is sandbox-local
from cycle-4. Only `cycle-4/harness/lib/probe.mjs` (131 lines, stable API)
is tracked on `origin/master` (shipped at `90d2cbde0` as META-003 wire-up).

**Discovery procedure (run in P0):**

```bash
find . -name probe.mjs -path "*/cycle-4/harness/lib/*" 2>/dev/null
find . -name probe-batch.mjs 2>/dev/null
find . -name '@playwright' -type d 2>/dev/null | head -5
```

- **Best case:** probe.mjs + scripts/* + node_modules/@playwright all
  reachable → use as-is, capture `HARNESS_HOME=<path>` in convergence.log.
- **Degraded case (most likely):** probe.mjs present, scripts/* empty.
  REBUILD inline minimal drivers using probe.mjs exports
  (`mintSession`, `buildCookies`, `runAxe`, `attachWebVitals`,
  `attachConsoleSink`, `snapshotPage`, profile presets). Surface as
  META-NNN finding (axis_subtype: `missing-instrumentation`).
- **Worst case:** probe.mjs nowhere → BLOCK per §3.3.

`@playwright/test@1.58.2` may be at
`sheet-music-app-fixes-fixture-residuals/node_modules/@playwright/` or
`sheet-music-app-mcp/node_modules/@playwright/`. Use whichever exists.

### §2.3 — Egress IP caveat

Playwright-in-sandbox = datacenter egress. Relative throttle comparisons
(slow-3G vs 3G vs 4G) valid; absolute RTT to CDN won't match real phone.
Acknowledge in every CWV/TTFC finding.

---

## §3 — Prerequisites handshake (BLOCK on missing items)

Block-request format:

```
🛑 INSTANCE A BLOCKED — prerequisite <NN>

Need: <one-line>
Why:  <what this unblocks>
Action: <concrete step Daniel takes>
Confirm "ready" once done.
```

Then `await user_input`.

### §3.1 — Filesystem MCP mount
`read_file` on
`C:\Users\dsbog\centralreform.live\sheet-music-app\package.json`. GREEN
if contents return; BLOCK if errors.

### §3.2 — centralreform.live MCP server
`list_library({limit:1})`. GREEN if row returns; BLOCK if errors.

### §3.3 — Cycle-4 harness located via discovery
Run §2.2 discovery. GREEN if probe.mjs found anywhere. DEGRADED-OK
(proceed, emit META-NNN) if scripts/* empty. BLOCK only if probe.mjs
nowhere.

### §3.4 — META-003 test-session sanity
Mint throwaway musician via `create_test_account` with prefix
`test-5A-meta003-`. POST `/api/auth/test-session` with bearer. Verify
response contains `customToken: string` (JWT 3-segment). Revoke via
`revoke_test_account`. GREEN if customToken present; BLOCK if absent.

### §3.5 — Confirmation before P1
Post:
> ✅ Instance A prerequisites green. HARNESS_HOME=<path>,
> META-003 customToken confirmed, master baseline=<sha>. Starting P1
> close-out now.

---

## §4 — Mission (3 prongs, LOAD-BEARING)

**(A) Close-out positive-confirm of cycle-4 + cycle-4-fixes ships.**
The headline is UNAUTH-009 slow-3G TTFC re-measurement (was 44s, target
<6s, expected ~3-5s).

**(B) Web-SDK-unblocked flow probing.** META-003 shipped → cowork now
gets real Firebase Web SDK auth state. Probe flows that were DEFERRED
in cycle-4.

**(D) Mobile re-run.** iPhone SE + Pixel 5 with proper `BEARER_*`
exports inline (cycle-4 main session's batches failed env-scoping).

---

## §5 — Hard boundaries

- **NO mutations to real prod data.** `isTest:true` + `test-5A-` prefix.
- **NO probe of `bridge/**`** (CRIT-003).
- **Chart bytes + setlist contents public per §1** — don't flag.
- **Vocal Lead terminology per §1** — don't rename.
- **F-05 dryRun-default per §1.**
- **NO commit of this prompt with bearer intact.**
- **NO use of `force:true`** on dedupe/reconcile/salvage unless
  explicitly probing F-05 — and even then dryRun first.
- **Cleanup discipline:** `cleanup_all_test_data` filtered to `test-5A-`
  prefix on exit. `[[feedback_self_inclusion_test_fixtures]]` —
  confirm self-inclusion path doesn't strand admin caller.
- **Disjoint from Instance B + C:** don't touch their `test-5B-` /
  `test-5C-` data; don't read their output dirs.

---

## §6 — Coverage matrix

### §6.A — Cycle-4 + cycle-4-fixes ship close-out (Mission A)

| Ship | Tip SHA | Positive-confirm |
|---|---|---|
| **fixes-unauth-discovery** | `40341c1be` | Unauth `/` 307→`/perform`; nav `Setlists` href = `/perform` unauth; `/perform` console clean of permission-denied |
| **fixes-a11y-revisit** | `e2214bc92` | axe-core ZERO violations on /setlists, /library, /perform, /manage/library-review, /login, /monitor. WCAG AA on `--muted-foreground`. 0 nested-interactives on SetlistCards. /library segmented-control no `aria-controls` to non-existent panels |
| **fixes-perf-rsc** (UNAUTH-009) | `ca221b67f` | **#1 PRIORITY.** Cold-load probe on `/perform/setlist/NWPBba50fltX6pNcyOVK` at slow-3G + iPhone SE. Expected 44s → ~3-5s. 4G + 3G unchanged. SSR'd HTML contains track titles (curl-grep verify). PDFOverlay only loads on first chart open. |
| **fixes-micro-bundle C4-007** | `8ad93d15c` | Upload " Ana B'Koach.pdf" + " Mizmor.pdf" (with leading whitespace + smart quotes). library_index title `.trim()`'d at every write boundary |
| **fixes-micro-bundle C4-023** | `55ae7bf85` | Curl `/api/foo-not-real` → JSON `error.code === 404` AND HTTP 404. No `errorCode` extra leak |
| **fixes-micro-bundle META-003 harness** | `40fa56128` | Harness `mintSession()` consumes customToken; lazy-imports signInWithCustomToken |
| **fixes-micro-bundle C4-015** | `90d2cbde0` | Cookie-authed first paint shows UserMenu shell (not "Sign In"). CLS=0 SSR→hydration |
| **fixes-fixture-residuals** | check `origin/master` head | Emulator suite full green. `npx vitest run --config vitest.emulator.config.ts` returns 0 failures. (Note: this lane may have shipped mid-run; check origin tip in §3.1 and adjust SHA.) |

### §6.B — Web-SDK-unblocked probes (Mission B)

META-003 unlocked these. Cycle-4 deferred them all.

**§6.B.1 — Keyboard flows on authed surfaces:**
- `/perform/setlist/<id>`: arrow keys / space / transpose hotkeys;
  metronome controls; chart-binding picker keyboard nav.
- `/manage/library-review`: j/k navigate, 1/2/3 tabs, a/r/e actions,
  / filter, Esc cancel, Enter expand.
- `/setlists`: row navigation; Enter to edit.

For each: signInWithCustomToken via harness → drive `page.keyboard.press()`
→ capture state transitions. Tag each `test-5A-kb-<surface>`.

**§6.B.2 — Multi-role realtime concurrency:**
Three Playwright contexts (admin / band_leader test / musician test),
all viewing same setlist `test-5A-multirole-<ts>`. Admin mutates
(publish / clone / unassign). Observe other roles' views update via
Firebase listener. Capture timing — propagate within seconds?

**§6.B.3 — Drift banner triggering:**
- Open `test-5A-drift-<ts>` setlist in two authed contexts; edit in
  context A while B is open. Drift banner should appear in B.

**§6.B.4 — AI enrichment Gemini end-to-end UI flow:**
Gemini swap shipped at `a31fed312`. Upload a chart via authed UI
(tag `test-5A-aien-`), watch enrichment fire:
- Gemini enriches title/key/BPM/tags/lead-musician?
- Confidence scoring populates?
- Sub-0.7 routes to `/manage/library-review`?
- Auto-apply gate fires correctly when `aiConfig.autoApplyEnabled:false`?

**Daniel-approved 2026-05-19T04:45Z:** burn AI cost as needed. Multiple
chart variants OK.

### §6.D — Mobile re-run (Mission D)

Bearer exports INLINE (fixes cycle-4's env-scoping issue):

```bash
BEARER_admin=<§0 bearer> \
BEARER_band_leader=<minted test-5A-bl- bearer> \
BEARER_musician=<minted test-5A-mu- bearer> \
node $HARNESS_HOME/scripts/probe-batch.mjs --profile=iphone-se
node $HARNESS_HOME/scripts/probe-batch.mjs --profile=pixel-5
```

If `probe-batch.mjs` was rebuilt inline per §2.2 degraded-case, just
loop `probe.mjs` exports manually.

Surfaces: `/`, `/perform`, `/perform/setlist/<id>` (unauth + authed),
`/setlists` (authed), `/library` (authed), `/login` (unauth).

Per cycle-4-supplement findings, expect WCAG 2.5.5/2.5.8 touch-target
hits if 44px floor regressed; expect P2-012 viewport unlock to allow
pinch-zoom (verify via CDP touch-emulation).

### §6.E — Tooling-gap surfacing (META-NNN — first-class)

Per Daniel-ratified 2026-05-19T04:30Z standing rule: when missing
tooling blocks a probe, emit `META-NNN` at the moment of the wall —
don't batch, don't silently skip. Schema additive to §8:

```json
{
  "id": "META-001",
  "axis": "tooling-gap",
  "axis_subtype": "missing-mcp-tool|missing-api|missing-fixture|missing-instrumentation|missing-admin-sdk-capability|missing-firestore-index|missing-webhook|missing-ci-hook|other",
  "severity": "high|medium|low",
  "title": "<what's missing + what probe it would unblock>",
  "impact": "Without: <what couldn't test>. With: <what becomes possible>.",
  "fix_direction": "Add <name> at <location> exposing <signature>",
  "fix_effort": "trivial|small|medium|large",
  "blocks_probes": ["<C5A-NNN ids>"],
  "discovered_at": "<iso>"
}
```

Cap META-NNN at MED unless blocking a CRITICAL/HIGH probe.

---

## §7 — Phases (Instance A)

- **P0 — Prereqs + harness discovery** (~15-20min)
- **P1 — §6.A close-out** (~45min) — DO FIRST. Daniel cares most about
  UNAUTH-009 TTFC validation.
- **P2 — §6.B Web-SDK probes** (~30-45min) — biggest NEW surface.
- **P3 — §6.D Mobile re-run** (~15min) — fast batches.
- **P4 — Cleanup + bearer-leak audit + HANDOFF** (~10min)

Total: ~115-145min. Self-converge if §6.A fully done AND §6.B B.1/B.2/B.3/B.4
each have ≥1 finding AND §6.D iPhone SE + Pixel 5 batches ran.

---

## §8 — Findings schema

Append to `cycle-5/instance-A/findings.jsonl`:

```json
{
  "id": "C5A-001",
  "axis": "regression|a11y|perf|usability|sec-web|sec-mcp|tooling-gap|...",
  "axis_subtype": "<wcag|cwv|mcp-tool|keyboard|visual|state|...>",
  "regression_id": "UNAUTH-009|C4-002|...|null",
  "verdict": "PASS|FAIL|INFO|null",
  "severity": "critical|high|medium|low|info",
  "confidence": "confirmed|likely|suspected",
  "title": "<one-line>",
  "probe_mode": "browser_surface|mcp_http|static_audit|cdp_emulation|cli_command",
  "surface": "/perform|...|null",
  "viewport": "desktop|iphone-se|pixel-5|null",
  "touch_lane": ["<file paths>"],
  "daniel_discussion_required": false,
  "repro": {"preconditions": "...", "steps": [...], "expected": "...", "observed": "..."},
  "fix_direction": "<one-line>",
  "fix_options": [{"label":"...","tradeoff":"..."}],
  "impact": "<who, how badly>",
  "fix_effort": "trivial|small|medium|large",
  "blast_radius": "isolated|module|cross-cutting|architectural",
  "evidence_paths": ["artifacts/C5A-001/screenshot.png"],
  "discovered_at": "<iso>",
  "phase": "P1|P2|P3"
}
```

**Severity rubric (use it):** critical = active vuln / data loss /
prod-down / PII exposure; high = reliable bug a real user hits, WCAG A
fail on core flow; medium = annoying bug, WCAG AA fail off main flow,
perf regression; low = nit/cosmetic; info = observation, policy-ratified.

**Policy-ratified findings = severity:"info"** with memory citation.
Don't waste HIGH/MED on ratified surfaces.

---

## §9 — Output target

```
sheet-music-app-mcp/outputs/autonomous-run/cycle-5/instance-A/
├── HANDOFF-TO-SUPERVISOR.md
├── findings.jsonl
├── convergence.log
├── cleanup-audit.json
└── artifacts/
    ├── _ttfc-validation.json    # The #1 priority
    ├── _regression-closeout.json
    ├── _websdk-summary.json     # B.1-B.4
    ├── _mobile-rerun.json       # iPhone SE + Pixel 5
    ├── cwv/<surface>.json
    ├── axe/<surface>-<viewport>.json
    └── <FINDING_ID>/{screenshot.png, har.json, ...}
```

**HANDOFF-TO-SUPERVISOR.md** must lead with:
1. Run window (start → end ISO).
2. **#1 priority verdict at top:** "Did UNAUTH-009 CRITICAL slow-3G TTFC
   fix actually deliver? Pre-fix: 44s. Post-fix: <Xs>. Verdict: PASS/FAIL."
3. Cycle-4 + cycle-4-fixes regression close-out table (PASS/FAIL per row).
4. Web-SDK-unblocked probe summary (B.1-B.4).
5. Mobile re-run matrix (iPhone SE + Pixel 5 × surfaces).
6. `daniel_discussion_required` list with recommendations.
7. Coverage notes — anything skipped + why.
8. Reminder: rotate DRIVER_BEARER + scrub this prompt + cleanup confirmed.

---

## §10 — Standing rules (Instance A)

- Rich-error envelope wire shape canonical (cycle-3 sweep).
- F-05 dryRun-default per [[feedback_dryrun_is_observability]].
- Trusted-leader bypass intentional per [[feedback_admin_rate_limit_bypass]].
- No bridge/** probing.
- Chart bytes public-from-in-app per [[feedback_chart_access_policy]].
- Setlist contents public-by-design per [[feedback_setlist_public_policy]].
- Vocal Lead terminology per [[feedback_terminology]].
- No cover art per [[feedback_no_cover_art]].
- Dedup threshold strict per [[feedback_dedup_force_override]].
- Bearer never echoed.
- This prompt stays untracked with bearer intact.
- **Sandbox-survival:** cycle-4 harness scripts/* + node_modules NOT
  guaranteed across cowork sandboxes; only `probe.mjs` is repo-tracked.
  Use discovery procedure (§2.2). Surface as META-NNN if degraded.
- **CFC + chrome.debugger structurally unavailable.** Use harness only.
- **META-003 unlocks Web SDK auth.** signInWithCustomToken on startup.
- **Egress IP = datacenter.** CWV absolute numbers don't match phone.
- **Policy-ratified findings = INFO severity** with memory citation.

---

## §11 — Go signal

Daniel pastes into a fresh Claude Desktop session. First action:
1. Acknowledge receipt + start P0 prerequisite handshake (§3).
2. Discover harness (§2.2 / §3.3).
3. Verify §3.1 → §3.4 in order; BLOCK on failures.
4. Post §3.5 confirmation, proceed.

Daniel can walk away after §3.5; output lands at §9.

Go.
