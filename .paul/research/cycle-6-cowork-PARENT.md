# Cycle-6 cowork — orchestration spec (parent)

**Status:** DRAFT — supervisor proposal, awaiting Daniel ratification
before instance prompts derive.
**Date:** 2026-05-19
**Anchor SHA:** master tip at dispatch time (current: `5c546920d`;
will advance if /bongo: Phase 2 lands first — instances `git fetch`
+ rebase against origin/master at boot)

---

## Shape

Mirror cycle-5: **4 parallel instances** (A/B/C/D), each in its own
Claude Desktop session, each with a distinct bearer. ~120-150min
parallel wall-clock.

| Instance | Mission | Est. time | Test-data prefix | Findings prefix | Output dir |
|---|---|---|---|---|---|
| **A** | Regression-validate 38 shipped cycle-5 findings via user-visible behavior | 90-120min | `test-6A-` | `C6A-NNN` | `sheet-music-app-mcp/outputs/autonomous-run/cycle-6/instance-A/` |
| **B** | Fresh unauth audit (verify lane 1 sec + lane 4 perf shipped at the edge) | 80-100min | `test-6B-` | `C6B-NNN` | `cycle-6/instance-B/` |
| **C** | David's band_leader weekly flow end-to-end (real-world rehearsal) | 110-140min | `test-6C-` | `C6C-NNN` | `cycle-6/instance-C/` |
| **D** | Wide-domain fresh-eyes + carry-forward probes + telemetry pulls | 90-115min | `test-6D-` | `C6D-NNN` | `cycle-6/instance-D/` |

---

## Green rubric (Daniel-ratified 2026-05-19)

The app is **"green across the board"** when ALL eight criteria hold.
Cowork verdicts checkmark against this rubric directly. Cycle-6-fixes
wave targets only criteria not yet green.

1. **Behavioral validation.** All 38 shipped C5 findings behaviorally
   re-verified via user-visible repro in Instance A. Per-finding
   verdict ∈ {PASS, FAIL, PARTIAL, CONCERN}. **Zero FAIL, zero
   PARTIAL** required for green.

2. **Zero new BLOCKS-GREEN findings outstanding** after cycle-6-fixes
   ships. BLOCKS-GREEN tag applied at C6{A-D}-NNN discovery time per
   the triage rubric below.

3. **Regression baseline holds:** emulator green (42+ files / 569+
   tests / 0 failures); unit no new failures vs documented baseline
   (~66 pre-existing); `next build --webpack` clean (modulo
   documented `.env.local` cron carry-forward); auditor's cross-lane
   regression sweep clean at master tip.

4. **Real-user telemetry healthy** (webVitalsObservations query,
   last 7-30d): LCP p75 < 2.5s on `/perform` + `/perform/setlist/<id>`
   + `/library`; CLS p75 < 0.1 on same routes; INP p75 < 200ms;
   error rate (Sentry / Firebase logs) zero unhandled in last 7d OR
   stable trailing baseline Daniel-ratified.

5. **AI cost documented + human-gated** (Daniel directive
   2026-05-19: "I have trouble imagining this tool used by like 10
   people at most generates that much usage. but give me a dollar
   report that is a human gate to continuing, and remembered as an
   up to date number"). Instance D pulls actual Gemini spend
   (last 7d + 30d) + per-import cost + per-setlist-publish cost.
   Daniel reviews the number at green-declaration time; PASS iff
   the number makes intuitive sense (no order-of-magnitude
   surprises). Snapshot persisted as
   `[[project_ai_cost_baseline]]` — future cycles compare
   delta-against-baseline (>2x drift surfaces as POLISH; >10x as
   BLOCKS-GREEN unless intentional).

6. **Database state clean:** orphan count stable or declining vs
   `[[project_orphan_baseline]]` 272; zero new orphan-creating bugs
   (delta-tracked); no exact-duplicate library_index rows beyond
   known acceptable.

7. **Dependency drift acceptable:** `npm audit` 0 critical + 0 high
   (Lane 1 closed 1C+24H → 0C+0H; maintain).

8. **Synthetic David-flow PASS via Instance C** (interim gate).
   Instance C completes the end-to-end weekly rehearsal flow via
   MCP only (no in-app UI per
   `[[user_mcp_is_primary_author_workflow]]`). Zero BLOCKS-GREEN
   friction surfaced. **Post-green validation: David's actual report
   ~1 week post-cycle-6-fixes-ship** (Daniel collects). David's
   report can downgrade green-status retroactively if he hits
   undiscovered BLOCKS-GREEN; treated as standing post-green hook.

POLISH backlog persists but does NOT gate green. POLISH items
captured + deferred-with-rationale; addressed in trailing
single-lane work post-green.

---

## Triage discipline — BLOCKS-GREEN vs POLISH (Daniel-ratified 2026-05-19)

Each C6{A-D}-NNN finding gets exactly one of two tags at discovery
time, written into the finding's JSONL record:

**`BLOCKS-GREEN`** — must close before declaring green. Applied when:
- Severity = CRITICAL or HIGH AND affects user-visible flow
- Any security / data-integrity / data-loss / silent-failure
  finding (regardless of severity)
- Any finding that invalidates one of the 8 green-rubric criteria
- Any FAIL or PARTIAL verdict against a shipped C5 finding (Instance
  A regressions)

**`POLISH`** — captured + tracked but NOT green-gating. Applied to:
- MEDIUM / LOW / INFO severity affecting non-critical surfaces
- Cosmetic-only issues (alignment, copy, color polish)
- Nice-to-have features not blocking the weekly flow
- Carry-forward findings already deferred per prior cycle
- META-NNN findings (tooling gaps — surface but don't block)

Tag is **mutually exclusive and required**. No `UNTAGGED`. Disputed
classifications surface to supervisor → Daniel.

---

## Cycle-6-fixes = last major wave commitment (Daniel-ratified 2026-05-19)

Cycle-6-fixes will be the **closure wave** for cycle-N parallel-fix
work. After it ships:

- Project enters **maintenance mode**.
- Only **single-lane trailing work** for explicit deferred items
  (POLISH backlog drain, deferred-Daniel-actions, etc.). No more 6+
  lane parallel waves unless a CRITICAL emerges.
- `/bongo:` project continues on its own track (Phase 2/3/4 lanes
  not bound by this commitment).
- New cowork passes are reserved for major-feature work or
  post-incident validation.

**Why:** stops the wave-after-wave loop. The BLOCKS-GREEN/POLISH
discipline above only means something if there's a finite end.
Forces ruthless triage in cycle-6 itself.

---

## Mission profiles

### Instance A — Cycle-5-fixes regression validation

**Goal:** confirm every one of the 38 shipped C5-findings actually
closes the user-visible repro. Auditor msg-006 + msg-007 confirmed
shape; cowork confirms behavior.

**Scope (key findings to drive):**
- **C5C-006 Lechu Goldman gig-packet:** import a Drive-shortcut chart,
  generate a setlist gig packet, confirm the shortcut-bonded track's
  PDF is MERGED (not appendix'd / not missing). Single most-impactful
  shipped fix.
- **C5D-001 TextScoreViewer XSS:** drive the chart-view path with a
  text-score containing `<script>` payload. Confirm escaping; no
  alert fires.
- **C5D-003 CSP nonce:** load `/perform` and inspect the
  Content-Security-Policy header (curl + browser). Confirm nonce +
  strict-dynamic + no unsafe-eval at the edge.
- **C5B-015 key-badge contrast:** axe-core run on a published
  setlist. Key badges should pass AA.
- **C5D-014 SearchOverlay segmented control:** verify keyboard nav
  works on the library search filter (no Radix-Tabs aria-controls
  vapor).
- **C5B-001 + C5C-003 + C5B-008 + C5B-009 (login surface):** axe-core
  on /login; confirm `<main id="main-content">` target, signin
  button is enabled pre-JS, legal-nav present.
- **C5B-005 sitemap:** curl `/sitemap.xml`, grep `perform` — appears.
- **C5B-004 + C5D-010 vestigial 404s:** curl `/account`, `/manage/users`,
  `/v2/library`, `/v2/setlists` — all 404. `/v2` (bare) still redirects
  unauth.
- **C5C-005 publish_setlist audience filter:** dryRun publish a setlist
  with a `test-` audience member + a real-musician; confirm only the
  real musician is in default-derived recipients.
- **C5C-014 list_service_personnel:** invoke the new MCP tool against
  a known setlist; confirm shape (matched setlists + grouped
  assignments + distinct vocal_leads).
- **C5C-016 add_track_to_setlist full echo:** invoke; confirm
  `{ok, trackId, order, track:{...}}` shape.
- **C5D-002 footer Privacy/Terms/Accessibility links:** load any
  authed page, find footer, confirm 4 links present.
- **C5B-META-003 test-token uidPrefix:** call `create_test_account`
  with `uidPrefix:"6A"`, confirm uid = `test-6A-<role>-<8hex>`. Call
  `cleanup_all_test_data({prefix:"6A"})`, confirm only `test-6A-*`
  users + Firestore docs are removed (NOT the test- accounts of
  instance B/C/D).
- **C5D-013 dump_collection_size:** invoke admin-only; confirm shape
  `{docCount, estimatedBytes, oldestTimestamp, newestTimestamp}`.
- **/bongo: Phase 1 install:** validate `/bongo:resume boss` in a
  fresh session cwd=centralreform.live/ loads SUPERVISOR.md.

**Out of scope:** Lane 4 PARTIAL bundle-diet (firebase eager-import
phase pending); C5B-002 apex domain (Daniel-action only); C5D-015
axe-empirical (NA without dedicated dark-theme axe-pass).

### Instance B — Fresh unauth audit (post-cycle-5-fixes edge state)

**Goal:** validate the unauth-website edge state after lane 1 (sec
hardening) + lane 4 (vestigial + sitemap + bundle-guard) + lane 3
(login a11y) shipped.

**Scope:**
- Cold-load `https://www.centralreform.live` unauthed. What do you
  see? Note the new redirect (apex still goes through Vercel; root
  proxy may redirect to /perform per UNAUTH-001).
- Walk every linked-from-/login surface. Privacy / Terms / SMS /
  Changelog / Accessibility — all 200, content present, sensible.
- Run axe-core on `/login`, `/privacy`, `/terms`, `/sms-consent`,
  `/changelog`, `/accessibility`. Report violations by severity.
- Measure unauth-login bundle size at the edge (use the
  Lighthouse-style probe — Daniel's 500KB target).
- Validate sitemap.xml + robots.txt are consistent and self-respecting
  (sitemap URLs match robots allow rules).
- Test apex (centralreform.live) vs www (www.centralreform.live)
  redirect chain. Document hops + final destination. (Daniel-action
  C5B-002 still open; document current state.)
- HTML/HTTP probe `/api/library/list` + `/api/drive/metadata` without
  auth; confirm 401 returns rich envelope (machine_code / code /
  message) per C5C-001 + C5C-002 ship.
- Lighthouse on `/login` and `/perform` (logged-out). Report LCP, FID,
  CLS, TTI.
- Mobile viewport sanity-check (responsive layout, touch targets per
  the U01 a11y test gap that's in OPEN-FOLLOWUPs).

### Instance C — David's band_leader weekly flow (synthetic; interim green gate per rubric criterion 8)

**Goal:** simulate David Lazaroff's end-to-end weekly rehearsal flow
via Claude Desktop + MCP. **This is the interim green gate** — David
himself can't shadow on this timeline (Daniel directive 2026-05-19);
his actual report will land ~1 week post-cycle-6-fixes-ship and may
retroactively downgrade green if he surfaces undiscovered
BLOCKS-GREEN. Instance C must complete the synthetic walk with zero
BLOCKS-GREEN friction to satisfy criterion 8 at green-declaration
time.

**Scope:**
- Authenticate as a `band_leader` test-account (via MCP
  `create_test_account({role:'band_leader', uidPrefix:'6C'})` +
  Web-SDK signInWithCustomToken on a fresh Playwright browser).
- **Template surface probe FIRST** (per Daniel directive 2026-05-19
  `[[feedback_mcp_template_management]]`): try to invoke
  `list_templates`, `get_template`, `create_template`, `edit_template`,
  `clone_setlist_from_template`. Report which exist + which are
  missing. The MCP surface should let David ask "what does Randy's
  typical Shabbat morning look like?" and get a structured
  template back, then clone+edit it for the upcoming service.
  **Any missing template MCP tool is BLOCKS-GREEN** (David's
  workflow gate per memory). Also exercise the in-app
  `/manage/templates` UI surface to confirm what's authorable today
  even if MCP doesn't expose it.
- Use **only MCP** (no in-app library UI per
  `[[user_mcp_is_primary_author_workflow]]`):
  1. **Clone last week's setlist** (or use `list_setlists` + create
     a new one from scratch via `create_setlist`, or
     `clone_setlist_from_template` if it exists).
  2. **Browse library** via `list_library({collection, limit, offset})`
     — confirm alphabetical, pagination, dedup-clean.
  3. **Import a new song** via `import_chart_from_drive` (dryRun
     first per C5C-008; then real). Confirm Drive shortcut + folder
     + Doc handling paths work.
  4. **Bind chart to track** via `bind_chart_to_track`.
  5. **Verify gig-packet** via `generate_gig_packet({setlistId})`.
     Confirm PDF merges (including any shortcut-bonded tracks).
  6. **List service personnel** via `list_service_personnel` —
     confirm rehearsal-relevant who's-playing-tonight info.
  7. **Assign musicians** via `assign_musician` + `suggest_band` for
     rabbi-aware coverage.
  8. **Publish setlist** via `publish_setlist({dryRun:true})` first
     — confirm audience derivation excludes test- users per C5C-005.
     Then real publish with explicit `recipients`.
- Open the published setlist in a `/perform/setlist/<id>` browser
  view (anon — should work per
  `[[feedback_setlist_public_policy]]`). Confirm Perform mode renders.
- Document any friction / "this should be easier" moments — David's
  fresh-user lens, NOT Daniel's expert lens.

### Instance D — Wide-domain fresh-eyes + carry-forward

**Goal:** fresh-eyes audit on anything cycle-5 cowork instances
A/B/C/D missed or that emerged post-ship. Plus carry-forward probes
on cycle-5's 36 unaddressed leftover findings.

**Scope:**
- Walk the auditor's OPEN-FOLLOWUPS list (12 items from msg-006 +
  msg-007); for each, confirm still-applicable or now-obsolete.
- Re-run cycle-5 cowork's 36 LOW/INFO findings against current
  master. Mark each as: STILL-APPLIES / RESOLVED-AS-SIDE-EFFECT /
  NO-LONGER-APPLIES.
- Free-form fresh-eyes audit on: error envelopes consistency (REG-001
  + REG-002 + REG-003 sweep should be done; verify any new untyped
  endpoints), MCP tool surface ergonomics, Perform-mode mobile UX,
  setlist-grid editing flow, library upload UX.
- Validate `/bongo:` Phase 1 in fresh sessions across multiple cwds
  (centralreform.live/ vs sheet-music-app/ vs ~/ vs an unrelated dir)
  — confirms which cwd works and how it fails (informs Phase 2
  scope).
- Probe the gig-packet path with EDGE-CASE charts: very long titles
  (>200 chars), Hebrew/RTL titles, special chars (apostrophes,
  parens), shortcut-of-shortcut, folder-as-fileId, expired Drive
  permission, deleted Drive file.
- Surface META-NNN findings for any tooling gaps encountered (e.g.,
  "couldn't repro because X" — first-class per the 2026-05-19T04:30Z
  cycle-5 §6.E ratification).

---

## Cross-instance data probes (Daniel-ratified 2026-05-19)

Three new data sources beyond synthetic probes. Each is assigned to
one instance so coverage doesn't fragment:

### webVitalsObservations real-user data + error monitoring → Instance B

- Query `webVitalsObservations` Firestore collection for last 7-30d
  (TTL now 90d per Lane 6). Aggregate LCP / CLS / INP p75 per route.
  Map to green-rubric criterion 4 thresholds.
- Pull Sentry or Firebase Functions error logs (whichever's wired)
  for unhandled exception count + top-N stack traces. Filter to
  last 7d. Map to criterion 4 error-rate threshold.
- Probe whether `/api/web-vitals/route.ts` is actually emitting
  records (any non-zero count last 24h confirms the pipeline; zero
  count is itself a finding).

### Database state + dependency drift → Instance D

- Use `dump_collection_size` (Lane 6 NEW MCP tool) against:
  `library_index`, `songs`, `setlists`, `users`, `mcpTestUsers`,
  `auditLogs`, `aiEnrichmentCache`, `aiEnrichmentRetryQueue`,
  `webVitalsObservations`. Report doc count + estimated bytes +
  oldest/newest timestamps.
- Cross-check `library_index` orphan count vs
  `[[project_orphan_baseline]]` = 272. Delta-track.
- Run `npm audit --production` against current master. Compare to
  Lane 1's post-ship baseline (0C+0H+2M+8L). Any new critical or
  high is a BLOCKS-GREEN.
- Pull `git log --shortstat --since="2026-05-15" -- src/` for
  files-touched heatmap; flag highest-churn files for fresh-eyes
  scrutiny.

### RTL/Hebrew + edge-case content + AI cost drift → Instance D

- Import a test chart with Hebrew transliterated title (e.g.,
  "L'chu N'ran'na"). Confirm rendering, font fallback, alphabetical
  sort placement, gig-packet PDF page rendering.
- Probe charts with very-long titles (>200 chars), Unicode special
  chars (apostrophes / em-dashes / parens), folder-as-fileId,
  shortcut-of-shortcut, deleted-Drive-file (expected 404 envelope
  per Lane 2 C5C-009).
- **AI cost drift:** query Google Cloud billing or
  `aiEnrichmentCache` collection for actual Gemini token usage
  last 7d. Report $/day and $/setlist-imported. Compare to budget
  ceiling (Daniel ratifies pre-dispatch; see Daniel-ops checklist).

---

## Shared §0 preamble (each instance gets a customized copy)

Each instance prompt's §0 includes:

- **Bearer:** placeholder `<INSERT INSTANCE-X BEARER>`. Daniel
  rotates 4 fresh bearers pre-paste (cycle-5 bearers are burned per
  Daniel-ops queue).
- **Anchor SHA:** master tip at dispatch time. Instances `git fetch
  origin && git rebase origin/master` at boot (no hard-coded SHA —
  prevents cycle-5's mid-run rebase chaos).
- **Output dir:** instance-specific path under `cycle-6/instance-{A,B,C,D}/`.
- **Test-data prefix:** `test-6{A,B,C,D}-` per
  `[[feedback_sandbox_test_isolation]]` (ratified 2026-05-19).
- **Findings prefix:** `C6{A,B,C,D}-NNN`.

---

## Lessons baked in (NEW since cycle-5)

Each instance prompt's §"Standing rules" section adds these
post-cycle-5 lessons:

1. **Auditor hallucination retro (2026-05-19).** Before claiming any
   catastrophic finding ("history destroyed", "force-push damage",
   "orphan commit"), FIRST run `git rev-parse --is-shallow-repository`
   + `git cat-file commit <suspect-sha>`. If `--is-shallow-repository`
   returns true, walker artifacts are NOT evidence of damage. Verify
   before escalating.
2. **Shallow-clone push caveat (2026-05-19).** If `git rebase
   origin/master` triggers a conflict storm via `.git/shallow`
   boundary, recover via `git reset --hard origin/master && git
   cherry-pick <SHA>`. Documented in `.coord/shared/master-tip.md`.
3. **SHIP-NOTICE protocol gap.** Lane 2 pushed `5c546920d` without
   filing a SHIP-NOTICE; filed it 30 min late. Standing rule for
   cowork (and any subsequent fix lanes): **post the SHIP-NOTICE
   atomically with the push**, not separately. Future `/bongo:ship`
   verb will mechanize this.
4. **Harness scripts ARE sandbox-survival-guaranteed** as of Lane 6
   ship `a42fd8a47` per ratified
   `[[feedback_cowork_real_harness]]` addendum. Use real Playwright
   probes via `cycle-4/harness/lib/runAxe.mjs` +
   `cycle-4/harness/scripts/probe-batch.mjs`. CFC+chrome.debugger
   still DOES NOT WORK.
5. **uidPrefix discipline** per
   `[[feedback_sandbox_test_isolation]]` (ratified 2026-05-19): each
   instance MUST pass `uidPrefix:"6{A,B,C,D}"` at
   `create_test_account` time + `prefix:"test-6{A,B,C,D}"` at
   `cleanup_all_test_data` time. Without this, instances clobber
   each other.
6. **Binary verdict rule** (auditor side, but cowork should mirror):
   findings posted with one of `PASS | FAIL | PARTIAL | CONCERN`
   classifications. No deferred verdicts. META-NNN findings (tooling
   gaps) remain first-class.

---

## Memory pointers to cite

Each instance reads these before starting:

- `[[user_mcp_is_primary_author_workflow]]` — MCP-first authoring
- `[[feedback_admin_rate_limit_bypass]]` — trusted-leader scope (now
  with /monitor exclusion per ratified amendment 2026-05-19)
- `[[feedback_cowork_real_harness]]` — harness reality (now with
  scripts-are-survival-guaranteed addendum)
- `[[feedback_sandbox_test_isolation]]` — NEW 2026-05-19
- `[[project_orphan_baseline]]` — NEW 2026-05-19 (272 orphans)
- `[[feedback_chart_access_policy]]` — public-by-design framing
- `[[feedback_setlist_public_policy]]` — setlist contents public
- `[[feedback_dryrun_is_observability]]` — F-05 standing rule
- `[[feedback_no_cover_art]]` — Logic-Pro density preserved

---

## Daniel-ops pre-dispatch checklist

Before pasting the 4 instance prompts:

1. **Rotate 4 fresh bearers.** Cycle-5 bearers are burned. Mint
   fresh `crl_live_*` tokens (one per instance) and surface them to
   supervisor for insertion into each instance prompt's §0.
2. **AI cost is REPORT-not-ceiling.** Daniel ratified 2026-05-19
   that AI cost is documented + human-reviewed at green-decl time
   (no pre-set dollar threshold). Instance D pulls + reports;
   Daniel gates green based on whether the number makes intuitive
   sense. First-cycle snapshot becomes `[[project_ai_cost_baseline]]`.
3. **/bongo: Phase 2 timing — WAIT.** Daniel ratified 2026-05-19:
   dispatch cycle-6 only after coder-7's Phase 2 ships + auditor
   ACCEPT. Cycle-6 Instance A will then probe both Phase 1 install
   AND Phase 2 path-generalization in one pass. ETA: Phase 2 ~2-3h
   from 17:34Z start = ~20:30Z UTC. Auditor verdict ~10min after
   ship. Net dispatch window: ~21:00Z UTC or whenever Daniel's
   ready post-ACCEPT.
4. **Confirm anchor SHA = current `origin/master`** at dispatch
   time (instances `git fetch` + rebase at boot; just for record).

---

## Post-dispatch supervisor reconciliation

After all 4 instances land HANDOFFs:

1. Triage 4 HANDOFFs into a single cycle-6-TRIAGE.md (cycle-5
   precedent at `.paul/research/cycle-5-fixes-TRIAGE.md`).
2. Scope a cycle-6-fixes wave (or fold high-severity findings into
   existing /bongo: workstream if appropriate).
3. Memory-update proposals to auditor for ratify.
4. New bearer rotation queue.
