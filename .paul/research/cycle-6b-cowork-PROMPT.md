# Cycle-6 Instance B cowork — fresh unauth audit + webVitals telemetry pulls + Sentry/error pulls

> **DO NOT COMMIT THIS FILE WITH BEARER INTACT.** Bearer is LIVE at §0.
> Stays untracked in git per the standing rule for cowork prompts.
>
> **Part of the cycle-6 4-way parallel split (last major cowork wave).** Siblings:
> - Instance A — cycle-5 regression validation (cycle-6a-cowork-PROMPT.md)
> - Instance C — David's band_leader weekly flow (cycle-6c-cowork-PROMPT.md)
> - Instance D — wide-domain fresh-eyes + DB + dep drift + AI cost (cycle-6d-cowork-PROMPT.md)
>
> You are INSTANCE B. Stay in your lane. Your writes use `test-6B-`
> prefix; your output goes to `cycle-6/instance-B/`; your findings
> are `C6B-NNN`. Supervisor reconciles all four HANDOFFs after.

---

## §0 — Identity, bearer, output

**You are Instance B of the cycle-6 cowork sweep.** Single Claude
Desktop session, ~80-100min depth.

**DRIVER_BEARER (admin):**
```
crl_live_21c21212cece7cb405fa7fb2c4bfdeb18ecadad077f24ccb6a4c9974b1f8b1bb
```
Treat as burned by end of run. Never echo. Daniel rotates after.

**Production target:** `https://www.centralreform.live/` (use `www.`
explicitly — apex 307→www strips Authorization header).

**Output dir:** `sheet-music-app-mcp/outputs/autonomous-run/cycle-6/instance-B/`

**Test-data prefix:** `test-6B-`. Findings prefix: `C6B-NNN`.

**Baseline master tip:** capture `git log -1 --pretty=%H origin/master` as first line of `convergence.log` alongside `HARNESS_HOME=<path>`.

---

## §1 — Ratified policies primer (READ FIRST; non-negotiable)

| Policy | Memory cite | Summary |
|---|---|---|
| Chart access | [[feedback_chart_access_policy]] | public-from-in-app intentional. |
| Setlist contents public | [[feedback_setlist_public_policy]] | public by design. |
| No cover art | [[feedback_no_cover_art]] | max-density rows only. |
| Vocal Lead terminology | [[feedback_terminology]] | "Vocal Lead" not "Lead". |
| Trusted-leader bypass | [[feedback_admin_rate_limit_bypass]] | admin + band_leader bypass MCP rate-limits + /manage/library-review + /manage/templates. NOT /monitor. |
| MCP-first authoring | [[user_mcp_is_primary_author_workflow]] | Daniel authors via Claude+MCP, not in-app UI. |

Policy-ratified surfaces emit `severity:"info"`, NOT HIGH/MED.

---

## §2 — Harness reality

### §2.1 — CFC + chrome.debugger does NOT work
Use harness only.

### §2.2 — Harness IS sandbox-survival-guaranteed (cycle-6 lesson)
Per `[[feedback_cowork_real_harness]]` addendum (ratified 2026-05-19 post-Lane-6 ship `a42fd8a47`): scripts/* + node_modules/@playwright are survival-guaranteed across cowork sandboxes. Use directly.

Discovery (P0):
```bash
find . -name probe.mjs -path "*/cycle-4/harness/lib/*" 2>/dev/null
find . -name probe-batch.mjs 2>/dev/null
find . -name '@playwright' -type d 2>/dev/null | head -5
```

### §2.3 — Egress IP caveat
Playwright-in-sandbox = datacenter egress. Acknowledge in every CWV finding (lab numbers ≠ real phone).

---

## §3 — Prerequisites handshake (BLOCK on missing)

### §3.1 — Filesystem MCP mount
`read_file` on `C:\Users\dsbog\centralreform.live\sheet-music-app\package.json`. GREEN if returns.

### §3.2 — centralreform.live MCP server
`list_library({limit:1})`. GREEN if row returns.

### §3.3 — Harness located
Run §2.2 discovery. GREEN if probe.mjs present.

### §3.4 — webVitalsObservations collection access
`dump_collection_size({collectionName:'webVitalsObservations'})` via your admin bearer. GREEN if returns doc count (any number, even 0 confirms collection exists + Admin SDK can reach it). If "permission denied" or "collection not found", BLOCK — collection wiring needs investigation.

### §3.5 — Confirmation before P1
Post:
> ✅ Instance B prerequisites green. HARNESS_HOME=<path>, master baseline=<sha>, webVitals collection accessible. Starting P1 unauth-surface cold-load.

---

## §4 — Mission (fresh unauth audit + real-user telemetry pull)

**Two prongs:**

**(A) Unauth-edge audit** — what does a fresh unauth visitor see on the post-cycle-5-fixes edge state? Lane 1 (security hardening) + Lane 3 (login a11y) + Lane 4 (vestigial 404s, sitemap, bundle-guard) all shipped to master. Validate at the public edge.

**(B) Real-user telemetry pull** — pull `webVitalsObservations` real-user data + Sentry/Firebase error logs. Map to green-rubric criterion 4 (LCP p75 < 2.5s on `/perform` + setlist + library, CLS p75 < 0.1, INP p75 < 200ms, error rate zero-unhandled-last-7d). This is the load-bearing telemetry probe for green declaration.

---

## §5 — Hard boundaries

- **Unauth-first.** Don't sign in unless explicitly probing authed surface.
- **NO mutations to real prod data.** `isTest:true` + `test-6B-` prefix on EVERY write.
- **NO probe of `bridge/**`** (CRIT-003).
- **NO commit of this prompt with bearer intact.**
- **Disjoint from A/C/D:** don't touch `test-6A-` / `test-6C-` / `test-6D-` data.
- **Cleanup:** `cleanup_all_test_data({prefix:'test-6B'})` on exit per `[[feedback_sandbox_test_isolation]]`.

---

## §6 — Coverage matrix

### §6.A — Cold-load unauth-website surface walk
- Load `https://www.centralreform.live/` unauthed. Document the landing. Per UNAUTH-001 (`16a42add7`), unauth `/` should 307→`/perform`. Confirm via `curl -sI`. Then load `/perform` unauth — what renders?
- Walk every linked-from-/login surface: `/privacy`, `/terms`, `/sms-consent`, `/changelog`, `/accessibility`. Each must 200 + content present + sensible + no console errors.
- Document the apex→www redirect chain: `curl -sI -L https://centralreform.live/` + count hops + final URL + header propagation. **Note Authorization-header drop** — C5B-002 still open, document current state with exact behavior. Recommendation for Vercel domain config goes in HANDOFF.

### §6.B — Login surface a11y deep-dive
- Run axe-core on `/login`, `/privacy`, `/terms`, `/sms-consent`, `/changelog`, `/accessibility`. Report violations by severity per surface.
- Confirm `<main id="main-content">` skip-link target (C5B-008 ship).
- Confirm sign-in button is enabled pre-JS (C5C-003 ship — Web SDK doesn't gate enablement).
- Confirm legal-nav present (C5B-009 ship).
- Mobile viewport sanity-check: open `/login` in iPhone SE + Pixel 5 emulation. Touch targets ≥44px? Pinch-zoom enabled (P2-012 ship)?

### §6.C — Unauth bundle size + edge CWV
- Measure unauth `/login` bundle size at the edge. Daniel's 500KB target. Use `probe-batch.mjs --profile=desktop-fast --surface=/login --unauth`.
- Lighthouse on `/login` and `/perform` (logged-out). Report LCP, CLS, INP, TTI. Compare to green-rubric criterion 4 thresholds.

### §6.D — Sitemap + robots consistency
- `curl https://www.centralreform.live/sitemap.xml` — list all URLs.
- `curl https://www.centralreform.live/robots.txt` — list all allow/disallow rules.
- Cross-check: every sitemap URL should match a robots allow (or no disallow). Any conflict = finding.

### §6.E — Error-envelope wire shape at the edge (unauth)
- `curl -i https://www.centralreform.live/api/library/list` (no auth). Confirm 401 + JSON body has `{error, code, message, machine_code?}` per C5C-001 + C5C-002 ship.
- `curl -i https://www.centralreform.live/api/drive/metadata` (no auth). Same.
- `curl -i https://www.centralreform.live/api/mcp` (no auth). Confirm 401 + `error_description` (OAuth-shaped).
- Probe 3-5 other public-facing API routes; confirm consistent envelope wire shape.

### §6.F — webVitalsObservations real-user telemetry pull (load-bearing)
Use `dump_collection_size` for size context. Then query the collection directly via Admin SDK (or via an MCP read tool if available). Filter to last 7 days + last 30 days separately. Aggregate per route:

- `/perform`, `/perform/setlist/<id>`, `/library`, `/login`, `/`, `/setlists`, `/manage/library-review`.
- Compute p50 / p75 / p95 for LCP, CLS, INP.
- Compute sample count per route (sparse-coverage routes are themselves findings — telemetry pipeline may be silent).
- Map to green-rubric criterion 4. Report **PASS/FAIL per route × metric**.

If `webVitalsObservations` is empty or near-empty for last 24h: that's a CRITICAL finding (telemetry pipeline broken). Probe `/api/web-vitals/route.ts` ingestion directly.

### §6.G — Sentry / Firebase Functions error pull
- Determine which is wired (Sentry per `@sentry/nextjs` references? Firebase Functions logs?).
- Pull unhandled-exception count last 7d.
- Top-N stack traces.
- Map to green-rubric criterion 4 error-rate threshold (zero unhandled OR stable trailing baseline Daniel-ratified). Any spike vs trailing baseline = BLOCKS-GREEN candidate.

### §6.H — Tooling-gap surfacing (META-NNN — first-class)
If telemetry pulls hit "no Admin SDK for X" or "no MCP tool for Y" — emit META-NNN at the wall. Don't silently skip.

---

## §7 — Phases (Instance B)

- **P0 — Prereqs + harness discovery** (~10-15min)
- **P1 — §6.A + §6.B unauth-edge walk + axe** (~20-25min)
- **P2 — §6.C bundle + Lighthouse** (~15min)
- **P3 — §6.D + §6.E sitemap + envelope** (~10-15min)
- **P4 — §6.F webVitals pull (LOAD-BEARING)** (~15-20min)
- **P5 — §6.G error pull** (~10min)
- **P6 — Cleanup + HANDOFF** (~10min)

Total: ~90-110min. Self-converge when §6.F + §6.G have green-rubric-mappable verdicts AND axe-core coverage on all unauth surfaces.

---

## §8 — Findings schema

Append to `cycle-6/instance-B/findings.jsonl`. Schema identical to Instance A — `id` prefix `C6B-`, every finding tagged `triage: BLOCKS-GREEN | POLISH`.

**Green-rubric mapping field** (NEW for Instance B):
```json
{
  "green_rubric_criterion": "4|null",
  "green_rubric_verdict": "PASS|FAIL|null"
}
```
Use this on findings that directly map to criterion 4. Telemetry pipeline brokenness → criterion 4 FAIL.

---

## §9 — Output target

```
sheet-music-app-mcp/outputs/autonomous-run/cycle-6/instance-B/
├── HANDOFF-TO-SUPERVISOR.md
├── findings.jsonl
├── convergence.log
├── cleanup-audit.json
└── artifacts/
    ├── _telemetry-pull.json           # The load-bearing pull (§6.F)
    ├── _error-pull.json               # §6.G
    ├── _unauth-edge-walk.json         # §6.A + §6.B
    ├── _bundle-cwv.json               # §6.C
    ├── _envelope-consistency.json     # §6.E
    ├── _sitemap-robots.json           # §6.D
    ├── axe/<surface>-<viewport>.json
    └── <FINDING_ID>/{screenshot.png, har.json, ...}
```

**HANDOFF-TO-SUPERVISOR.md** must lead with:
1. Run window.
2. **Green-rubric criterion 4 verdict at top:** LCP/CLS/INP p75 per route, error rate, PASS/FAIL.
3. Apex→www redirect chain documentation (for C5B-002 closeout).
4. Per-surface axe matrix.
5. `daniel_discussion_required` list.
6. Reminder: rotate DRIVER_BEARER + scrub bearer.

---

## §10 — Standing rules

- All standing rules from Instance A §10 apply.
- **Telemetry-pull discipline:** when querying `webVitalsObservations`, document the WHERE clause + sample count + collection size for reproducibility.
- **Edge-vs-origin discipline:** `curl https://www.centralreform.live/...` ≠ `curl https://centralreform.live/...`. Always use `www.` for auth-bearing calls. Document the redirect-strip explicitly in C5B-002 followup.

---

## §11 — Go signal

Daniel pastes into fresh Claude Desktop session. First action:
1. Acknowledge + start §3 handshake.
2. Verify §3.1 → §3.4 in order; BLOCK on failures.
3. Post §3.5 confirmation, proceed.

Daniel can walk away after §3.5; output lands at §9.

Go.
