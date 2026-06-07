# Cycle-5 Instance D cowork — wide-domain audit + optional carry-forward probes

> **DO NOT COMMIT THIS FILE WITH BEARER INTACT.** Bearer LIVE at §0.
>
> **Part of the cycle-5 4-way parallel split.** Siblings:
> - Instance A — close-out + Web-SDK + mobile (cycle-5a-cowork-PROMPT.md)
> - Instance B — fresh unauth-website (cycle-5b-cowork-PROMPT.md)
> - Instance C — David's band_leader flow + Drive upload (cycle-5c-cowork-PROMPT.md)
>
> You are INSTANCE D. Stay in your lane (Missions C + H). Writes use
> `test-5D-` prefix; output `cycle-5/instance-D/`; findings `C5D-NNN`.
>
> Instance D is the LIGHTEST instance — mostly static audits + light
> MCP read-only probes. Few mutating writes. Browser usage minimal.

---

## §0 — Identity, bearer, output

**You are Instance D.** Single Claude Desktop session, ~75-105min.

**DRIVER_BEARER (admin):**
```
crl_live_7337fa423ddd7587c50d803fc7acada536cab730f4b447d22b1de21a2d3cea7d
```

**Production target:** `https://centralreform.live/`

**Output dir:** `sheet-music-app-mcp/outputs/autonomous-run/cycle-5/instance-D/`

**Test-data prefix:** `test-5D-` (sparingly used — most of Instance D
is READ-ONLY).

**Findings ID prefix:** `C5D-NNN`.

**Baseline master tip:** capture in convergence.log.

---

## §1 — Ratified policies primer

| Policy | Memory | Apply |
|---|---|---|
| Chart access | [[feedback_chart_access_policy]] | Public from in-app only. |
| Setlist contents | [[feedback_setlist_public_policy]] | Public by design. |
| Trusted-leader bypass | [[feedback_admin_rate_limit_bypass]] | Intentional. |
| F-05 dryRun | [[feedback_dryrun_is_observability]] | dryRun:true unconditional. |
| Dedup threshold | [[feedback_dedup_force_override]] | 0.85 strict; force overrides. |
| Bridge | CRIT-003 | DO-NOT-TOUCH. |

---

## §2 — Harness reality

### §2.1 — CFC + chrome.debugger unavailable

### §2.2 — Discover the cycle-4 harness (light usage)

Instance D needs `mintSession` only for occasional authed surface probes
(e.g., observability axis hitting `/api/health` requires no auth, but
peering at admin chrome on `/manage/*` does). For most static-audit work
you don't touch Playwright at all.

```bash
find . -name probe.mjs -path "*/cycle-4/harness/lib/*" 2>/dev/null
```

If found → GREEN. If not → DEGRADED-OK (probably skip browser probes
entirely; emit META-NNN noting which axes degraded). If you can't find
Playwright at all, run all probes as `static_audit` or `cli_command`.

### §2.3 — Egress IP
Datacenter. Cite in any CWV finding (unlikely for Instance D).

---

## §3 — Prerequisites handshake

```
🛑 INSTANCE D BLOCKED — prerequisite <NN>
Need / Why / Action.
Confirm "ready".
```

### §3.1 — Filesystem MCP
`read_file` on `C:\Users\dsbog\centralreform.live\sheet-music-app\package.json`.

### §3.2 — MCP server
`list_library({limit:1})`.

### §3.3 — Read-only access to source tree
`read_directory` on `C:\Users\dsbog\centralreform.live\sheet-music-app\src\`.
Needed for `codequality` + `sec-web` static audits. GREEN if listing
returns; BLOCK if permission denied.

### §3.4 — Confirmation
Post:
> ✅ Instance D prereqs green. Filesystem read access confirmed.
> Master baseline=<sha>. Starting wide-domain audits.

---

## §4 — Mission (2 prongs)

**(C) Wide-domain coverage.** 10 axes adopted from the staff-engineer
audit-prompt's 24-domain taxonomy, weighted toward what cycle-2/3/3.5/4
have NOT covered. See §6.C.

**(H) Optional carry-forward probes.** 24 known orphan upload-* rows
triage; `/v2/*` 404 surface verify; `webVitalsObservations` retention
sniff; SearchOverlay TabsList parity; `--secondary-foreground` AA
empirical. See §6.I.

---

## §5 — Hard boundaries

- **READ-ONLY by default.** Mission C is mostly static audits + MCP
  read-only probes. Mission H §6.I.1 (orphan triage) MUST use
  `salvage_chart_bytes({dryRun:true})` — never live salvage.
- **No mutations to real prod data.** If you must write (rare),
  `isTest:true` + `test-5D-` prefix.
- **No probe of `bridge/**`.**
- **F-05 dryRun-default** — every write probe in dryRun mode.
- **NO commit of this prompt with bearer intact.**
- **Cleanup discipline:** `cleanup_all_test_data` filtered to `test-5D-`
  on exit (should be near-zero since instance is read-only).
- **Disjoint from Instance A + B + C:** don't touch their data; don't
  read their output dirs.

---

## §6 — Coverage matrix

### §6.C — Wide-domain coverage (Mission C)

10 axes. Each MUST emit ≥1 finding OR explicit INFO "no issues here +
what was tested." Don't ghost an axis.

#### §6.C.1 — sec-web

Standard OWASP web-security taxonomy: client-side injection (XSS-class),
CSRF, IDOR, SSRF, open-redirect, server-side injection, prototype
pollution, secrets-in-bundle, security-relevant response headers,
cookie flags, CORS config, mixed-content, dependency vulns.

Approach (static audit on `src/`):
- Run a sweep for the standard React unsafe-HTML-injection attribute
  (the one OWASP specifically warns about — name starts with the word
  meaning "in a way that is risky"). Audit every usage; flag any that
  consume user-supplied data (chart metadata strings, setlist notes,
  display names) without a sanitizer like DOMPurify.
- Run a sweep for the runtime string-to-JS-code builtins (the OWASP
  forbidden duo — the 4-letter one and the constructor one). Any usage
  in production code is a finding.
- Run a sweep for direct DOM HTML-property writes (`innerHTML\s*=`,
  `outerHTML\s*=`) and the legacy `document` write-API. Same flag rule
  as above.

Runtime audits:
- curl `https://centralreform.live/` and inspect response headers —
  CSP, X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security,
  Referrer-Policy, Permissions-Policy. Compare against OWASP secure-
  headers baseline.
- Source-map presence in prod (curl headers + look for `.map` URLs in
  HTML).
- Cookie flags on `__session` (HttpOnly, Secure, SameSite).
- IDOR sniff: try a fileId / setlistId you don't own via unauth +
  authed-as-musician — should refuse per cycle-3 sweep.
- Open-redirect: try `/login?next=https://evil.example.com` — does
  the app validate next-URL?

Dependency:
- `npm audit --json` on `sheet-music-app/package.json`. Cap HIGH+
  vulns in findings.

#### §6.C.2 — sec-mcp

Every MCP tool: auth checks, input validation, output schema correctness,
idempotency, error-message leak, malformed input handling, cross-user
resource IDs, prompt-injection in tool descriptions.

Approach:
- `mcp_tool_list` (or analogous discovery). Enumerate all tools.
- For each tool, send malformed input (wrong types, missing required
  fields, oversize strings, null bytes). Verify rich-envelope error
  shape per cycle-3 sweep.
- For each tool with a resource-id arg (setlistId, fileId, userId),
  try a cross-user reference — expect refusal.
- For each tool with `dryRun:true`, verify it returns full report
  without `force` per [[feedback_dryrun_is_observability]].
- Grep tool descriptions for prompt-injection vectors (e.g., "ignore
  previous instructions and ..." patterns). MCP server is authored
  internally so this is mostly a sanity check.

#### §6.C.3 — observability

Sentry/Datadog presence; error capture on live site; console errors
on prod; unhandled promise rejections; network errors.

Approach:
- Static: grep `src/` for `@sentry`, `@datadog`, `posthog`, `mixpanel`,
  etc. Identify the observability stack.
- Runtime: visit `https://centralreform.live/` + `/perform` + `/login`,
  capture `page.on('console')` + `page.on('pageerror')`. Are there
  unhandled errors on first load?
- Network: do failed requests get captured? Try blocking a request
  via Playwright `route.abort()` and observe error-handling UX.

#### §6.C.4 — seo

`<title>`, meta description, OG tags, Twitter card, robots.txt,
sitemap, canonical, structured data.

Approach:
- curl + grep on `/`, `/perform`, `/perform/setlist/<test-id>`, `/login`
  for title + meta-description + OG tags.
- robots.txt at root.
- sitemap.xml — cycle-2 OPS-002 shipped; verify content + format.
- JSON-LD structured data (likely none — INFO finding if absent for a
  publicly-discoverable surface).

#### §6.C.5 — legal

Privacy policy, terms, GDPR data-export / data-delete, accessibility
statement.

Approach:
- Visit `/` footer. Are Privacy / Terms / Accessibility links present?
  Do they lead anywhere?
- If absent, emit MED finding (legal exposure for a publicly-accessible
  app collecting auth + user data).
- GDPR: is there a `/api/account/export` or `/api/account/delete`?
  Test as a test-account-self (don't probe other users). META-NNN if
  absent.

#### §6.C.6 — email

Test-account signup email or password-reset email — subject, from
address, deliverability, link safety, branding, plain-text fallback.

Approach:
- Mint a test-account through MCP (`create_test_account`) — does signup
  trigger an email? META-NNN if no `verify_email_delivery` MCP and you
  can't tell.
- Test password-reset flow from `/login` "forgot password" link (if
  exists). What email does it send? Inspect via dev tools if your
  account is signed up.
- If no email infra at all, INFO finding.

#### §6.C.7 — cicd

`.github/workflows/*` review; build reproducibility; env var handling;
secrets in CI; branch protection if visible; source maps in prod;
cache headers; asset versioning.

Approach:
- Static: list `.github/workflows/*.yml`. Audit each for: secrets
  exposure, third-party action usage with pinned SHAs, branch
  protection mentions, deploy gates.
- Static: `cat sheet-music-app/vercel.json` (if exists) for cron + env
  config.
- Static: grep `process.env\.` usage — any unused vars? Any sensitive
  vars exposed to client (NEXT_PUBLIC_ prefix)?
- Runtime: source-map presence in prod (curl headers, look for
  `SourceMap:` or `.map` URLs).
- Runtime: asset cache headers (`Cache-Control` on hashed assets vs
  HTML).

#### §6.C.8 — codequality

TypeScript strictness; `any` usage; dead code; duplicate code;
dependency rot; build warnings; lint errors suppressed; TODO/FIXME
density; secrets in `git log -p` history; mixed lockfiles.

Approach:
- Static: `cat sheet-music-app/tsconfig.json` — strict mode? noImplicit*?
- Static: grep `: any\b` in src/. Density per kloc.
- Static: grep `@ts-ignore`, `@ts-expect-error`, `eslint-disable` —
  density + reasons.
- Static: grep `TODO|FIXME|XXX|HACK` in src/. Density.
- Static: `cat sheet-music-app/package.json` — outdated deps via
  `npm outdated --json`. Audit `dependencies` vs `devDependencies`
  placement.
- Static: check for accidentally-committed `.env*` files (`git ls-files
  | grep -E '\.env'`).
- Static: lockfile sanity — `package-lock.json` only, no stray
  `yarn.lock` / `pnpm-lock.yaml`.

#### §6.C.9 — scale

Largest realistic setlist (50+ tracks); longest realistic title;
biggest realistic chart upload. Does UI break? MCP break?

Approach:
- MCP: create `test-5D-scale-<ts>` setlist. Bulk-add 60 tracks
  (sample from `list_library`). Does `bulk_add_tracks` enforce the
  `too_many_tracks` (50) ceiling per cycle-4 fixture-residuals
  cluster 2? Try 51 → expect refusal.
- MCP: setlist with title of 500 chars. Does it store? Does it render
  in `/setlists` (visit as authed, via brief mintSession)?
- MCP: dryRun a chart upload with 50MB PDF (synthetic; don't actually
  upload — use `import_chart_from_drive({fileId: nonexistent, dryRun:true})`
  shape inspection instead).
- Scale-stress is BONUS; if §6.C.10 (domain-logic) is high-priority,
  spend budget there first.

#### §6.C.10 — domain-logic

Transposition correctness (enharmonic edge cases, capo math); musician
double-booking detection; key conflicts in setlist; chart-bind →
render correctness; monitor mix logic.

Approach (MOSTLY READ-ONLY static + light MCP):
- Static: read `src/lib/transposition*` (transposition logic). Verify
  enharmonic equivalence handling (C# vs Db both supported? Capo math
  consistent?).
- MCP: create `test-5D-trans-<ts>` setlist with 3 tracks each pinned
  to a different transposition; verify `update_track` accepts
  enharmonic-equivalent keys.
- Static: search for double-booking detection in `src/lib/scheduling*`
  / `src/app/api/scheduling/*`. Is there logic that refuses to assign
  the same musician to overlapping setlists at the same date/time?
- Static: `src/components/setlist/*` for key-conflict warnings.
- Static: `src/lib/monitor*` for mix logic (compressors, EQ, fader
  curves).

This axis is band-specific correctness; cycle-2-4 didn't probe it.
High-value findings live here. Spend ~15-20min minimum.

#### Domains SKIPPED or deferred (14):

- **auth, persistence, perf, reliability, ux, a11y, mobile, xbrowser,
  forms, nav, stress, mcp-coverage** — heavily covered by cycle-2-4 +
  fix wave. Other instances re-baseline these.
- **features** — Daniel's product domain is mature;
  [[feedback_no_cover_art]] explicitly rules out one common "gap." Don't
  generate a wishlist.
- **payments** — no payment flow exists. INFO finding: "no payment
  surface in app; out of scope."

---

### §6.I — Optional carry-forward probes (Mission H)

If wide-domain completes with budget remaining, sweep these:

**§6.I.1 — 24 orphan upload-* rows triage.**
Memory: 24 known orphan rows from cycle-3 reconcile-data.

```
list_library({collection:'all', limit:100, offset:0})
list_library({collection:'all', limit:100, offset:100})  // until exhausted
```

Filter results for `fileId` matching `upload-*` AND (`missing:true` OR
no Storage byte verification). Per-row:
```
salvage_chart_bytes({fileId, dryRun:true})
```

Report each row's salvageability verdict in
`artifacts/_orphan-triage.json`. **DO NOT issue live salvage writes** —
surface dryRun report only. Daniel triages from your report.

**§6.I.2 — `/v2/*` 404 surface verify.**
Per cycle-3 b3 working-as-intended ratification. Curl:
- `https://centralreform.live/v2/`
- `https://centralreform.live/v2/library`
- `https://centralreform.live/v2/random-junk-12345`

All should return clean 404 (not 5xx, no redirect loop, no error leak).

**§6.I.3 — `webVitalsObservations` retention sniff.**
Per cycle-3.5 P2-017 open follow-up (unbounded growth). Read a sample
via filesystem MCP if Firestore is exposed there, OR via admin MCP if
`dump_collection_size` or similar exists. Report doc count + size
estimate. Emit META-NNN if no introspection tool exists (Daniel-ops
queue carry-forward).

**§6.I.4 — SearchOverlay TabsList parity.**
Cycle-4 a11y-revisit known-issue. Static: read
`src/components/library/SearchOverlay.tsx`. Is the Tabs/TabsList/
TabsTrigger shape still present with no TabsContent siblings? If yes,
that's the same root cause as C4-004 (Tabs emit `aria-controls`
referencing panels that don't exist) — NEW finding (HIGH a11y per same
math as C4-004).

Optional runtime: mintSession briefly, visit `/manage/templates` (band_leader
or admin role), axe-walk. Confirm violations.

**§6.I.5 — `--secondary-foreground` AA empirical.**
Per cycle-4 a11y-revisit known-risk. Static: read `src/app/globals.css`
to find the light-mode `--secondary-foreground` value. Compute contrast
ratio against the surface background. If <4.5:1, runtime-probe surfaces
that consume the token + capture axe contrast finding.

---

### §6.E — META-NNN tooling-gap (first-class)

Per Daniel-ratified 2026-05-19T04:30Z. Likely Instance D META-NNN
candidates:
- "No `verify_email_delivery` MCP — can't probe email axis"
- "No `dump_collection_size` or analogous Firestore introspection MCP
  — can't audit webVitalsObservations retention without manual console"
- "No `npm_audit_summary` MCP — relied on shell `npm audit --json`"
- "No `inspect_csp_headers` MCP — used curl directly"

---

## §7 — Phases (Instance D)

- **P0 — Prereqs** (~10min)
- **P1 — Static audits (sec-web, codequality, cicd, seo, legal)**
  (~25-30min)
- **P2 — MCP read-only probes (sec-mcp, observability, domain-logic)**
  (~25-30min)
- **P3 — Light runtime probes (scale via MCP, email via account-mint,
  observability via console capture)** (~15-20min)
- **P4 — Optional carry-forward probes §6.I** (~15-20min if budget allows)
- **P5 — Cleanup + bearer-leak audit + HANDOFF** (~10min)

Total: ~90-115min. Self-converge if every §6.C axis has ≥1 finding
or INFO AND §6.I §6.I.1 + §6.I.2 done at minimum.

---

## §8 — Findings schema

Append to `cycle-5/instance-D/findings.jsonl`:

```json
{
  "id": "C5D-001",
  "axis": "sec-web|sec-mcp|observability|seo|legal|email|cicd|codequality|scale|domain-logic|orphan-triage|tooling-gap|...",
  "axis_subtype": "<xss|csrf|csp|dep-vuln|ts-strictness|...>",
  "severity": "critical|high|medium|low|info",
  "confidence": "confirmed|likely|suspected",
  "title": "<one-line>",
  "probe_mode": "static_audit|cli_command|mcp_http|browser_surface",
  "touch_lane": ["<file paths>"],
  "daniel_discussion_required": false,
  "repro": {...},
  "fix_direction": "...",
  "fix_options": [...],
  "impact": "...",
  "fix_effort": "trivial|small|medium|large",
  "blast_radius": "isolated|module|cross-cutting|architectural",
  "evidence_paths": ["artifacts/C5D-001/audit-output.txt"],
  "discovered_at": "<iso>",
  "phase": "P1|P2|P3|P4"
}
```

---

## §9 — Output target

```
sheet-music-app-mcp/outputs/autonomous-run/cycle-5/instance-D/
├── HANDOFF-TO-SUPERVISOR.md
├── findings.jsonl
├── convergence.log
├── cleanup-audit.json
└── artifacts/
    ├── _wide-domain-matrix.json   # 10 axes × finding count
    ├── _security-headers.json     # CSP / HSTS / cookie flag audit
    ├── _npm-audit.json
    ├── _orphan-triage.json        # 24 upload-* row report
    ├── _v2-404-surface.json
    ├── _webvitals-retention.json
    └── <FINDING_ID>/{...}
```

**HANDOFF-TO-SUPERVISOR.md** must include:
1. Run window.
2. Wide-domain matrix (10 axes × finding count + severity breakdown).
3. **Top 3 codequality / sec / domain-logic findings** with one-line
   summaries — Daniel reads this section first.
4. Orphan-triage report summary (how many of the 24 are salvageable,
   how many are confirmed lost).
5. `/v2/*` 404 verdict.
6. `daniel_discussion_required` list.
7. META-NNN summary (Daniel-ops queue inputs).
8. Coverage notes — anything skipped + why.
9. Reminder: rotate bearer + scrub prompt + cleanup confirmed.

---

## §10 — Standing rules (Instance D)

- Rich-error envelope wire shape canonical.
- F-05 dryRun-default per [[feedback_dryrun_is_observability]].
- Dedup threshold strict per [[feedback_dedup_force_override]].
- No bridge/** probing.
- Chart bytes public-from-in-app per [[feedback_chart_access_policy]].
- Setlist contents public-by-design per [[feedback_setlist_public_policy]].
- Vocal Lead terminology per [[feedback_terminology]].
- No cover art per [[feedback_no_cover_art]].
- Bearer never echoed.
- This prompt stays untracked with bearer intact.
- READ-ONLY by default; writes only in dryRun unless §6.C.9 scale-stress
  requires live (test-5D- prefix + isTest).
- Policy-ratified findings = INFO severity.
- Sandbox-survival: probe.mjs may need rebuild; Instance D's degraded
  fallback is "all probes as static_audit + cli_command."

---

## §11 — Go signal

Daniel pastes into fresh Claude Desktop session. First action:
1. ACK + start P0.
2. Verify §3.1 → §3.3.
3. Post §3.4 confirmation, proceed.

Daniel can walk away after §3.4; output lands at §9.

Go.
