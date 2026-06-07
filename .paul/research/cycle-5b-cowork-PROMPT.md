# Cycle-5 Instance B cowork — fresh unauth-website audit

> **DO NOT COMMIT THIS FILE WITH BEARER INTACT.** Bearer is LIVE at §0.
>
> **Part of the cycle-5 4-way parallel split.** Siblings:
> - Instance A — close-out + Web-SDK + mobile (cycle-5a-cowork-PROMPT.md)
> - Instance C — David's band_leader flow + Drive upload (cycle-5c-cowork-PROMPT.md)
> - Instance D — wide-domain + optionals (cycle-5d-cowork-PROMPT.md)
>
> You are INSTANCE B. Stay in your lane (Mission E). Writes use `test-5B-`
> prefix; output `cycle-5/instance-B/`; findings `C5B-NNN`.

---

## §0 — Identity, bearer, output

**You are Instance B of the cycle-5 cowork sweep.** Single Claude
Desktop session, ~60-90min focused depth.

**DRIVER_BEARER (admin — used briefly only to mint a published test
setlist for unauth deep-link probing):**
```
crl_live_6040e4ab33b78f7d38374429f689c8e4d77e43b61656a1b707d46c00ad829c9b
```
Treat as burned by end of run.

**Production target:** `https://centralreform.live/`

**Output dir:** `sheet-music-app-mcp/outputs/autonomous-run/cycle-5/instance-B/`

**Test-data prefix:** `test-5B-`.

**Findings ID prefix:** `C5B-NNN`.

**Baseline master tip:** capture in convergence.log first line.

---

## §1 — Ratified policies primer (LOAD-BEARING for this mission)

Unauth audits run head-first into ratified-public surfaces. INFO severity
+ memory cite — NOT bug findings.

| Policy | Memory | Apply to unauth audit |
|---|---|---|
| Chart access | [[feedback_chart_access_policy]] | Chart bytes via `/api/drive/file/<fileId>` PUBLIC FROM IN-APP CONTEXT ONLY (Sec-Fetch-Site/Origin/cookie heuristic). Bare-HTTP returns 401. Don't flag chart-byte access in unauth as a bug; verify in-app context still works. |
| Setlist contents public | [[feedback_setlist_public_policy]] | Setlist tracks/notes on `/perform/setlist/<id>` PUBLIC BY DESIGN. Band-member-2-min-before-gig is the load-bearing user. Don't flag setlist-field exposure. |
| No cover art | [[feedback_no_cover_art]] | Don't propose cover-art as missing. |
| Vocal Lead | [[feedback_terminology]] | "Vocal Lead" — don't rename. |
| Bridge | CRIT-003 | `bridge/**` DO-NOT-TOUCH. |

**These suppressions matter MORE in unauth probing** because content-leak
findings are tempting. Cite the memory + drop to INFO.

---

## §2 — Harness reality

### §2.1 — CFC + chrome.debugger does NOT work
Don't try.

### §2.2 — Discover the cycle-4 harness

Only `cycle-4/harness/lib/probe.mjs` is repo-tracked. Sandbox scripts/* +
node_modules may not have survived. Discovery:

```bash
find . -name probe.mjs -path "*/cycle-4/harness/lib/*" 2>/dev/null
find . -name '@playwright' -type d 2>/dev/null | head -5
```

For Instance B, you mostly need `mintSession` (for the brief admin
session to mint a deep-link setlist) + `runAxe` + `attachWebVitals` +
`attachConsoleSink`. You can drive everything else inline with vanilla
Playwright.

If probe.mjs anywhere → GREEN. If degraded (scripts/* missing) →
DEGRADED-OK, rebuild inline. If nowhere → BLOCK per §3.3.

### §2.3 — Egress IP caveat

Datacenter egress. Relative throttling valid; absolute RTT to CDN won't
match real phone. Cite in CWV findings.

---

## §3 — Prerequisites handshake

Block-request format:
```
🛑 INSTANCE B BLOCKED — prerequisite <NN>
Need: <one-line>
Why: <what this unblocks>
Action: <Daniel step>
Confirm "ready" once done.
```

### §3.1 — Filesystem MCP
`read_file` on
`C:\Users\dsbog\centralreform.live\sheet-music-app\package.json`. GREEN
on content; BLOCK on error.

### §3.2 — MCP server reachable
`list_library({limit:1})`. GREEN on row; BLOCK on error. You need MCP
only briefly to mint a deep-link setlist (§3.5).

### §3.3 — Harness located
§2.2 discovery. GREEN if probe.mjs found. DEGRADED-OK if scripts/* empty.
BLOCK if probe.mjs nowhere.

### §3.4 — Playwright Firefox + WebKit available
Verify `find . -name 'firefox' -path '*playwright*' 2>/dev/null` AND
`find . -name 'webkit' -path '*playwright*' 2>/dev/null` return paths.
If missing, BLOCK requesting `npx playwright install firefox webkit`.
Needed for §6.F.xbrowser axis.

### §3.5 — Mint a deep-link test setlist
Mint a band_leader test user `test-5B-deeplink-bl-<ts>`. Create a
setlist `test-5B-deeplink-<ts>` with `isTest:true` and ~5 tracks (use
existing library songs via `list_library` + `bulk_add_tracks`). Publish
via `publish_setlist({dryRun:false})` for minimal recipients (just
yourself if possible — set `recipients:[]` or `audience:"none"` if the
shape allows; otherwise accept minimal email/SMS fanout). Capture the
setlistId — you'll deep-link to `/perform/setlist/<setlistId>` from
unauth context. Tag for §5 cleanup.

### §3.6 — Confirmation before P1
Post:
> ✅ Instance B prereqs green. HARNESS_HOME=<path>, deep-link
> setlist `test-5B-deeplink-<ts>` minted at `<setlistId>`, master
> baseline=<sha>. Starting unauth audit.

---

## §4 — Mission (Mission E only)

**Fresh unauth-website audit** from a clean incognito session — no
bearer, no cookies, no `signInWithCustomToken`, no test-session route.
Walk the entire first-time-visitor / unauthenticated-band-member
experience. Cycle-4 supplement covered unauth gig-flow deeply but
cycle-5-fix-wave shipped 4 unauth fixes since; this re-walk both
validates the fixes in fresh context AND broadens to surfaces the
supplement didn't probe.

---

## §5 — Hard boundaries

- **No mutations to real prod data.** `isTest:true` + `test-5B-` prefix.
- **No probe of `bridge/**`.**
- **Chart bytes + setlist contents public per §1** — INFO severity.
- **NO commit of this prompt with bearer intact.**
- **Cleanup discipline:** `cleanup_all_test_data` filtered to `test-5B-`
  prefix on exit. The deep-link setlist + band_leader test user MUST
  be cleaned up.
- **Disjoint from Instance A + C + D:** don't touch their test-data;
  don't read their output dirs.
- **You auth ONCE in P0** (to mint the deep-link). All P1+ probing is
  from FRESH incognito context with NO storageState.

---

## §6 — Coverage matrix

### §6.F — Fresh unauth-website audit (Mission E)

**Setup per surface walk:**
- Fresh `browser.newContext()` with NO storageState, NO cookies, NO
  mintSession call.
- Both desktop (1440×900) + iPhone SE (375×667 + isMobile + touch)
  viewports.
- Use harness's anon helpers (axe, web-vitals, console sink, snapshot).

**Surfaces to walk (each emits ≥1 finding OR explicit INFO "no-issues"):**

| Surface | What to probe |
|---|---|
| `/` | UNAUTH-001 ratified 307→`/perform`. Measure redirect latency. Jarring or transparent? |
| `/perform` | Primary unauth landing. Discoverable affordances? Clear "Sign in to do more"? Setlist links clickable for band-member case? Footer / Help / Privacy / Terms present? |
| `/perform/setlist/<deeplink-id>` | Deep link to the `test-5B-deeplink-<ts>` setlist minted in §3.5. Track list renders (RSC validated by Instance A §6.A; this is end-user perception)? PDFs accessible per [[feedback_chart_access_policy]]? CWV reasonable? |
| `/login` | Form usability. Error states (bad email, wrong password). Google OAuth INIT (don't complete). SSR skeleton (P2-013) renders cleanly? |
| `/setlists` | Should redirect (`/login` or `/perform`). No flash-of-protected-content. No role-hint leak in URL/error. |
| `/library` | Same redirect expectation. |
| `/manage/library-review` | Same redirect expectation. Bonus: any admin-only data leak before redirect? |
| `/manage/templates` | Same redirect. |
| `/monitor` | Same redirect. |
| `/settings` | Same redirect. |
| `/v2/` | Vestigial 404 per cycle-3 b3 ratification. Clean 404 (not 5xx)? |
| `/v2/library` | Same. |
| `/v2/random-junk` | Same. |
| `/account` | Vestigial. Clean 404? |
| `/manage/users` | Vestigial. Clean 404? |
| `/api/health` | Cycle-2 OPS-001. Reachable from unauth? PII/internal data leak? |
| `/api/version` | Cycle-2 OPS-001. Same. |
| `/sitemap.xml` | Cycle-2 OPS-002. Reachable? Content reasonable for unauth crawlers? |
| `/api/auth/test-session` POST | Without bearer header. Should refuse (anti-CSRF). |
| `/api/mcp` POST | Without bearer. Should refuse gracefully (not crash). |
| `/api/drive/file/<nonexistent-id>` | Should 404 cleanly via cycle-4 C4-023 envelope. |
| `/perform/setlist/<nonexistent-id>` | Should error gracefully. |

**Axes to probe:**

| Axis | Approach |
|---|---|
| **a11y unauth** | axe-walk every reachable unauth surface. Cycle-3.5/cycle-4 covered authed; this fills the unauth gap. |
| **perf unauth** | CWV on `/`, `/perform`, `/perform/setlist/<id>`, `/login`. Bundle-size sniff — what gets shipped to unauth? AI SDK / Drive client / admin chrome leaking into the unauth bundle? |
| **usability unauth** | Error states, empty states, sign-in affordances, signpost clarity. "What can I actually DO here?" walkthrough — narrate as a first-time visitor. |
| **mobile unauth** | iPhone SE on every reachable unauth surface. WCAG 2.5.5 touch targets. Pinch-zoom (P2-012). |
| **xbrowser unauth** | Firefox + WebKit (Safari engine) on `/perform` + `/perform/setlist/<id>`. ~5min each. |
| **content-leak (within policy)** | Flag anything BEYOND chart bytes + setlist contents (user PII, admin data, internal config, source maps in prod, env vars in client bundle). Chart + setlist exposure = INFO with §1 memory cite. |
| **nav unauth** | UNAUTH-004 regression positive-confirm overlap. Any nav element 404/deadlink/role-hint-leak? |
| **error-states unauth** | `/perform/setlist/<nonexistent>`, `/api/drive/file/<nonexistent>`, malformed `/login` POST. Graceful or 5xx? |
| **session-expiry unauth** | Set + expire stale `__session` cookie, hit protected route. Graceful redirect or surprise? Use Playwright `context.addCookies()` with `expires` in the past. |
| **secondary-foreground AA** | Per cycle-4 a11y-revisit known-issue. Mathematically likely sub-AA. Walk unauth surfaces consuming `--secondary-foreground`; capture contrast ratios. NEW finding if confirmed. |

**Expected findings shape:** most `axis: "usability" / "a11y" / "nav" /
"perf"`. Severity skews medium/low — band-members and visitors are
load-bearing; broken flow = acquisition/retention bug. SPECIFICALLY
SUPPRESS as findings: chart-byte access, setlist-content visibility
(ratified per §1 → INFO with memory cite).

---

### §6.E — META-NNN tooling-gap (first-class)

Per Daniel-ratified 2026-05-19T04:30Z rule, emit `C5B-META-NNN` at the
moment of any tooling wall. Examples for Instance B specifically:
- "No `inspect_unauth_bundle` MCP — had to manually `curl + grep` for
  bundle leakage analysis"
- "No `simulate_expired_session` test affordance — used Playwright
  cookie injection as workaround"

Schema same as §8 with `axis: "tooling-gap"`.

---

## §7 — Phases (Instance B)

- **P0 — Prereqs + harness discovery + deep-link mint** (~15-20min)
- **P1 — Desktop unauth surface walk** (~20-30min) — every surface in
  §6.F table at 1440×900
- **P2 — iPhone SE unauth surface walk** (~15-20min) — same surfaces
- **P3 — Cross-browser sanity** (~10min) — Firefox + WebKit on `/perform`
  + `/perform/setlist/<id>`
- **P4 — Error-state + session-expiry probes** (~10min)
- **P5 — Cleanup + bearer-leak audit + HANDOFF** (~10min)

Total: ~80-100min. Self-converge if every surface in §6.F emitted at
least one finding OR explicit INFO.

---

## §8 — Findings schema

Append to `cycle-5/instance-B/findings.jsonl`:

```json
{
  "id": "C5B-001",
  "axis": "a11y|perf|usability|nav|content-leak|error-states|session-expiry|xbrowser|tooling-gap|...",
  "axis_subtype": "<wcag|cwv|...>",
  "regression_id": "UNAUTH-001|UNAUTH-004|null",
  "verdict": "PASS|FAIL|INFO|null",
  "severity": "critical|high|medium|low|info",
  "confidence": "confirmed|likely|suspected",
  "title": "<one-line>",
  "probe_mode": "browser_surface|static_audit|cli_command",
  "surface": "/perform|...",
  "viewport": "desktop|iphone-se",
  "browser": "chromium|firefox|webkit",
  "touch_lane": ["<file paths>"],
  "daniel_discussion_required": false,
  "repro": {...},
  "fix_direction": "...",
  "fix_options": [...],
  "impact": "...",
  "fix_effort": "trivial|small|medium|large",
  "blast_radius": "isolated|module|cross-cutting|architectural",
  "evidence_paths": ["artifacts/C5B-001/screenshot.png"],
  "discovered_at": "<iso>",
  "phase": "P1|P2|P3|P4"
}
```

**Policy-ratified findings = severity:"info"** with memory citation.
Don't burn HIGH/MED on chart-bytes-public or setlist-contents-public.

---

## §9 — Output target

```
sheet-music-app-mcp/outputs/autonomous-run/cycle-5/instance-B/
├── HANDOFF-TO-SUPERVISOR.md
├── findings.jsonl
├── convergence.log
├── cleanup-audit.json
└── artifacts/
    ├── _unauth-surface-matrix.json   # All §6.F surfaces × viewports × browsers
    ├── _bundle-leakage.json          # What's in the unauth JS bundle
    ├── _redirect-behavior.json       # Protected-route redirect audit
    ├── cwv/<surface>.json
    ├── axe/<surface>-<viewport>.json
    └── <FINDING_ID>/{screenshot.png, ...}
```

**HANDOFF-TO-SUPERVISOR.md** must include:
1. Run window (start → end ISO).
2. Unauth surface matrix (PASS / FINDING / INFO per row in §6.F).
3. **First-time-visitor narrative** — 1-2 paragraphs describing what
   an unauth visitor actually experiences. Daniel cares about this.
4. Bundle-leakage summary (what does the unauth user download?).
5. Mobile vs desktop diff highlights.
6. `daniel_discussion_required` list.
7. Coverage notes — anything skipped + why.
8. Reminder: rotate bearer + scrub prompt + cleanup confirmed.

---

## §10 — Standing rules (Instance B)

- Chart bytes public-from-in-app per [[feedback_chart_access_policy]].
- Setlist contents public-by-design per [[feedback_setlist_public_policy]].
- No cover art per [[feedback_no_cover_art]].
- Vocal Lead terminology per [[feedback_terminology]].
- No bridge/** probing.
- Bearer never echoed.
- This prompt stays untracked with bearer intact.
- Sandbox-survival: cycle-4 harness scripts/* not guaranteed; use
  discovery + degraded-rebuild + META-NNN per §2.2.
- CFC + chrome.debugger structurally unavailable.
- Egress IP = datacenter (cite in CWV findings).
- **Policy-ratified findings = INFO severity.** Especially in unauth
  where content-leak is tempting — cite the memory and drop to INFO.

---

## §11 — Go signal

Daniel pastes into a fresh Claude Desktop session. First action:
1. ACK receipt + start P0 prereq handshake (§3).
2. Discover harness (§2.2 / §3.3).
3. Verify §3.1 → §3.5; BLOCK on failures.
4. Post §3.6 confirmation, proceed.

Daniel can walk away after §3.6; output lands at §9.

Go.
