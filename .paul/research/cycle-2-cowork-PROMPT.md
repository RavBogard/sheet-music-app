# Cycle-2 Cowork Audit Prompt — centralreform.live

> ⚠️ **DO NOT COMMIT THIS FILE TO GIT.** Contains a live admin bearer
> (§0). After the cowork run, either revoke the bearer (admin MCP)
> and/or scrub the token from the file before any commit.

**Run date:** to be filled in by Daniel at paste time
**Target product:** `https://www.centralreform.live` (Reform Jewish synagogue music app)
**Expected runtime:** 6–8 hours autonomous
**Output target:** machine-structured artifacts for supervisor (a separate Claude Code session) — Daniel does NOT read your output

---

## 0. Who you are and who you're writing for

You are the **cycle-2 cowork session**. You run autonomously for 6–8
hours. Your job is an exhaustive multi-axis audit of the entire
product. Your output is consumed by a **supervisor agent** (a separate
long-running Claude Code session that lives in
`.coord/SUPERVISOR.md` of the source repo) who will read your output,
group findings by file-lane + parallelizability, and dispatch up to
**5 concurrent Claude Code agents** to ship the fixes.

**Critical:** your output is for the supervisor agent, NOT for Daniel.
Optimize for machine parsing and dispatch decisions. Verbosity is
fine; consistency of structure is everything. No narrative prose,
no executive summary, no "headline findings" section. Just the data.

Admin bearer for HTTP-level probes (raw `fetch`-style calls outside
the MCP client). Treat it as a long-lived secret — NEVER write it to
files in your output dir, NEVER include it in `findings.jsonl`, NEVER
echo it in console logs / HARs (scrub Authorization headers before
saving HARs). If your environment already has the
centralreform.live MCP server configured (Claude Desktop's standard
Daniel-admin context), you will use the MCP client for MCP-protocol
calls and this bearer only for raw HTTP probes (e.g. the F-021
regression test that hits `/api/drive/file/*` directly with various
auth headers, or HTTP-level error-envelope verification).

```
DRIVER_BEARER: crl_live_e0300a118d22f7f293df552883ee21a73223d4d2b20ca4e29b60ca48d05960a6
```

---

## 1. Product context (you have no memory; this is what you need to know)

**centralreform.live** is the music app for Central Reform Congregation
(CRC), a Reform Jewish synagogue. Used by the rabbi (Daniel Bogard,
the primary author + product owner + developer), 2nd band leader
(David Lazaroff), the worship band, and the congregation.

**Service cadence:** Friday evening + Shabbat morning. NOT Sunday.
Setlists are authored weekly and 90% similar to the prior week
(clone + tweak).

**Key roles** in the system:
- `admin` — Daniel, full access.
- `band_leader` — Daniel + David Lazaroff; trusted leader gating.
- `musician` — band members; perform-mode access, limited edit.
- `member` — congregants; read access where exposed.

**Daniel's primary authoring flow is MCP-first** (via Claude Desktop).
The browser app is the **band/consumer surface only** — Perform mode
on iPads, chart-bind picker, gig-packet print, library browse.

**Standing project rules you MUST know** (memory carry-over, all
load-bearing):

1. **MCP validation surfacing.** When an MCP tool fails input
   validation, it surfaces as `{result: {isError: true, content: [...]}}`
   on the JSON-RPC response — NEVER as JSON-RPC `error.code: -32602`.
   If you see a `-32602` on a validation failure, that's a real bug.

2. **`dryRun: true` is observability, not preview.** Any MCP tool
   that takes a `dryRun: true` arg returns the full plan (counts,
   target rows, projected outcomes) WITHOUT requiring `force: true`.
   Refuse-gates fire only on real writes. If a tool refuses
   dry-run-mode without `force`, that's a real bug.

3. **Chart-access policy is intentionally public.** Chart bytes are
   accessible to anyone with a `fileId` by design — Daniel's call.
   Do NOT flag "chart accessible to unauth user" as a security
   finding. Do NOT suggest tightening drive/file auth.

4. **No cover art for songs or setlists.** UI is max-density text
   rows (Logic Pro track-list style). If you find image-based
   song/setlist art in the UI, that's a regression.

5. **Terminology:** "Vocal Lead" for the singer assignment, NOT "Lead"
   or "Leader." Rabbi-led services use a separate "Led by" field.

6. **Trusted-leader rate-limit bypass.** `admin` and `band_leader`
   roles get rate-limit bypass on MCP writes (per
   `feedback_admin_rate_limit_bypass` rule). Don't probe rate limits
   from trusted-leader tokens — you'll hit nothing.

7. **`bridge/**` is do-not-touch.** There may be `/api/bridge/*`
   endpoints; do not probe them.

8. **`cleanup_all_test_data` self-revokes the caller** if the caller
   itself is a test bearer. Plan your cleanup phase accordingly —
   don't call it from a test bearer expecting to do more work after.

9. **Master is production.** `https://www.centralreform.live` is the
   master deploy. No staging environment.

---

## 2. Tools at your disposal

You have:

- **MCP** at `https://www.centralreform.live/api/mcp` — authenticate
  with the `DRIVER_BEARER` above as `Authorization: Bearer <token>`.
  Call `tools/list` first to enumerate the available tools (don't
  assume what exists; the surface is changing). Currently ~24–30
  tools across setlist read/write, library, publish, monitor,
  test-tokens.
- **Browser/Playwright** against `https://www.centralreform.live`.
  Full headless browser, with HAR capture, console-log capture,
  screenshot capability. **Browser-side auth constraint:** there is
  no programmatic browser sign-in flow you can use without
  interactive approval (the `/api/auth/qr/route.ts` QR-token flow
  requires a human admin to approve a QR scan; `/api/mcp/oauth/mint-test-token`
  produces MCP bearers, not Firebase session cookies). Therefore:
  - **Browser-side probes are UNAUTH ROUTES + public surfaces only.**
    Crawl from `/`, exercise public pages, Perform-mode (`/perform/*`)
    public surfaces, login pages (without submitting credentials),
    legal/marketing pages, etc.
  - **Authed-route behavior is probed on the MCP side** (as test
    users you mint).
  - **Emit a `feature_gap` finding** noting the absence of a
    programmatic browser-test auth surface. (Useful in its own right
    — would unblock future cycle-N audits.)
  - If during route crawl you DO discover a programmatic sign-in
    flow we don't know about (custom-token exchange, magic-link
    bypass, etc.), USE it and emit a finding noting the discovery.
- **File write** to an output directory:
  `sheet-music-app-mcp/outputs/autonomous-run/cycle-2/`.
  - Primary output: `findings.jsonl` (one finding per line)
  - Artifacts: `artifacts/<finding_id>/` (screenshots, HARs,
    MCP transcripts, console logs)
  - Cleanup audit: `cleanup-audit.json` (your final cleanup pass)
  - Convergence log: `convergence.log` (your phase checkpoints)
- **Test-identity provisioning:** `create_test_account`,
  `list_test_accounts`, `revoke_test_account`, `cleanup_all_test_data`
  — use these to spin synthetic users at admin / band_leader /
  musician / member roles.

You do **NOT** have:
- Source code access. This is a black-box audit. You probe the
  deployed product via MCP + browser. You do NOT read repo files.
- Network access outside `centralreform.live` (and its
  `*.firebaseapp.com` / `*.googleapis.com` dependencies that the
  app legitimately needs).

---

## 3. Hard boundaries (NEVER cross)

1. **No mutation of real production data.** All write operations
   (create, update, delete, publish) MUST target test resources
   only — test users (`create_test_account`) and test-namespaced
   setlists you create yourself. Never edit a real published setlist,
   never `update_track` on a real chart bond, never `revoke_user`
   on a real user, never `publish_setlist` to real recipient lists.
2. **No real-recipient notifications.** `publish_setlist` sends
   in-app + push + email + SMS to recipients. ONLY ever invoke
   `publish_setlist` with a `recipients` list containing test users
   you created. Never use the default-derived-recipient path.
3. **Cleanup is mandatory.** Before exiting, run `cleanup_all_test_data`
   from an admin context (not from a test bearer). Verify zero
   residue in `mcpTestUsers`. Write the cleanup-audit JSON to your
   output dir.
4. **No probing of `bridge/**`.** If you discover `/api/bridge/*`
   endpoints, do not call them. Note their existence as a NOTE-level
   finding only.
5. **Chart-access policy public is by design** — see standing rule
   #3. Do not flag.
6. **No DoS-style stress.** "Long-running" means thorough probing,
   not flood. Use sensible call rates. If you hit rate limits with
   a non-trusted-leader token, that's data (a finding may be that
   the limits are too tight); don't try to evade.
7. **Don't try to escape the sandbox.** No filesystem reads outside
   your output dir. No attempts to read environment variables or
   credentials.

---

## 4. Coverage axes (every finding tagged with one)

You probe and tag findings against these 10 axes:

| axis | meaning |
|---|---|
| `bug` | Behavior diverges from documented or self-evident expectation. |
| `feature_gap` | Feature users would benefit from is absent (not a bug — a missing capability). |
| `security` | Authn/authz/data-exposure/input-validation/rate-limit issue. (Note: chart-access public is intentional.) |
| `usability` | Friction, confusing flow, error-message clarity, unrecoverable state. |
| `ui_ux` | Visual consistency, accessibility, perf budget, dark-first OKLCH palette adherence, mobile/iPad form-factor breakage. |
| `mcp_gap` | Browser-exposed mutation has no MCP equivalent, OR MCP tool has awkward shape/missing context. Daniel's MCP-first authoring workflow makes completeness load-bearing. |
| `performance` | Slow path, large payload, expensive Firestore query, JS bundle size, Core Web Vitals regression. |
| `data_quality` | `library_index` state issues — orphans, duplicates, mime drift, stale snapshot, etc. |
| `ops` | Deploy/infra/monitoring/observability gap. |
| `regression` | Cycle-1 fix didn't actually close the underlying issue, or new code broke prior behavior. |

---

## 5. Probe modes (every finding tagged with one)

You probe in five modes; tag each finding with which mode discovered it:

1. **`mcp_surface`** — straight MCP API audit. Call `tools/list`,
   probe every tool with valid + boundary + adversarial inputs,
   verify response shape, validation surfacing, error envelope
   richness (`{ok: false, error: machine_code, message, ...context,
   hint}` per the cycle-1 F-015+F-018 standardization), idempotency,
   `dryRun` semantics, role-based access.

2. **`browser_surface`** — straight browser/Playwright audit. Crawl
   the route tree from `/` recursively. For each route: load, screenshot,
   capture HAR + console, click interactive elements, test forms.
   Mobile + iPad viewport variants (band uses iPads in Perform mode).
   Accessibility audit (keyboard nav, ARIA, contrast). Auth-gated
   routes tested both authed and unauthed.

3. **`mutation_parity`** — for every mutation you discover (either
   side), execute it from BOTH MCP and browser, verify identical
   end-state via independent reads. Examples (illustrative, NOT
   exhaustive — DISCOVER the mutation surface, don't work from a
   fixed list): create setlist, clone setlist, add/remove/reorder
   tracks, edit track fields, bond/unbond charts, publish + republish
   + unpublish, import chart from Drive, upload chart, dedupe
   library, mint/revoke test tokens, update template/preset, change
   monitor mix, manage user roles. Any browser-exposed mutation
   without an MCP equivalent = `mcp_gap` HIGH finding. Any parity
   divergence (different end-state for the same logical operation)
   = HIGH finding regardless of axis.

4. **`regression`** — verify each cycle-1 fix actually closed its
   finding. List below.

5. **`next_cycle_input`** — verify each carried-over input from
   cycle-1's SUPERVISOR.md "Next-cycle inputs" section. List below.

---

## 6. Discovery mandate (probe modes 1+2+3)

You are explicitly NOT working from a fixed list of tools or routes.
Your surface enumeration is part of the audit:

- **MCP enumeration:** call `tools/list` first. For each tool,
  inspect the input schema, derive valid/boundary/adversarial test
  cases. Find tools whose names suggest features that should exist
  symmetrically (e.g. if `create_setlist` exists, does `clone_setlist`?
  Does `delete_setlist`?). For each absent-but-implied tool, that's
  an `mcp_gap` finding.
- **Browser route enumeration:** start from `/` and crawl. Note:
  `/v2/*` is a parallel UI redesign in active development — probe
  separately and tag findings with `route_namespace: 'v1' | 'v2' | 'shared'`.
  Note: `/monitor` is the personal-IEM mixing system (WebSocket
  driven). Note: `/perform/*` is the iPad-targeted band view.
- **Mutation cross-reference:** maintain a running internal table:
  `{operation, mcp_tool?, browser_path?, parity_verified?}`. Emit
  one finding per row where either column is empty or `parity_verified
  = false`.

---

## 7. Cycle-1 regression probes (mandatory)

Verify EACH of these against the deployed product. If the verification
fails, emit a `regression` finding with `severity: HIGH` and
`blocks: []` (it doesn't block anything but it's a real defect that
needs urgent fix). Reference SHAs are master commits at the time the
fix shipped.

| cycle-1 ID | what cycle-1 claimed to fix | what you must verify in cycle-2 |
|---|---|---|
| F-022 (`2002d9fdf`) | legal/marketing pages public | `/privacy`, `/terms`, `/sms-consent`, `/changelog` return 200 unauthed; `/setlists`, `/library`, `/manage` still 307→/login unauthed |
| F-023 (`1024d7389`) | live setlist heading update via onSnapshot, ≤6s | Playwright: rename a test setlist via MCP, assert editor + perform-view headings update within 6s. Repeat 3x for variance. |
| F-007 + F-024 (`3fadb63a4`) | search_library default-hide non-chart mimes | `search_library({query: ""})` returns 0 audio / .xlsx / .DS_Store / folder rows by default; `includeNonCharts: true` opt-in surfaces them. |
| F-021 (`5fe653ee6`) | `/api/drive/file/{bogus}` returns 404 not 401 | `GET /api/drive/file/notarealid` unauthed = 404; `GET /api/drive/file/<real-id>` unauthed without Sec-Fetch-* = 401; `GET /api/drive/file/<real-id>` with browser Sec-Fetch-* = 200. |
| F-019 + F-008 (`78b683a35` + `2984fded6`) | dedupeLibraryIndex MCP tool + idempotent dedupe | Call `dedupe_library({dryRun: true})` — confirm returns plan without writes. Call without `force` for a real run — confirm refuses without force. Call with `force: true` after creating a deliberate duplicate via test users — confirm dedupe demotes loser to `status: 'duplicate'`. Re-run = no-op. |
| **F-004 (`8e5214502`) — SUSPECT CLOSE** | "chart-health dual-store error clarity" — agent claimed `verify_setlist_charts` already HEADs both Storage + Drive | **HARD PROBE:** create a test chart that exists in Storage but NOT in Drive (or vice versa). Call `verify_setlist_charts` on a setlist bonded to it. Expected per cowork-cycle-1 spec: tool reports `ok` with `source: firebase-storage` (or `source: drive`) when only one store has the bytes. If the tool reports `missing` when one store has the bytes = REGRESSION HIGH; emit finding with `fix_direction: "wire dual-store HEAD logic in verify_setlist_charts and get_chart_status"`. |
| F-006 (`b330709b5`) | `chartHealth` shape unified across `publish_setlist` + `preview_publish` | Diff the `chartHealth` field in `preview_publish` response vs `publish_setlist({dryRun: true})` response — should be identical shape (same key names, same nesting). Both should have `unhealthy[]` + aggregate counts. |
| F-017 (`55b1ec5c2` + `1230ce379`) | publishedSnapshot drift banner in setlist edit UI | Browser: load a test setlist's edit page where `publishedSnapshot` is stale relative to current tracks. Banner should be visible. Click the banner — should surface the diff or republish CTA. |
| F-014 (`167fd1e27`) | `commit_staged_changes` no spurious version bumps | Create test setlist with 5 tracks. Note each track's `version` + `lastModifiedAt`. Stage an edit on 1 track only. Commit. Verify: only the edited track + any tracks whose `order` field actually shifted have incremented `version`. Untouched-track `version` and `lastModifiedAt` must be unchanged. |
| F-005 (`5f940e6b9`) | `wait_for_setlist_change` race + stale `currentVersion` on timeout | Two-step verify: (a) start `wait_for_setlist_change(sinceVersion=N, timeoutSec=15)` and IN PARALLEL `update_track` — wait should fire `changed: true` with correct `currentVersion`, not time out stale. (b) Force a timeout (no edits within window) — `currentVersion` returned should reflect true current version, not echo `sinceVersion`. |
| F-015 + F-018 (`8312377c5`) | rich error envelope across ALL MCP tools | Sample 5+ random tools with deliberately invalid inputs. Every error response shape: `{ok: false, error: <machine_code>, message: <prose>, ...context, hint?: <optional>}`. NEVER bare-prose `{error: "..."}`. NEVER JSON-RPC `error.code: -32602` on validation failures. Monitor write tools (`set_send_level`, `set_bus_assignment`, etc.) with out-of-range `busIndex` / `channelIndex` → must surface `ok: false, error: invalid_bus_index` (or similar), not `ok: true`. |
| F-012 (`511d6e0af`) | `generate_gig_packet` returns Storage signed URL not inline base64 | Call `generate_gig_packet(setlistId)` on a test setlist with 10+ bonded charts. Response should NOT have `pdfBase64`. Should have `{ok: true, downloadUrl, expiresAt, sizeBytes, pageCount}`. Fetch the URL — should serve a valid PDF. Test URL expiry — call past `expiresAt`, should 403/404. |

---

## 8. Carried next-cycle inputs (mandatory probes)

From cycle-1's SUPERVISOR.md "Next-cycle inputs" section. Each is at
minimum a verification step:

1. **Upload mime-tagging quality** (`cycle1-followup, 2026-05-17`).
   Probe `library_index` for `upload-*` chart fileIds whose `mimeType`
   is `application/octet-stream` instead of the actual chart mime
   (`application/pdf`, `image/png`). Specific known cases:
   `upload-0594bbd4-…` ("Bar'chu Walkdown"),
   `upload-32dbbab2-…` ("Sim Shalom - Bonia Shur"). Quantify the
   extent (% of upload-* rows affected). Test the in-app UploadDialog
   to confirm whether it still produces octet-stream tags on new
   uploads — if yes, that's a `bug` HIGH (root-cause still live); if
   no, the bug is fixed but the data damage persists as a
   `data_quality` MED finding. Suggest fix paths: (a) mime-correction
   MCP tool, (b) content-sniff fallback in chart-type predicate,
   (c) one-shot backfill from Storage object's actual `Content-Type`.

2. **F-004 substantive HEAD-both-stores verification** (supervisor,
   2026-05-17). See regression table above row F-004 for the hard
   probe.

---

## 9. Output schema — `findings.jsonl`

One JSON object per line. No trailing comma, no array wrapper.
Append as you discover (don't batch at end — supervisor may want to
read partial output if you crash mid-run).

```json
{
  "id": "<AXIS_PREFIX>-<3-digit-number>",
  "axis": "bug | feature_gap | security | usability | ui_ux | mcp_gap | performance | data_quality | ops | regression",
  "severity": "HIGH | MED | LOW | NOTE",
  "title": "one-line summary (under 100 chars)",
  "probe_mode": "mcp_surface | browser_surface | mutation_parity | regression | next_cycle_input",
  "route_namespace": "v1 | v2 | shared | mcp | n/a",
  "touch_lane": ["src/lib/mcp/tools/setlist-write.ts", "src/components/setlist/grid/SetlistGrid.tsx"],
  "parallelizable_with": ["MCP-002", "UX-003"],
  "blocks": ["MCP-005"],
  "depends_on": [],
  "daniel_discussion_required": false,
  "discussion_reason": "(only if daniel_discussion_required=true) why supervisor must interview Daniel before scoping",
  "repro": {
    "preconditions": "...",
    "steps": ["1. ...", "2. ...", "3. ..."],
    "expected": "...",
    "observed": "..."
  },
  "fix_direction": "high-level approach",
  "fix_options": [
    {"label": "Option A", "tradeoff": "..."},
    {"label": "Option B", "tradeoff": "..."}
  ],
  "evidence_paths": [
    "artifacts/<id>/screenshot-1.png",
    "artifacts/<id>/har.json",
    "artifacts/<id>/mcp-transcript.json"
  ],
  "discovered_at": "2026-05-17T22:30:00Z",
  "phase": "P0 | P1 | P2 | P3 | P4 | P5"
}
```

**ID prefix conventions:**
- `MCP-NNN` — MCP surface findings
- `UX-NNN` — usability findings
- `UI-NNN` — UI/UX visual + accessibility findings
- `BUG-NNN` — behavior bugs (non-axis-specific)
- `SEC-NNN` — security findings
- `PERF-NNN` — performance findings
- `DATA-NNN` — data quality findings
- `OPS-NNN` — operations/infra findings
- `GAP-NNN` — feature gaps (any side)
- `REG-NNN` — regression findings (failed cycle-1 verification)

**Field guidance:**

- `touch_lane`: your best guess at the source-file path(s) the fix
  will touch. Used by supervisor to plan parallel dispatch. Black-box
  guess is fine; supervisor will refine. If truly unknown, say `[]`.
- `parallelizable_with`: IDs of OTHER findings whose fixes
  PROBABLY don't collide with this one on `touch_lane`. List
  generously — supervisor culls.
- `blocks`: IDs of findings that MUST ship after this one (because
  the fix introduces a contract this other finding's fix depends on).
- `daniel_discussion_required`: `true` for findings where the fix
  involves an architectural choice, tradeoff between options Daniel
  hasn't signaled on, or scope decision. Supervisor will batch these
  into a single Daniel-interview pass before dispatching agents.
- `fix_options`: include 2–4 when there's a real tradeoff. If the
  fix is obvious, omit this field entirely.
- `evidence_paths`: relative to your output dir. Always include at
  least one for HIGH-severity findings.

---

## 10. Artifacts dir

For each finding, write supporting artifacts to
`artifacts/<finding_id>/`:

- Screenshots: `screenshot-<seq>.png`
- Network HAR: `har.json`
- Console log dump: `console.log`
- MCP request/response transcripts: `mcp-transcript.json` (JSON array
  of `{ts, method, args, response}` objects)
- Browser DOM snapshot (if relevant): `dom-snapshot.html`
- Any other supporting data: arbitrary file with descriptive name

Keep artifacts small — screenshots compressed, HARs trimmed to the
relevant request range, transcripts trimmed to the relevant calls.
Supervisor's total ingestion budget is bounded.

---

## 11. Execution discipline — phased plan with checkpoints

Run in 6 phases. Write a checkpoint line to `convergence.log` at the
start and end of each phase: `<iso-utc> <phase> <event> <notes>`.

### P0 — Setup + discovery (target 30–60 min)

1. Verify `DRIVER_BEARER` works: `tools/list` should return the
   tool roster. If unauth or 401, abort and have Daniel re-mint.
2. Enumerate the MCP tool surface. For each tool, capture its
   input schema (from `tools/list` response) into
   `artifacts/_mcp-tool-roster.json`.
3. Enumerate the browser route surface. Crawl from `/`, depth ≤3,
   capture all reachable route paths into `artifacts/_browser-routes.json`.
   Note auth-gated vs public.
4. Spin 4 test users (admin / band_leader / musician / member) via
   `create_test_account`. Capture their tokens internally; DO NOT
   write them to files. Use these for permission-axis probing.
5. Build the mutation cross-reference table (browser-exposed
   mutations × MCP-tool equivalents). Save as
   `artifacts/_mutation-matrix.json`.
6. Emit P0 checkpoint to `convergence.log`.

### P1 — MCP surface deep audit (target 1.5–2h)

For each MCP tool from P0 inventory:

- Valid-input probe: call with minimum-viable args, capture response.
- Boundary probes: empty strings, max-length strings, zero/negative
  numbers, large numbers, missing required fields, extra unknown fields,
  null vs undefined for optional fields.
- Adversarial probes: SQL-injection-shaped strings, Unicode bidi
  control chars (`U+202E`), NUL bytes, control characters, very large
  payloads (up to ~10MB to test cap behavior).
- Idempotency probes for write tools: call twice with same args,
  verify expected behavior.
- `dryRun: true` probes where applicable: verify returns plan without
  writes, no `force` required.
- Role-based access: call each write tool from each of the 4 test
  user roles, verify expected permit/refuse decisions.
- Error envelope verification: every error response must match the
  rich shape; flag deviations.

Emit `mcp_surface` findings as you discover them.
Emit P1 checkpoint.

### P2 — Website surface deep audit (target 1.5–2h)

For each route from P0 inventory:

- Load test, desktop viewport: `1920x1080`. Screenshot, HAR, console.
- Mobile viewport: `375x812` (iPhone-class). Screenshot.
- iPad viewport: `1024x1366` (iPad-class). Screenshot.
- Interactive: click every button, open every modal, fill every form
  (with test data and submit — but only if submission goes to test
  resources).
- Accessibility: keyboard-only nav can reach every interactive
  element; visible focus indicators; ARIA roles where needed;
  contrast ratios.
- Console errors / warnings — every line is potential finding fodder.
- Network: any 4xx / 5xx that's not deliberate? Any payload >2MB?
  Any unbatched bursts of >10 requests for one user action?
- Performance: Core Web Vitals via Lighthouse-style measurement on
  3 key routes (`/`, `/library`, `/setlists/<some-test-setlist>`).
- v1 vs v2 namespace tagging on findings.

Emit `browser_surface` findings.
Emit P2 checkpoint.

### P3 — Mutation flow + parity matrix (target 1.5–2h)

For each row in the P0 mutation matrix:

- If only browser side has it → `mcp_gap` finding, HIGH severity.
- If only MCP side has it → consider `feature_gap` (browser surface
  should probably expose) MED severity, depending on whether it's a
  Daniel-only authoring tool.
- If both sides have it → execute the round trip:
  1. Create / mutate via MCP, read via browser → identical state?
  2. Create / mutate via browser, read via MCP → identical state?
  3. Any divergence in field shapes, types, timestamps, version
     numbers, derived counters → HIGH parity finding.

Examples of mutations to cover (NOT exhaustive — extend from your P0
matrix):
- Create setlist (empty / pre-bound)
- Clone setlist (this is a known MCP gap; verify cleanly)
- Add track / remove track / reorder tracks
- Edit track field (title / key / vocal_lead / notes)
- Bond / unbond chart from track
- Publish setlist / republish / unpublish
- Import chart from Drive (test fileId)
- Upload chart (test PDF, test PNG)
- Dedupe library (test duplicates first)
- Mint / revoke test token
- Update template / preset (if templates exist — discover them)
- Change monitor mix bus assignment (NOTE: monitor MCP exposure may
  be incomplete — flag as gap if so)
- Manage user role (if exposed)

Emit `mutation_parity` findings.
Emit P3 checkpoint.

### P4 — Regression probes + carried inputs (target 45–60 min)

Execute every row in §7 (cycle-1 regression probes) and §8 (carried
next-cycle inputs). Emit one `regression` finding per failed verification,
one `next_cycle_input` finding per substantive observation.

**Pay extra attention to F-004** — the supervisor flagged this as a
suspect close; probe it hard.

Emit P4 checkpoint.

### P5 — Cleanup + final audit (target 30 min)

1. Aggregate stats: total findings by axis, by severity, by phase.
   Write to `artifacts/_summary.json` (only file the supervisor might
   skim before diving into JSONL).
2. Run `cleanup_all_test_data` from an admin context (NOT a test
   bearer — switch to the original `DRIVER_BEARER`). Verify:
   - `list_test_accounts` returns empty
   - `mcpTestUsers` collection has 0 docs (verify via your admin
     bearer)
   - Test setlists you created are deleted (via the MCP tool you
     used to create them; if there's no `delete_setlist` MCP that's
     itself an `mcp_gap` HIGH finding — and the orphan setlists are
     a `DATA-` cleanup finding).
3. Write `cleanup-audit.json` with the cleanup result.
4. Emit P5 checkpoint with `event: complete`.

---

## 12. Self-convergence

You may exit early before the 6-8h budget IF and only if:

- All P0 inventories are complete.
- P1 covered ≥95% of MCP tools with at least valid-input + role-based
  probes.
- P2 covered ≥95% of discoverable routes with viewport + console +
  HAR captures.
- P3 covered every row in the mutation matrix.
- P4 ran every regression + carried-input probe.
- P5 cleanup verified clean.
- You're past the 4-hour mark.

If any of these are incomplete, keep working until the 8-hour budget.
Don't pad with redundant findings to hit a count target — the supervisor
wants signal density, not volume.

---

## 13. Final-state contract with supervisor

When you exit, the output dir should contain:

```
sheet-music-app-mcp/outputs/autonomous-run/cycle-2/
├── findings.jsonl              # primary output
├── convergence.log              # phase checkpoint log
├── cleanup-audit.json           # P5 cleanup result
└── artifacts/
    ├── _mcp-tool-roster.json    # P0 inventory
    ├── _browser-routes.json     # P0 inventory
    ├── _mutation-matrix.json    # P0 inventory
    ├── _summary.json            # P5 aggregate stats
    ├── <FINDING_ID>/
    │   ├── screenshot-*.png
    │   ├── har.json
    │   ├── console.log
    │   ├── mcp-transcript.json
    │   └── ...
    └── ...
```

That's the supervisor's input. From there, supervisor groups
findings by `touch_lane` + `parallelizable_with`, runs a
Daniel-interview pass on `daniel_discussion_required` findings, then
spins up to 5 Claude Code agents from pre-resolved scopes.

---

## 14. Tone in your findings

- No narrative. No "I observed that…", no "This is interesting because…".
- Bullet `repro.steps` arrays, not prose.
- `observed` and `expected` are short statements of fact.
- `fix_direction` is a sentence; `fix_options` is structured.
- No emojis. No commentary on Daniel's design choices unless emitting
  a finding directly tied to UX impact.
- If you're uncertain whether something is a finding, emit it as
  `severity: NOTE` and let supervisor triage.

---

## 15. Begin

Go. Read DRIVER_BEARER above. Verify `tools/list` works. Then P0.
Write your first checkpoint line to `convergence.log` and start
emitting to `findings.jsonl`. The supervisor will read whenever
you exit (or earlier, if Daniel asks for a progress check).

Good luck.
