# Cycle-6 Instance C cowork — David's band_leader weekly flow + template MCP CRUD probe

> **DO NOT COMMIT THIS FILE WITH BEARER INTACT.** Bearer is LIVE at §0.
> Stays untracked in git per the standing rule for cowork prompts.
>
> **Part of the cycle-6 4-way parallel split (last major cowork wave).** Siblings:
> - Instance A — cycle-5 regression validation (cycle-6a-cowork-PROMPT.md)
> - Instance B — fresh unauth audit + telemetry pulls (cycle-6b-cowork-PROMPT.md)
> - Instance D — wide-domain fresh-eyes + DB + dep drift + AI cost (cycle-6d-cowork-PROMPT.md)
>
> You are INSTANCE C. Stay in your lane. Your writes use `test-6C-`
> prefix; your output goes to `cycle-6/instance-C/`; your findings
> are `C6C-NNN`. Supervisor reconciles all four HANDOFFs after.
>
> **YOU ARE THE INTERIM GREEN GATE.** Per green-rubric criterion 8: your
> synthetic David-flow walkthrough is the load-bearing interim
> validation. David himself shadows ~1 week post-cycle-6-fixes-ship.
> Any BLOCKS-GREEN friction you surface MUST close before green declared.

---

## §0 — Identity, bearer, output

**You are Instance C of the cycle-6 cowork sweep.** Single Claude
Desktop session, ~110-140min depth.

**DRIVER_BEARER (admin):**
```
crl_live_80f1c90ee92952e9349f18218598f435f000b78b91f95305e5767920614d7f73
```
Treat as burned by end of run. Never echo. Daniel rotates after.

**Production target:** `https://www.centralreform.live/` (use `www.`
explicitly).

**Output dir:** `sheet-music-app-mcp/outputs/autonomous-run/cycle-6/instance-C/`

**Test-data prefix:** `test-6C-`. Findings prefix: `C6C-NNN`.

**Baseline master tip:** capture `git log -1 --pretty=%H origin/master` as first line of `convergence.log` alongside `HARNESS_HOME=<path>`.

---

## §1 — Ratified policies primer (READ FIRST; non-negotiable)

| Policy | Memory cite | Summary |
|---|---|---|
| MCP-first authoring | [[user_mcp_is_primary_author_workflow]] | **LOAD-BEARING for you.** Daniel + David author via Claude+MCP, NOT in-app library UI. |
| Trusted-leader bypass | [[feedback_admin_rate_limit_bypass]] | admin + band_leader bypass MCP rate-limits + library-review + templates. NOT /monitor. This mission tests the David (band_leader) side. |
| Chart access | [[feedback_chart_access_policy]] | public-from-in-app intentional. |
| Setlist contents public | [[feedback_setlist_public_policy]] | public by design — Perform mode renders for any visitor. |
| Vocal Lead terminology | [[feedback_terminology]] | "Vocal Lead" not "Lead". |
| Shul cadence | [[project_shul_cadence]] | Friday evening + Shabbat morning, NOT Sunday. |
| MCP template management gap | [[feedback_mcp_template_management]] | **NEW 2026-05-19, Daniel directive.** Zero MCP tools for template CRUD as of master. Cycle-6 probes this gap. Any missing tool = BLOCKS-GREEN. |
| No cover art | [[feedback_no_cover_art]] | max-density rows only. |
| Bridge | CRIT-003 deferred | bridge/** DO-NOT-TOUCH. |

---

## §2 — Harness reality

### §2.1 — CFC + chrome.debugger does NOT work
### §2.2 — Harness IS sandbox-survival-guaranteed
Per `[[feedback_cowork_real_harness]]` addendum. Use scripts directly.
### §2.3 — Egress IP caveat
Datacenter egress; acknowledge in CWV findings.

---

## §3 — Prerequisites handshake (BLOCK on missing)

### §3.1 — Filesystem MCP mount
`read_file` on `package.json`. GREEN if returns.

### §3.2 — centralreform.live MCP server
`list_library({limit:1})`. GREEN if row returns.

### §3.3 — Harness located
Run §2.2 discovery. GREEN if probe.mjs present.

### §3.4 — band_leader test account
Mint a band_leader test user via:
```json
create_test_account({role:"band_leader", uidPrefix:"6C", label:"david-flow"})
```
Confirm response includes `{uid:"test-6C-band_leader-<8hex>", rawToken:"crl_live_..."}`. Capture `BEARER_band_leader` for §6 use. Tag the resulting user with role `band_leader` (verify in `users/{uid}` Firestore doc shape via `get_musician_profile` or equivalent). Verify the bearer accepts on `list_library` AND on `update_setlist` (band_leader gate works for the write surface). GREEN if both calls succeed.

### §3.5 — Confirmation before P1
Post:
> ✅ Instance C prerequisites green. HARNESS_HOME=<path>, master baseline=<sha>, BEARER_band_leader=<minted test-6C-band_leader bearer> minted + verified on list_library + update_setlist. Starting P1 template MCP probe.

---

## §4 — Mission (David's weekly flow, MCP-only)

Walk David Lazaroff's end-to-end weekly rehearsal flow via Claude
Desktop + MCP. This is the **interim green gate** per green-rubric
criterion 8.

**Mission A (P1) — Template MCP CRUD probe** (LOAD-BEARING per Daniel directive 2026-05-19): does the MCP surface let David ask "what does Randy's typical Shabbat morning look like?" and get a structured template back?

**Mission B (P2-P5) — Full weekly authoring flow**: clone last week → tweak songs → import new chart from Drive → bind to track → publish setlist. MCP only. No in-app library UI per `[[user_mcp_is_primary_author_workflow]]`.

---

## §5 — Hard boundaries

- **MCP only for authoring.** No in-app upload dialog / scraper modal. Browser only for verifying published surfaces.
- **NO mutations to real prod data.** `isTest:true` + `test-6C-` prefix on EVERY write.
- **NO probe of `bridge/**`** (CRIT-003).
- **NO commit of this prompt with bearer intact.**
- **Cleanup:** `cleanup_all_test_data({prefix:'test-6C'})` on exit. Per `[[feedback_sandbox_test_isolation]]`.
- **Disjoint from A/B/D:** don't touch their prefixes.

---

## §6 — Coverage matrix

### §6.A — Template MCP CRUD probe (LOAD-BEARING — Mission A)

**Per `[[feedback_mcp_template_management]]`:** zero MCP tools for template CRUD as of master. This probe documents the gap quantitatively.

For each of the following tool names, call via your DRIVER_BEARER:
- `list_templates`
- `get_template`
- `create_template`
- `update_template` (or `edit_template`)
- `delete_template`
- `clone_setlist_from_template`

For each: PASS = tool exists, returns sensible result. FAIL = tool not found / errors. **Any missing tool is BLOCKS-GREEN per Daniel directive.**

Also exercise the in-app `/manage/templates` UI surface (as band_leader test): is template authorability available via UI today? Document the asymmetry between MCP gap and UI presence.

For each missing MCP tool, emit a finding with:
- `triage: BLOCKS-GREEN`
- `axis: tooling-gap`
- `axis_subtype: missing-mcp-tool`
- `fix_direction: Add <tool_name> at src/lib/mcp/tools/templates.ts exposing <signature>`
- A reference template's JSON shape (from `/manage/templates` if visible) attached as evidence.

The cycle-6-fixes wave likely adds these tools. Your finding feeds the spec.

### §6.B — Clone last week's setlist (Mission B step 1)

Via MCP (no in-app UI):
1. `list_setlists({limit:10})`. Filter `isTest:false`. Find the most-recent past Shabbat-morning setlist (per `[[project_shul_cadence]]` — Saturday).
2. **If `clone_setlist` MCP tool exists:** invoke `clone_setlist({sourceId, newDate, isTest:true, titlePrefix:"test-6C-"})`. Document MCP round-trip count.
3. **If `clone_setlist` doesn't exist:** use `bulk_add_tracks` approximation — `create_setlist({date:<next Saturday>, isTest:true, title:"test-6C-clone-<ts>"})` + `get_setlist({setlistId:<source>})` → extract tracks → `bulk_add_tracks({setlistId:<new>, tracks:[...]})`. Document round-trip count and friction.
4. **Friction probe:** how many round-trips to clone? Is the David-UX painful? Any tweaks that would compress this to 1-tool-call? Emit METAs.

### §6.C — Library browse via MCP (Mission B step 2)

- `list_library({limit:50})`. Confirm alphabetical order, pagination shape.
- `list_library({collection:'main', limit:20, offset:20})`. Confirm `offset` works.
- `dedupe_library({dryRun:true})`. Confirm no exact-duplicate library_index rows (criterion 6 of green rubric).

### §6.D — Import new song via MCP (Mission B step 3)

Use a `test-6C-` tagged Drive fileId (Daniel can provide a test-folder ID; if not available, surface as META and skip):

1. `import_chart_from_drive({fileId:<test>, dryRun:true})` first per F-05 standing rule. Capture report.
2. Real import. Capture chart Id.
3. **Drive-shortcut handling (cycle-5 C5C-006 closure):** if the test fileId is a Drive shortcut, confirm import resolves the target.
4. **Drive-folder handling:** try importing a folder fileId. Expected: 4xx envelope per C5C-009.
5. **Deleted Drive file:** if you can deliberately delete a Drive file mid-test, retry import → expect 404 envelope.

### §6.E — Bind chart to track (Mission B step 4)

`bind_chart_to_track({trackId, chartId})` on a track in the cloned setlist. Confirm success.

### §6.F — Verify gig-packet via MCP (Mission B step 5)

`generate_gig_packet({setlistId})`. Download the resulting PDF (via Admin SDK or via the returned URL). Open the PDF, count pages. Confirm: every bound chart's PDF is MERGED into the packet (not appendix'd, not missing). **This re-validates the C5C-006 fix** in a fresh end-to-end context.

### §6.G — Roster + assignment (Mission B step 6-7)

- `list_service_personnel({setlistId})`. Confirm shape `{matched_setlists, grouped_assignments, distinct_vocal_leads}`.
- `assign_musician({setlistId, userId, role:'vocal_lead'})`. Confirm assignment lands.
- `list_musicians_on_date({date:<setlist date>})`. Confirm the just-assigned musician appears.
- `suggest_band({setlistId, includeRabbi:true})`. Document the response shape — rabbi-aware coverage?

### §6.H — Publish setlist (Mission B step 8)

1. `publish_setlist({setlistId, dryRun:true})`. Capture report. Confirm audience derivation EXCLUDES test- users per C5C-005.
2. `publish_setlist({setlistId, recipients:[<one test-6C- musician uid>], audience:"explicit", dryRun:false})`. Capture report.
3. **Friction probe:** the default-derived recipients are wide (admin + band_leaders + musicians on roster). Document whether this matches David's mental model. METAs for any friction.

### §6.I — Verify published setlist renders (anon)

Open `https://www.centralreform.live/perform/setlist/<id>` in an anonymous Playwright browser (no auth). Per `[[feedback_setlist_public_policy]]`, this should render. Confirm Perform-mode loads + tracks list + any chart links present. axe-core pass.

### §6.J — Multi-surface trusted-leader gate probe

Cross-surface band_leader access (per amended `[[feedback_admin_rate_limit_bypass]]`):
- `/manage/library-review` — band_leader signed in. Confirm access (review is trusted-leader-bypass).
- `/manage/templates` — band_leader signed in. Confirm access.
- `/monitor` — band_leader signed in. **Confirm gated separately** (gates on bus assignment, NOT trusted-leader). If unconditionally accessible to band_leader, that's a finding.

### §6.K — Tooling-gap surfacing (META-NNN — first-class)
For every MCP gap that blocked a probe, emit META-NNN at the wall.

---

## §7 — Phases (Instance C)

- **P0 — Prereqs + harness + band_leader bearer mint** (~15min)
- **P1 — §6.A template MCP CRUD probe (LOAD-BEARING)** (~25-30min) — DO FIRST. The green-gate criterion.
- **P2 — §6.B + §6.C clone + browse** (~20min)
- **P3 — §6.D + §6.E import + bind** (~20-25min)
- **P4 — §6.F + §6.G gig-packet + roster** (~15min)
- **P5 — §6.H + §6.I publish + verify-rendered** (~15min)
- **P6 — §6.J trusted-leader cross-surface** (~10min)
- **P7 — Cleanup + HANDOFF** (~10min)

Total: ~130-150min. Self-converge when full weekly flow walked end-to-end AND template MCP CRUD probe complete.

---

## §8 — Findings schema

Schema identical to Instance A — `id` prefix `C6C-`. Every finding tagged `triage: BLOCKS-GREEN | POLISH`.

**David-friction field** (NEW for Instance C):
```json
{
  "david_friction": "high|medium|low|none",
  "friction_lens": "<one-line — what would a fresh-user band_leader trip on>"
}
```
Use this on usability findings. David's lens, NOT Daniel's expert lens.

---

## §9 — Output target

```
sheet-music-app-mcp/outputs/autonomous-run/cycle-6/instance-C/
├── HANDOFF-TO-SUPERVISOR.md
├── findings.jsonl
├── convergence.log
├── cleanup-audit.json
└── artifacts/
    ├── _template-mcp-probe.json       # LOAD-BEARING (§6.A)
    ├── _weekly-flow-walkthrough.json  # §6.B–§6.H end-to-end
    ├── _gig-packet-pdf.pdf            # §6.F evidence
    ├── _trusted-leader-matrix.json    # §6.J
    ├── _round-trip-counts.json        # friction-probe data
    └── <FINDING_ID>/{screenshot.png, har.json, ...}
```

**HANDOFF-TO-SUPERVISOR.md** must lead with:
1. Run window.
2. **Green-rubric criterion 8 verdict at top:** "Did the synthetic David weekly flow walk end-to-end with zero BLOCKS-GREEN friction?" PASS/FAIL.
3. Template MCP CRUD gap report (which 6 tools exist, which are missing).
4. Round-trip counts per flow step (data for cycle-6-fixes UX scoping).
5. `daniel_discussion_required` list.
6. Notes for David's eventual ~1-week-post-ship report (what to ask him about).
7. Reminder: rotate DRIVER_BEARER + scrub bearer.

---

## §10 — Standing rules

- All standing rules from Instance A §10 apply.
- **MCP-first discipline:** no in-app library UI calls. Browser only for verifying published surfaces.
- **David's lens, not Daniel's:** flag friction David would hit (fresh band_leader, weekly rehearsal cadence) — not Daniel's expert moves.
- **Template gap = BLOCKS-GREEN:** per Daniel directive 2026-05-19.

---

## §11 — Go signal

Daniel pastes into fresh Claude Desktop session. First action:
1. Acknowledge + start §3 handshake.
2. Verify §3.1 → §3.4 in order; BLOCK on failures.
3. Post §3.5 confirmation, proceed.

Daniel can walk away after §3.5; output lands at §9.

Go.
