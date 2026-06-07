# Cycle-5 Instance C cowork — David's band_leader weekly-flow E2E + Google Drive upload

> **DO NOT COMMIT THIS FILE WITH BEARER INTACT.** Bearer LIVE at §0.
>
> **Part of the cycle-5 4-way parallel split.** Siblings:
> - Instance A — close-out + Web-SDK + mobile (cycle-5a-cowork-PROMPT.md)
> - Instance B — fresh unauth-website (cycle-5b-cowork-PROMPT.md)
> - Instance D — wide-domain + optionals (cycle-5d-cowork-PROMPT.md)
>
> You are INSTANCE C. Stay in your lane (Missions F + G). Writes use
> `test-5C-` prefix; output `cycle-5/instance-C/`; findings `C5C-NNN`.

---

## §0 — Identity, bearer, output

**You are Instance C of the cycle-5 cowork sweep.** Single Claude
Desktop session, ~90-120min focused depth.

**DRIVER_BEARER (admin):**
```
crl_live_7d5de5b1f5996af7f4f718d986ae17f112bc457ed0bf83249a4aa35ad9e80226
```

**Daniel's Google account for Drive flows:** `daniel@centralreform.org`.
If Mission G hits permission walls on the source folder, BLOCK
requesting share-with-self.

**Production target:** `https://centralreform.live/`

**Output dir:** `sheet-music-app-mcp/outputs/autonomous-run/cycle-5/instance-C/`

**Test-data prefix:** `test-5C-`.

**Findings ID prefix:** `C5C-NNN`.

**Baseline master tip:** capture in convergence.log first line.

---

## §1 — Ratified policies primer

| Policy | Memory | Apply |
|---|---|---|
| Chart access | [[feedback_chart_access_policy]] | Chart bytes public from in-app context only. |
| Setlist contents public | [[feedback_setlist_public_policy]] | Setlist tracks/notes on `/perform/setlist/<id>` PUBLIC by design. |
| No cover art | [[feedback_no_cover_art]] | Max-density text rows only. |
| Vocal Lead | [[feedback_terminology]] | "Vocal Lead" not "Lead"/"Leader". |
| Trusted-leader rate-limit bypass | [[feedback_admin_rate_limit_bypass]] | admin + band_leader bypass MCP rate-limits. INTENTIONAL — this mission tests the David side of this. |
| F-05 dryRun observability | [[feedback_dryrun_is_observability]] | dryRun:true returns full report unconditionally. |
| Dedup threshold | [[feedback_dedup_force_override]] | 0.85 strict; force:true override per call. |
| Upload atomicity | [[feedback_upload_atomicity]] | processChartUpload: read-verify + compensating-delete + library_signals broadcast on every Storage/Firestore mutation. |
| Bridge | CRIT-003 | `bridge/**` DO-NOT-TOUCH. |
| MCP authoring is primary | [[user_mcp_is_primary_author_workflow]] | Daniel + David author via Claude Desktop + MCP, NOT the in-app library UI. Mission F walks David's actual motion. |

---

## §2 — Harness reality

### §2.1 — CFC + chrome.debugger unavailable
Don't try.

### §2.2 — Discover the cycle-4 harness
Only `cycle-4/harness/lib/probe.mjs` is repo-tracked. Discovery:
```bash
find . -name probe.mjs -path "*/cycle-4/harness/lib/*" 2>/dev/null
find . -name '@playwright' -type d 2>/dev/null | head -5
```
For Instance C, need `mintSession` + `runAxe` + multi-context for the
website-side David walks. Drive upload (Mission G) is MCP-only — no
browser needed for that section.

If probe.mjs anywhere → GREEN. DEGRADED-OK if scripts/* missing.
BLOCK if probe.mjs nowhere.

### §2.3 — Egress IP
Datacenter. Cite in CWV findings.

---

## §3 — Prerequisites handshake

```
🛑 INSTANCE C BLOCKED — prerequisite <NN>
Need: <one-line>
Why: <what this unblocks>
Action: <Daniel step>
Confirm "ready".
```

### §3.1 — Filesystem MCP
`read_file` on
`C:\Users\dsbog\centralreform.live\sheet-music-app\package.json`.

### §3.2 — MCP server
`list_library({limit:1})`. GREEN on row.

### §3.3 — Harness located
§2.2 discovery. GREEN/DEGRADED-OK/BLOCK per pattern.

### §3.4 — META-003 test-session sanity
Mint throwaway musician `test-5C-meta003-`. POST `/api/auth/test-session`,
confirm `customToken: string`. Revoke.

### §3.5 — Band_leader test bearer minted
Mint a band_leader test user `test-5C-david-`. Tag with role
`band_leader`. Verify the bearer accepts on `list_library` AND
`update_setlist`. Capture the test bearer as `BEARER_band_leader`.

### §3.6 — Drive source identified
ASK Daniel for the Drive folder ID containing test-suitable charts.
If he doesn't have one handy, BLOCK requesting:
> Need a Drive folder ID with 3-5 chart PDFs for the import_chart_from_drive
> probe. Folder must be shared with `daniel@centralreform.org` (your
> signed-in account) OR with the centralreform service account if
> that's how the MCP tool authenticates. If you don't know which, paste
> a folder ID and we'll find out.

Capture the folder ID as `DRIVE_TEST_FOLDER_ID`. List files via
`list_drive_files` MCP tool (if it exists) OR via direct Drive API
(if MCP exposed). Pick 3 test fileIds: `DRIVE_F1` (normal PDF),
`DRIVE_F2` (file with leading whitespace in name), `DRIVE_F3` (Drive
shortcut, not the file itself — to test C3-BUG-002 shortcut_unresolved
behavior).

### §3.7 — Confirmation before P1
Post:
> ✅ Instance C prereqs green. HARNESS_HOME=<path>, band_leader bearer
> `BEARER_band_leader=...` minted, Drive folder `DRIVE_TEST_FOLDER_ID=...`
> with 3 files identified, master baseline=<sha>. Starting P1 David's
> flow.

---

## §4 — Mission (2 prongs, both LOAD-BEARING)

**(F) David's band_leader weekly-flow E2E.** Walk David's actual weekly
authoring motion via MCP + website. Validate role-gated UI + MCP rate-
limit bypass + setlist clone/tweak/publish path + gig packet.

**(G) Google Drive upload flow.** Probe `import_chart_from_drive` MCP
tool end-to-end: dry-run + live import + dedup + edge cases.

---

## §5 — Hard boundaries

- **No mutations to real prod data.** `isTest:true` + `test-5C-` prefix.
- **No probe of `bridge/**`.**
- **All test setlists/charts/users start with `test-5C-`** for cleanup.
- **F-05 dryRun-default** — always dryRun first on write tools.
- **NO commit of this prompt with bearer intact.**
- **Cleanup discipline:** `cleanup_all_test_data` filtered to `test-5C-`
  prefix on exit. Also dedupe/orphan-sweep any Drive-imported test
  charts.
- **Don't hammer rate limits:** ~30 calls/sec ceiling even though
  band_leader bypasses limits (don't stress the prod API for sport).
- **Don't complete real Google OAuth** in website probes; cancel after
  init.
- **Disjoint from Instance A + B + D:** don't touch their test-data.

---

## §6 — Coverage matrix

### §6.G — David's band_leader weekly-flow E2E (Mission F)

**Step 1 — Discover last week's setlist.**
- MCP (band_leader bearer): `list_setlists({limit:10})`. Filter `isTest:false`
  in your reasoning (don't include other-instance test setlists). Pick
  the most recent published real setlist as the template.
- Probe: does `list_setlists` return setlists in a sensible order
  (most-recent first)? Is published vs draft distinguishable in the
  response shape?
- Website (band_leader signed-in via signInWithCustomToken): visit
  `/setlists`. Does the cloned-template setlist appear? Does the role
  gate show the right setlists?

**Step 2 — Clone the template.**
- MCP: `clone_setlist` is a deferred nice-to-have per memory; if it
  exists, use it; if not, use the documented bulk_add_tracks workaround.
  Create `test-5C-clone-<ts>` with `isTest:true` and the same tracks +
  vocal_lead assignments as the template.
- Probe: how many MCP round-trips to clone? Is the band_leader UX
  here painful? Emit a META-NNN if `clone_setlist` is genuinely missing
  and the workaround is multi-step.

**Step 3 — Tweak a few songs.**
- MCP: `update_track` on 2 tracks to change vocal_lead.
- MCP: `add_track_to_setlist` to add a new song from `list_library`.
- Probe: rich-envelope errors per cycle-3 sweep (try invalid trackId
  to verify). F-05 `dryRun:true` returns full report without `force`
  (cycle-4 supplement positive-confirm).

**Step 4 — Verify roster.**
- MCP: any roster MCP tools post-c1 (`list_roster`, etc.). What's
  discoverable for "who's playing this week"? Memory: roster/scheduling
  MCP visibility is a known gap. If `list_roster` doesn't exist OR
  doesn't expose week-level swap-ins, emit META-NNN.

**Step 5 — Publish to band (dryRun first).**
- MCP: `publish_setlist({setlistId, dryRun:true})`. Inspect the default-
  derived recipients. Does the recipient logic include admin + band_leaders
  + musicians on roster?
- MCP: `publish_setlist({setlistId})` LIVE. Tag recipients narrow
  (yourself + the test users only — explicit `recipients:[testuid1]`
  to keep email/SMS fanout minimal).
- Multi-context observer: open `/setlists` in admin + musician test
  contexts. Does the published setlist appear in their listings within
  seconds via Firebase listener?
- Email payload: if `verify_email_delivery` MCP exists, use it;
  otherwise META-NNN.

**Step 6 — Generate gig packet.**
- MCP: `generate_gig_packet({setlistId})`. Capture bytes; verify
  multi-page PDF with charts in setlist order.
- Probe: chart sequence matches setlist track order? Page headers
  include the setlist name? Cover-page included or not (memory says
  no cover art — but a setlist info page is distinct)?

**Step 7 — Drive upload handoff to §6.H.**

**Website-side parallel walks (after MCP authoring is done):**

| Surface as band_leader | What to probe |
|---|---|
| `/setlists` | Cloned setlist appears. Drift banner if Daniel mutates concurrently (skip if you don't want to coordinate). Role-gated affordances clear? |
| `/perform/setlist/<cloned-id>` | Vocal Lead displays per [[feedback_terminology]]. PDFs render in-context. Performance controls usable. |
| `/library` | Search affordances work? Alphabetical paging UX (cycle-3 c1 `list_library` paging)? |
| `/manage/library-review` | **Probe whether band_leader is granted access.** Memory says trusted-leader (admin + band_leader) bypasses rate limits. Does this surface gate on admin-only OR on trusted-leader? If band_leader is locked out but should be a trusted leader for review, that's a finding. |
| `/manage/templates` | Same — band_leader access expected per trusted-leader semantics? |
| `/monitor` | `useMonitorAccess` gate. Memory: band_leader is trusted. Verify David has monitor access. |

**MCP rate-limit confirmation (gentle):**
Issue 20 quick `list_library({limit:5})` calls in sequence with the
band_leader bearer. Expect no 429s per
[[feedback_admin_rate_limit_bypass]]. Don't exceed ~30/sec ceiling.
Emit PASS finding if no 429s.

**UX-as-band_leader probes:**
- Are role-specific affordances clear? Does David know what he can do
  that a musician can't?
- Trusted-leader silent bypass observable, or just "fast"?
- Onboarding hints for a fresh band_leader visiting `/` for the first
  time signed in?

### §6.H — Google Drive upload flow (Mission G)

**Step 1 — Dry-run import (DRIVE_F1).**
- MCP: `import_chart_from_drive({fileId: DRIVE_F1, dryRun: true})`.
- Expect full report per [[feedback_dryrun_is_observability]]:
  predicted title (post-normalize), dedup score, target storage path,
  AI enrichment plan.
- Verify NO write to library_index, NO Storage object created.

**Step 2 — Live import (DRIVE_F1).**
- MCP: `import_chart_from_drive({fileId: DRIVE_F1})`.
- Verify atomicity per [[feedback_upload_atomicity]]:
  - library_index row created with trimmed title (cycle-4 C4-007).
  - Storage object exists at expected path.
  - library_signals broadcast (if MCP exposes a read on the signal).
- Verify AI enrichment subscribes per a3-gemini-swap: post-import,
  watch for `aiEnrichmentRetryQueue` activity (filesystem MCP to read
  Firestore if exposed; else META-NNN).
- Verify if `aiConfig.autoApplyEnabled:false`, the chart lands in
  `/manage/library-review` queue (visit as band_leader; should be
  visible if role-gated for trusted-leader).

**Step 3 — Dedup verification (re-import DRIVE_F1).**
- MCP: `import_chart_from_drive({fileId: DRIVE_F1})` (same file).
- Expect dedup refusal per [[feedback_dedup_force_override]] (0.85
  strict; bare import refuses on exact duplicate).
- MCP: `import_chart_from_drive({fileId: DRIVE_F1, force: true})`.
- Expect accept (force override).
- DO NOT tune the threshold. Single call probes.

**Step 4 — Whitespace edge case (DRIVE_F2).**
- MCP: `import_chart_from_drive({fileId: DRIVE_F2})` (file with leading
  whitespace in name).
- Verify library_index row title is trimmed (cycle-4 C4-007 across all
  write boundaries including this MCP path).

**Step 5 — Shortcut edge case (DRIVE_F3).**
- MCP: `import_chart_from_drive({fileId: DRIVE_F3})` (Drive shortcut).
- Expect `shortcut_unresolved` chart-health flag per cycle-3 BUG-002.
- Verify error envelope rich shape (cycle-3 REG-002).

**Step 6 — Permission-denied edge case.**
- Use a fileId you DON'T have access to (fabricate or pick a private
  fileId outside DRIVE_TEST_FOLDER_ID).
- Expect rich-envelope error.

**Step 7 — Cleanup.**
- MCP: `dedupe_library({dryRun:true})`. Confirm no orphaned uploads
  beyond what you imported.
- Delete the live test imports via the appropriate cleanup MCP (or
  flag for §5 `cleanup_all_test_data` to sweep).

**Stop conditions:**
- Daniel doesn't have a Drive folder ready → BLOCK at §3.6, surface
  as completion blocker, proceed to Mission F only.
- Service-account auth fails → emit META-NNN, defer.
- Probe causes prod-data anomaly (you imported the wrong file) →
  STOP, ping Daniel, manually clean up before proceeding.

### §6.E — META-NNN tooling-gap (first-class)

Per Daniel-ratified 2026-05-19T04:30Z standing rule. Examples likely
for Instance C:
- "No `clone_setlist` MCP — band_leader weekly motion requires 3+
  round-trips via bulk_add_tracks workaround"
- "No `list_roster` / `get_weekly_assignments` MCP — can't audit
  Step 4 of David's flow"
- "No `verify_email_delivery` MCP — can't validate publish_setlist
  email payload"
- "No `inspect_aiEnrichmentRetryQueue` MCP — can't confirm post-import
  subscriber activity"
- "No `list_drive_files` MCP — had to ask Daniel for fileIds manually"
- "No `dump_aiConfig_history` — can't audit `autoApplyEnabled` toggle
  history for race conditions"

Schema same as §8. Cap MED unless blocking CRITICAL/HIGH probe.

---

## §7 — Phases (Instance C)

- **P0 — Prereqs + harness discovery + band_leader bearer + Drive
  folder ID** (~20-25min)
- **P1 — David's weekly flow MCP-side** (~30-40min) — §6.G steps 1-6
- **P2 — David's weekly flow website-side** (~25-30min) — surface walks
  as signed-in band_leader
- **P3 — Drive upload flow** (~20-30min) — §6.H steps 1-7
- **P4 — Cleanup + bearer-leak audit + HANDOFF** (~15min)

Total: ~110-140min. Self-converge if §6.G all 6 steps + parallel
website walks complete AND §6.H steps 1-7 ran (or explicit defer on
Drive permission block).

---

## §8 — Findings schema

Append to `cycle-5/instance-C/findings.jsonl`:

```json
{
  "id": "C5C-001",
  "axis": "regression|mcp-flow|drive-import|ux-band-leader|tooling-gap|usability|...",
  "axis_subtype": "<rate-limit-bypass|clone-flow|publish|enrichment|dedup|...>",
  "regression_id": "<id>|null",
  "verdict": "PASS|FAIL|INFO|null",
  "severity": "critical|high|medium|low|info",
  "confidence": "confirmed|likely|suspected",
  "title": "<one-line>",
  "probe_mode": "mcp_http|browser_surface|cli_command",
  "surface": "/setlists|/manage/library-review|null",
  "viewport": "desktop|iphone-se|null",
  "role": "band_leader|admin|musician|unauth",
  "touch_lane": ["<file paths>"],
  "daniel_discussion_required": false,
  "repro": {...},
  "fix_direction": "...",
  "fix_options": [...],
  "impact": "...",
  "fix_effort": "trivial|small|medium|large",
  "blast_radius": "isolated|module|cross-cutting|architectural",
  "evidence_paths": ["artifacts/C5C-001/mcp-response.json"],
  "discovered_at": "<iso>",
  "phase": "P1|P2|P3"
}
```

---

## §9 — Output target

```
sheet-music-app-mcp/outputs/autonomous-run/cycle-5/instance-C/
├── HANDOFF-TO-SUPERVISOR.md
├── findings.jsonl
├── convergence.log
├── cleanup-audit.json
└── artifacts/
    ├── _david-weekly-flow.json    # Step-by-step §6.G outcomes
    ├── _drive-upload-matrix.json  # §6.H steps 1-7 with verdicts
    ├── _band-leader-role-gates.json   # Which surfaces gate on band_leader
    ├── _rate-limit-bypass.json    # 20-call sequence result
    ├── <FINDING_ID>/{mcp-response.json, screenshot.png, ...}
```

**HANDOFF-TO-SUPERVISOR.md** must include:
1. Run window.
2. **David's weekly flow narrative** — does the motion actually work
   end-to-end from band_leader perspective? Where does it fall over?
   Where does it shine?
3. Drive upload matrix (steps 1-7 PASS/FAIL/DEFERRED).
4. Band_leader role-gating audit (which surfaces grant access; any
   gaps from trusted-leader semantics).
5. Rate-limit bypass positive-confirm result.
6. `daniel_discussion_required` list with recommendations.
7. META-NNN summary — what tooling gaps surfaced.
8. Coverage notes — anything skipped + why.
9. Reminder: rotate bearer + scrub prompt + cleanup confirmed.

---

## §10 — Standing rules (Instance C)

- Rich-error envelope wire shape canonical.
- F-05 dryRun-default per [[feedback_dryrun_is_observability]].
- Trusted-leader bypass intentional per [[feedback_admin_rate_limit_bypass]]
  (Mission F validates this).
- Dedup threshold strict per [[feedback_dedup_force_override]].
- Upload atomicity per [[feedback_upload_atomicity]].
- MCP-first authoring per [[user_mcp_is_primary_author_workflow]] —
  this is David's documented motion.
- No bridge/** probing.
- Chart bytes public-from-in-app per [[feedback_chart_access_policy]].
- Setlist contents public-by-design per [[feedback_setlist_public_policy]].
- Vocal Lead terminology per [[feedback_terminology]].
- No cover art per [[feedback_no_cover_art]].
- Bearer never echoed.
- This prompt stays untracked with bearer intact.
- Sandbox-survival per §2.2 (probe.mjs may need rebuild).
- CFC + chrome.debugger structurally unavailable.
- Egress IP = datacenter (cite CWV).
- Policy-ratified findings = INFO severity with memory cite.

---

## §11 — Go signal

Daniel pastes into a fresh Claude Desktop session. First action:
1. ACK + start P0.
2. Discover harness; mint band_leader bearer; identify Drive folder.
3. BLOCK on §3.6 if no Drive folder ID — Daniel pastes one.
4. Post §3.7 confirmation, proceed.

Daniel can walk away after §3.7 + Drive folder ID resolved.

Go.
