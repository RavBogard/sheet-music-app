# Cycle-6 Instance A cowork — cycle-5-fixes regression validation (38 findings + Bongo Phase 1+2)

> **DO NOT COMMIT THIS FILE WITH BEARER INTACT.** Bearer is LIVE at §0.
> Stays untracked in git per the standing rule for cowork prompts.
>
> **Part of the cycle-6 4-way parallel split (last major cowork wave).** Siblings:
> - Instance B — fresh unauth audit + webVitals + Sentry pulls (cycle-6b-cowork-PROMPT.md)
> - Instance C — David's band_leader weekly flow + template MCP probe (cycle-6c-cowork-PROMPT.md)
> - Instance D — wide-domain fresh-eyes + DB state + dep drift + AI cost (cycle-6d-cowork-PROMPT.md)
>
> You are INSTANCE A. Stay in your lane. Your writes use `test-6A-`
> prefix; your output goes to `cycle-6/instance-A/`; your findings
> are `C6A-NNN`. Supervisor reconciles all four HANDOFFs after.

---

## §0 — Identity, bearer, output

**You are Instance A of the cycle-6 cowork sweep.** Single Claude
Desktop session, ~90-120min focused depth.

**DRIVER_BEARER (admin):**
```
crl_live_aae3cfdc57801e95b3e034765dbf4f36568403269597ad2a46317b64a09d3cf4
```
Treat as burned by end of run. Never echo in findings.jsonl, HARs,
screenshots, or convergence.log. Daniel rotates after.

**Production target:** `https://www.centralreform.live/` (use `www.`
explicitly — apex 307→www strips Authorization header; C5B-002
deferred Vercel domain config item).

**Output dir:** `sheet-music-app-mcp/outputs/autonomous-run/cycle-6/instance-A/`

**Test-data prefix:** `test-6A-` (every test user, setlist, chart you
create MUST start with this prefix; `isTest:true` on every setlist;
makes parallel-instance cleanup safe per `[[feedback_sandbox_test_isolation]]`).

**Findings ID prefix:** `C6A-NNN`.

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
| Trusted-leader rate-limit bypass | [[feedback_admin_rate_limit_bypass]] | admin + band_leader bypass MCP rate-limits + /manage/library-review + /manage/templates. Does NOT apply to /monitor (per ratified 2026-05-19 amendment). |
| F-05 dryRun is observability | [[feedback_dryrun_is_observability]] | dryRun:true returns full report without force. |
| Dedup threshold strict | [[feedback_dedup_force_override]] | 0.85 strict; force:true overrides per call. |
| MCP-first authoring | [[user_mcp_is_primary_author_workflow]] | Daniel authors via Claude+MCP, not in-app UI. |
| Bridge | CRIT-003 deferred | `bridge/**` DO-NOT-TOUCH. |

---

## §2 — Harness reality

### §2.1 — CFC + chrome.debugger does NOT work
Standard CFC build doesn't ship `chrome.debugger` permission. Don't try.

### §2.2 — Cycle-4 harness IS sandbox-survival-guaranteed (cycle-6 lesson)
Per `[[feedback_cowork_real_harness]]` addendum ratified 2026-05-19
post-Lane-6 ship `a42fd8a47`: harness scripts (`runAxe.mjs` +
`scripts/probe-batch.mjs` + `scripts/aggregate.py` +
`install-harness.sh`) ARE survival-guaranteed across cowork sandboxes
as of master. Use them directly. Prior "not guaranteed" claim is obsolete.

Discovery procedure (run in P0):
```bash
find . -name probe.mjs -path "*/cycle-4/harness/lib/*" 2>/dev/null
find . -name probe-batch.mjs 2>/dev/null
find . -name '@playwright' -type d 2>/dev/null | head -5
```

### §2.3 — Egress IP caveat
Playwright-in-sandbox = datacenter egress. Acknowledge in every CWV finding.

---

## §3 — Prerequisites handshake (BLOCK on missing items)

Block format:
```
🛑 INSTANCE A BLOCKED — prerequisite <NN>
Need: <one-line>
Why:  <what this unblocks>
Action: <concrete step Daniel takes>
Confirm "ready" once done.
```

Then `await user_input`.

### §3.1 — Filesystem MCP mount
`read_file` on `C:\Users\dsbog\centralreform.live\sheet-music-app\package.json`. GREEN if contents return; BLOCK if errors.

### §3.2 — centralreform.live MCP server
`list_library({limit:1})` via your DRIVER_BEARER. GREEN if row returns; BLOCK if errors.

### §3.3 — Harness located via discovery
Run §2.2 discovery. GREEN if probe.mjs found. DEGRADED-OK (proceed, emit META-NNN) if scripts/* empty. BLOCK only if probe.mjs nowhere.

### §3.4 — uidPrefix isolation sanity
`create_test_account({role:'musician', uidPrefix:'6A'})`. Confirm returned uid = `test-6A-musician-<8hex>`. Revoke immediately. GREEN if format correct; BLOCK on uid drift (C5B-META-003 regression).

### §3.5 — Confirmation before P1
Post:
> ✅ Instance A prerequisites green. HARNESS_HOME=<path>, master baseline=<sha>, uidPrefix isolation verified. Starting P1 cycle-5 regression close-out.

---

## §4 — Mission (regression-validate 38 shipped cycle-5 findings)

**Single load-bearing question:** does every shipped cycle-5 finding
actually close its user-visible repro? Auditor msg-006 + msg-007
confirmed code-shape; cowork confirms behavior.

Per-finding verdict ∈ {PASS, FAIL, PARTIAL, CONCERN}. **Any FAIL or
PARTIAL is BLOCKS-GREEN per criterion 1 of the green rubric.**

---

## §5 — Hard boundaries

- **NO mutations to real prod data.** `isTest:true` + `test-6A-` prefix on EVERY write.
- **NO probe of `bridge/**`** (CRIT-003).
- **Chart bytes + setlist contents public per §1** — don't flag.
- **Vocal Lead terminology per §1** — don't rename.
- **F-05 dryRun-default per §1.**
- **NO commit of this prompt with bearer intact.**
- **NO use of `force:true`** on dedupe/reconcile unless explicitly probing F-05 — and even then dryRun first.
- **Cleanup discipline:** `cleanup_all_test_data({prefix:'test-6A'})` on exit. `[[feedback_self_inclusion_test_fixtures]]` — confirm self-inclusion path doesn't strand admin caller.
- **Disjoint from B/C/D:** don't touch `test-6B-` / `test-6C-` / `test-6D-` data; don't read their output dirs.

---

## §6 — Coverage matrix (priority order)

### §6.A — The #1 priority: C5C-006 Lechu Goldman gig-packet
Import a Drive-shortcut chart, generate a setlist gig packet, confirm the shortcut-bonded track's PDF is MERGED (not appendix'd, not missing). Single most-impactful shipped fix. Verdict PASS/FAIL/PARTIAL with PDF evidence.

### §6.B — Security ships (BLOCKS-GREEN-shaped if FAIL)
- **C5D-001 TextScoreViewer XSS:** drive `/perform/setlist/<id>` with a text-score track containing `<script>alert(1)</script>` payload. Confirm escaping; no alert fires; payload renders as text.
- **C5D-003 CSP nonce:** curl `/perform` HEAD. Confirm `Content-Security-Policy` header has nonce + strict-dynamic + no unsafe-eval. Then load `/perform` in a browser, confirm no CSP-violation console errors.

### §6.C — a11y ships (axe-core via harness)
- **C5B-015 key-badge contrast:** axe-core run on a published setlist `/perform/setlist/<id>`. Key badges should pass AA contrast.
- **C5D-014 SearchOverlay segmented control:** keyboard nav on the library search filter — no Radix-Tabs `aria-controls` pointing at non-existent panels.
- **C5B-001 + C5C-003 + C5B-008 + C5B-009 login surface:** axe-core on `/login`. Confirm `<main id="main-content">` skip-link target, signin button enabled pre-JS, legal-nav present.

### §6.D — Vestigial 404 sweep (curl-based)
- **C5B-005 sitemap:** `curl https://www.centralreform.live/sitemap.xml | grep perform` — should appear.
- **C5B-004 + C5D-010 vestigial 404s:** `curl -sI` each of `/account`, `/manage/users`, `/v2/library`, `/v2/setlists` — all 404. `/v2` (bare) still redirects unauth.

### §6.E — MCP behavior ships
- **C5C-005 publish_setlist audience filter:** `publish_setlist({dryRun:true})` with a `test-6A-` audience-member + a real-musician; confirm only the real musician is in default-derived recipients. Test- users excluded.
- **C5C-014 list_service_personnel:** invoke against a known setlist; confirm shape `{matched_setlists, grouped_assignments, distinct_vocal_leads}`.
- **C5C-016 add_track_to_setlist full echo:** invoke; confirm `{ok, trackId, order, track:{...}}` shape.
- **C5D-013 dump_collection_size:** invoke admin-only against `library_index`; confirm `{docCount, estimatedBytes, oldestTimestamp, newestTimestamp}` shape.

### §6.F — UI ships
- **C5D-002 footer Privacy/Terms/Accessibility links:** load any authed page, find footer, confirm 4 links present + clickable + 200.

### §6.G — uidPrefix isolation (C5B-META-003)
- `create_test_account({role:'musician', uidPrefix:'6A'})` × 2 — uids start `test-6A-`. Mint a `test-6B-` doc via Firestore directly (or via separate bearer call to confirm sandbox boundary). `cleanup_all_test_data({prefix:'test-6A'})` — confirm only `test-6A-*` removed; `test-6B-*` survives.

### §6.H — /bongo: Phase 1 + Phase 2 install probe (NEW — cycle-6 only)
- **Phase 1 install:** `/bongo:resume boss` in a fresh Claude Code session cwd = `C:\Users\dsbog\centralreform.live\`. Confirm SUPERVISOR.md loads + pickup pointer is followed. Verdict PASS if session correctly identifies as supervisor.
- **Phase 2 portability:** `/bongo:resume boss --repo C:\Users\dsbog\centralreform.live` (explicit) AND `/bongo:resume boss` from cwd = repo subdir (walk-up). Both should resolve to the same `.coord/`. Graceful failure if invoked from `/tmp` (no `.coord/` reachable).
- **Phase 2 templates:** confirm `~/.claude/commands/bongo/templates/**` is present (post-supervisor re-sync 2026-05-19T18:15Z).

### §6.I — Tooling-gap surfacing (META-NNN — first-class)
Per Daniel-ratified 2026-05-19T04:30Z standing rule: when missing tooling blocks a probe, emit `META-NNN` at the moment of the wall — don't batch, don't silently skip.

Cap META-NNN at MED unless blocking a CRITICAL/HIGH probe.

---

## §7 — Phases (Instance A)

- **P0 — Prereqs + harness discovery** (~15-20min)
- **P1 — §6.A C5C-006 gig-packet** (~15min) — DO FIRST. The headline.
- **P2 — §6.B + §6.C security + a11y** (~25-30min)
- **P3 — §6.D + §6.E vestigial + MCP** (~20min)
- **P4 — §6.F + §6.G UI + uidPrefix** (~15min)
- **P5 — §6.H /bongo: install probe** (~10min)
- **P6 — Cleanup + bearer-leak audit + HANDOFF** (~10min)

Total: ~110-130min. Self-converge when every shipped finding has a verdict + uidPrefix sweep passed + /bongo: install confirmed.

---

## §8 — Findings schema

Append to `cycle-6/instance-A/findings.jsonl`:

```json
{
  "id": "C6A-001",
  "axis": "regression|a11y|perf|usability|sec-web|sec-mcp|tooling-gap|...",
  "axis_subtype": "<wcag|cwv|mcp-tool|...>",
  "regression_id": "C5C-006|C5D-001|...|null",
  "triage": "BLOCKS-GREEN|POLISH",
  "verdict": "PASS|FAIL|PARTIAL|CONCERN",
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
  "impact": "<who, how badly>",
  "fix_effort": "trivial|small|medium|large",
  "blast_radius": "isolated|module|cross-cutting|architectural",
  "evidence_paths": ["artifacts/C6A-001/screenshot.png"],
  "discovered_at": "<iso>",
  "phase": "P1|P2|..."
}
```

**Triage rule (cycle-6 standing):** every finding gets `triage` ∈ {BLOCKS-GREEN, POLISH}. Mutually exclusive, required. No UNTAGGED. Per PARENT §"Triage discipline." Any FAIL/PARTIAL against a shipped C5 finding is auto-BLOCKS-GREEN.

**Severity rubric:** critical = active vuln / data loss; high = reliable bug on core flow; medium = annoying bug off main flow; low = nit; info = policy-ratified observation.

---

## §9 — Output target

```
sheet-music-app-mcp/outputs/autonomous-run/cycle-6/instance-A/
├── HANDOFF-TO-SUPERVISOR.md
├── findings.jsonl
├── convergence.log
├── cleanup-audit.json
└── artifacts/
    ├── _gig-packet-validation.json    # The #1 priority (C5C-006)
    ├── _security-closeout.json        # C5D-001 + C5D-003
    ├── _a11y-closeout.json            # C5B-015 + C5D-014 + login
    ├── _mcp-closeout.json             # C5C-005 + C5C-014 + C5C-016 + C5D-013
    ├── _bongo-install-probe.json      # Phase 1 + Phase 2
    ├── axe/<surface>-<viewport>.json
    └── <FINDING_ID>/{screenshot.png, har.json, ...}
```

**HANDOFF-TO-SUPERVISOR.md** must lead with:
1. Run window (start → end ISO).
2. **#1 priority verdict at top:** "Did C5C-006 Lechu Goldman gig-packet shortcut-merge actually deliver?"
3. Cycle-5 regression close-out table (PASS/FAIL/PARTIAL/CONCERN per row × 38).
4. Per-finding BLOCKS-GREEN vs POLISH triage tally.
5. /bongo: install-probe verdict.
6. `daniel_discussion_required` list.
7. Reminder: rotate DRIVER_BEARER + scrub this prompt + cleanup confirmed.

---

## §10 — Standing rules

- Rich-error envelope wire shape canonical (cycle-3 sweep).
- F-05 dryRun-default per `[[feedback_dryrun_is_observability]]`.
- Trusted-leader bypass intentional per `[[feedback_admin_rate_limit_bypass]]` (NOTE: now excludes /monitor — gates on bus assignment, not rate-limit tier).
- No bridge/** probing.
- Chart bytes public-from-in-app per `[[feedback_chart_access_policy]]`.
- Setlist contents public-by-design per `[[feedback_setlist_public_policy]]`.
- Vocal Lead terminology per `[[feedback_terminology]]`.
- No cover art per `[[feedback_no_cover_art]]`.
- Bearer never echoed.
- This prompt stays untracked with bearer intact.
- **Sandbox-survival guaranteed** as of master per `[[feedback_cowork_real_harness]]` addendum. Use harness scripts directly.
- **uidPrefix discipline** per `[[feedback_sandbox_test_isolation]]` — `uidPrefix:'6A'` at mint + `prefix:'test-6A'` at cleanup. ALWAYS.
- **Binary verdict rule:** PASS/FAIL/PARTIAL/CONCERN. No deferred verdicts.
- **Triage rule:** every finding tagged BLOCKS-GREEN or POLISH at discovery time.
- **Auditor hallucination retro:** before claiming catastrophic findings ("history destroyed", "force-push damage"), check `git rev-parse --is-shallow-repository` first. Shallow-boundary artifacts are NOT evidence of damage.

---

## §11 — Go signal

Daniel pastes into a fresh Claude Desktop session. First action:
1. Acknowledge receipt + start P0 prerequisite handshake (§3).
2. Discover harness (§2.2 / §3.3).
3. Verify §3.1 → §3.4 in order; BLOCK on failures.
4. Post §3.5 confirmation, proceed.

Daniel can walk away after §3.5; output lands at §9.

Go.
