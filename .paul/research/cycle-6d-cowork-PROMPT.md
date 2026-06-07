# Cycle-6 Instance D cowork — wide-domain fresh-eyes + DB state + dependency drift + AI cost baseline

> **DO NOT COMMIT THIS FILE WITH BEARER INTACT.** Bearer is LIVE at §0.
> Stays untracked in git per the standing rule for cowork prompts.
>
> **Part of the cycle-6 4-way parallel split (last major cowork wave).** Siblings:
> - Instance A — cycle-5 regression validation (cycle-6a-cowork-PROMPT.md)
> - Instance B — fresh unauth audit + telemetry pulls (cycle-6b-cowork-PROMPT.md)
> - Instance C — David's band_leader weekly flow (cycle-6c-cowork-PROMPT.md)
>
> You are INSTANCE D. Stay in your lane. Your writes use `test-6D-`
> prefix; your output goes to `cycle-6/instance-D/`; your findings
> are `C6D-NNN`. Supervisor reconciles all four HANDOFFs after.

---

## §0 — Identity, bearer, output

**You are Instance D of the cycle-6 cowork sweep.** Single Claude
Desktop session, ~90-115min depth.

**DRIVER_BEARER (admin):**
```
crl_live_1c04efa579181fb653b3ded1dc54d9322f83a629c76acb46f908c291a14e86b8
```
Treat as burned by end of run. Never echo. Daniel rotates after.

**Production target:** `https://www.centralreform.live/` (use `www.`
explicitly).

**Output dir:** `sheet-music-app-mcp/outputs/autonomous-run/cycle-6/instance-D/`

**Test-data prefix:** `test-6D-`. Findings prefix: `C6D-NNN`.

**Baseline master tip:** capture `git log -1 --pretty=%H origin/master` as first line of `convergence.log` alongside `HARNESS_HOME=<path>`.

---

## §1 — Ratified policies primer (READ FIRST; non-negotiable)

| Policy | Memory cite | Summary |
|---|---|---|
| AI cost is REPORT-not-ceiling | (ratified 2026-05-19) | Daniel directive: "give me a dollar report that is a human gate to continuing." YOU produce the report. Daniel gates green. |
| Orphan baseline | [[project_orphan_baseline]] | 272 known orphans (NOT 24). Delta-track. |
| Chart access | [[feedback_chart_access_policy]] | public-from-in-app intentional. |
| Setlist contents public | [[feedback_setlist_public_policy]] | public by design. |
| Trusted-leader bypass | [[feedback_admin_rate_limit_bypass]] | admin + band_leader bypass MCP rate-limits. NOT /monitor. |
| Vocal Lead terminology | [[feedback_terminology]] | "Vocal Lead" not "Lead". |
| Dedup threshold strict | [[feedback_dedup_force_override]] | 0.85 strict; force:true overrides per call. |
| Bridge | CRIT-003 deferred | bridge/** DO-NOT-TOUCH. |

---

## §2 — Harness reality

### §2.1 — CFC + chrome.debugger does NOT work
### §2.2 — Harness IS sandbox-survival-guaranteed
Per `[[feedback_cowork_real_harness]]` addendum. Scripts directly usable.
### §2.3 — Egress IP caveat
Datacenter egress.

---

## §3 — Prerequisites handshake (BLOCK on missing)

### §3.1 — Filesystem MCP mount
`read_file` on `package.json`. GREEN if returns.

### §3.2 — centralreform.live MCP server
`list_library({limit:1})`. GREEN if row returns.

### §3.3 — Harness located
Run §2.2 discovery.

### §3.4 — Collection-size admin-access sanity
`dump_collection_size({collectionName:'library_index'})`. GREEN if returns shape `{docCount, estimatedBytes, oldestTimestamp, newestTimestamp}` (C5D-013 ship). BLOCK if collection-size tool errors — your DB state probe is blocked.

### §3.5 — Confirmation before P1
Post:
> ✅ Instance D prerequisites green. HARNESS_HOME=<path>, master baseline=<sha>, dump_collection_size verified. Starting P1 DB state probe.

---

## §4 — Mission

**Three prongs:**

**(A) DB state + dependency drift** (P1-P2) — uses Lane 6's new MCP tools to pull current data-layer state. Maps to green-rubric criteria 6 (DB clean) + 7 (deps acceptable).

**(B) AI cost baseline pull (LOAD-BEARING per Daniel directive)** (P3) — pull actual Gemini spend last 7d + 30d, $/import, $/publish. Snapshot becomes `[[project_ai_cost_baseline]]`. Daniel reviews at green-decl time.

**(C) Wide-domain fresh-eyes audit** (P4-P5) — auditor OPEN-FOLLOWUPs + cycle-5 LOW/INFO carry-forward + edge-case content (Hebrew/RTL + long titles + Drive failure modes).

---

## §5 — Hard boundaries

- **NO mutations to real prod data.** `isTest:true` + `test-6D-` prefix on EVERY write.
- **NO probe of `bridge/**`** (CRIT-003).
- **NO commit of this prompt with bearer intact.**
- **NO use of `force:true`** unless explicitly probing F-05 — dryRun first.
- **Cleanup:** `cleanup_all_test_data({prefix:'test-6D'})` on exit per `[[feedback_sandbox_test_isolation]]`.
- **Disjoint from A/B/C:** don't touch their prefixes.

---

## §6 — Coverage matrix

### §6.A — DB state: collection-size sweep

Use `dump_collection_size` against each:
- `library_index`
- `songs`
- `setlists`
- `users`
- `mcpTestUsers`
- `mcpTokens`
- `auditLogs`
- `aiEnrichmentCache`
- `aiEnrichmentRetryQueue`
- `webVitalsObservations`
- `monitor` (config doc — single-doc)
- `templates` (if exists — informs Instance C's template gap probe)

Report: `{collection, docCount, estimatedBytes, oldestTimestamp, newestTimestamp}` per row. Surface anomalies: zero-doc collections (broken pipeline?), >100MB collections (cleanup candidate?), oldest-timestamp wildly old (legacy bloat?).

### §6.B — Orphan delta vs baseline (criterion 6)

Cross-check `library_index` orphan count vs `[[project_orphan_baseline]]` = 272.

- Pull current orphan count (use Lane 6's tooling if available; otherwise admin Firestore query for `library_index` docs lacking referenced storage objects).
- Delta-track: if count > 272, that's drift (new orphan-creating bug — possible BLOCKS-GREEN). If ≤ 272, criterion 6 PASS-trending.
- Sample 5-10 orphan rows; look for common shape (timestamp pattern, source pattern). Inform cycle-6-fixes reconcile lane scoping.

### §6.C — Dedupe state (criterion 6 continued)

`dedupe_library({dryRun:true})` via your admin bearer. Capture report. Confirm zero exact-duplicate library_index rows beyond known acceptable (per `[[feedback_dedup_force_override]]` 0.85 strict threshold).

### §6.D — Dependency drift (criterion 7)

`cd sheet-music-app && npm audit --production --json > /tmp/audit.json`. Parse:
- Critical count
- High count
- Medium count
- Low count

Compare to Lane 1's post-ship baseline (0C+0H+2M+8L). **Any new critical or high is BLOCKS-GREEN.** New medium/low are POLISH.

Also: `npm outdated --json` (production deps only). Surface major-version drift on framework-level packages (next, react, firebase, zod, vitest). POLISH-tagged.

### §6.E — Recent-files churn heatmap

```bash
cd sheet-music-app && git log --shortstat --since="2026-05-15" -- src/ \
  | grep -E "^\s+\d+\s+files" | awk '{sum += $1} END {print sum}'
```

Then: top 20 most-churned files since 2026-05-15.
```bash
git log --name-only --since="2026-05-15" -- src/ | sort | uniq -c | sort -rn | head -20
```

For top-3 highest-churn files: brief fresh-eyes audit (open the file, scan for code smell, test coverage, doc drift). Surface as METAs (POLISH-tag).

### §6.F — AI cost baseline pull (LOAD-BEARING — Mission B)

Pull actual Gemini spend.

**Method 1 — Google Cloud billing console:** if MCP tool exposes billing, query last 7d + 30d totals on the `crc-music-charts` project's Gemini API line item. Per-day breakdown.

**Method 2 — `aiEnrichmentCache` collection:** count enrichment-cache writes last 7d + 30d via `dump_collection_size` + timestamp filtering. Cross-reference Gemini per-token pricing from public docs (gemini-1.5-flash or whichever is wired — check `getAiConfig`).

**Method 3 — `get_correction_stats` + per-import accounting:** if `import_chart_from_drive` records cost-per-call, sum over last N days.

Report:
- $/day average last 7d
- $/day average last 30d
- $/setlist-import
- $/setlist-publish (if Gemini touches publish path)
- Per-call cost variance (cap detection)

Snapshot is the seed for `[[project_ai_cost_baseline]]`. Daniel reviews at green-decl time. Per Daniel directive: "I have trouble imagining this tool used by like 10 people at most generates that much usage. but give me a dollar report that is a human gate to continuing." If your numbers shock — emit a finding.

### §6.G — RTL/Hebrew + edge-case content

- Import a chart titled `L'chu N'ran'na` (Hebrew transliterated apostrophes). Confirm: rendering, font fallback, alphabetical sort placement (`L'` should sort under `L`), gig-packet PDF page rendering doesn't mangle the title.
- Import charts with: >200-char title, Unicode em-dashes (`—`), parens (`(reprise)`), folder-as-fileId (expect 4xx), shortcut-of-shortcut (resolution path), deleted Drive file (expect 404 envelope per Lane 2 C5C-009).

### §6.H — Cycle-5 LOW/INFO carry-forward audit

Walk the auditor's OPEN-FOLLOWUPS list (12 items from msg-006 + msg-007). For each: STILL-APPLIES / RESOLVED-AS-SIDE-EFFECT / NO-LONGER-APPLIES.

Then walk cycle-5 cowork's 36 LOW/INFO findings (sources in `sheet-music-app-mcp/outputs/autonomous-run/cycle-5/instance-{A,B,C,D}/findings.jsonl`). Same classification.

### §6.I — Free-form fresh-eyes audit

Pick 3-5 surfaces and apply a fresh-user lens:
- Error envelopes consistency (REG-001 + REG-002 + REG-003 sweep should be done; verify any new untyped endpoints)
- MCP tool surface ergonomics — names, parameter shapes, error envelopes
- Perform-mode mobile UX
- Setlist-grid editing flow
- Library upload UX

POLISH-tag findings. BLOCKS-GREEN only for security/data-integrity/silent-failure.

### §6.J — Tooling-gap surfacing (META-NNN — first-class)
For any probe blocked by missing tooling, emit META-NNN at the wall.

---

## §7 — Phases (Instance D)

- **P0 — Prereqs + harness** (~10min)
- **P1 — §6.A + §6.B + §6.C DB state** (~25min)
- **P2 — §6.D + §6.E deps + churn** (~15min)
- **P3 — §6.F AI cost baseline (LOAD-BEARING)** (~20-25min)
- **P4 — §6.G RTL + edge cases** (~15-20min)
- **P5 — §6.H + §6.I carry-forward + fresh-eyes** (~15-20min)
- **P6 — Cleanup + HANDOFF** (~10min)

Total: ~110-130min. Self-converge when DB state + dep drift + AI cost baseline all reported AND carry-forward + edge-case findings logged.

---

## §8 — Findings schema

Schema identical to Instance A — `id` prefix `C6D-`. Every finding tagged `triage: BLOCKS-GREEN | POLISH`.

**Green-rubric mapping** for criteria 5, 6, 7:
```json
{
  "green_rubric_criterion": "5|6|7|null",
  "green_rubric_verdict": "PASS|FAIL|null"
}
```

---

## §9 — Output target

```
sheet-music-app-mcp/outputs/autonomous-run/cycle-6/instance-D/
├── HANDOFF-TO-SUPERVISOR.md
├── findings.jsonl
├── convergence.log
├── cleanup-audit.json
└── artifacts/
    ├── _ai-cost-baseline.json        # LOAD-BEARING (§6.F)
    ├── _db-state-sweep.json          # §6.A
    ├── _orphan-delta.json            # §6.B
    ├── _dedupe-state.json            # §6.C
    ├── _npm-audit.json               # §6.D
    ├── _churn-heatmap.json           # §6.E
    ├── _rtl-edge-cases.json          # §6.G
    ├── _carry-forward-audit.json     # §6.H
    └── <FINDING_ID>/{screenshot.png, har.json, ...}
```

**HANDOFF-TO-SUPERVISOR.md** must lead with:
1. Run window.
2. **AI cost baseline (criterion 5) — the load-bearing report:** $/day, $/setlist, intuitive-sense framing. Daniel reads this at green-decl.
3. DB state summary (criterion 6): orphan delta vs 272, dedupe state, collection sizes.
4. Dependency drift (criterion 7): npm audit counts vs Lane 1 baseline.
5. Carry-forward audit tally: STILL-APPLIES / RESOLVED / NO-LONGER.
6. Edge-case content matrix.
7. `daniel_discussion_required` list.
8. Reminder: rotate DRIVER_BEARER + scrub bearer.

---

## §10 — Standing rules

- All standing rules from Instance A §10 apply.
- **AI cost discipline:** report the dollar amount with method-of-derivation. If you can't compute precisely, give upper-bound + lower-bound + assumption. Daniel needs an intuitive-sense gate, not a fictional precise number.
- **Orphan delta discipline:** baseline is 272 (NOT 24). Sub-272 = improving. Above 272 = drift.
- **Cycle-6-fixes is last major wave:** factor this into POLISH/BLOCKS-GREEN triage. POLISH after cycle-6-fixes = trailing single-lane work, not another wave. Don't tag aggressively as BLOCKS-GREEN if the issue would survive in maintenance-mode trailing work.

---

## §11 — Go signal

Daniel pastes into fresh Claude Desktop session. First action:
1. Acknowledge + start §3 handshake.
2. Verify §3.1 → §3.4 in order; BLOCK on failures.
3. Post §3.5 confirmation, proceed.

Daniel can walk away after §3.5; output lands at §9.

Go.
