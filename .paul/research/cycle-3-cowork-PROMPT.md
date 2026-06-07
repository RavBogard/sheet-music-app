# Cycle-3 Cowork Audit Prompt — centralreform.live

> ⚠️ **DO NOT COMMIT THIS FILE TO GIT.** Contains a live admin bearer
> (§0). After the cowork run, either revoke the bearer (admin MCP)
> and/or scrub the token from the file before any commit.

**Run date:** to be filled in by Daniel at paste time
**Target product:** `https://www.centralreform.live` (Reform Jewish synagogue music app)
**Expected runtime:** 6–8 hours autonomous
**Output target:** machine-structured artifacts for supervisor (a separate Claude Code session) — Daniel does NOT read your output

---

## 0. Who you are and who you're writing for

You are the **cycle-3 cowork session**. You run autonomously for 6–8
hours. Your job is an exhaustive multi-axis audit of the entire
product, with particular emphasis on the surface area that has
shipped since cycle-2 (Drive importer, library reconciliation, AI
enrichment, library-review UI, needs-sync chart-health, AI-config
admin MCP, the b1 rich-error-envelope sweep). Your output is consumed
by a **supervisor agent** (a separate long-running Claude Code session
that lives in `.coord/SUPERVISOR.md` of the source repo) who will read
your output, group findings by file-lane + parallelizability, and
dispatch up to **5 concurrent Claude Code agents** to ship the fixes.

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
calls and this bearer only for raw HTTP probes (e.g. the F-04
substantive regression that hits `/api/drive/file/*`, the
HEAD-Storage-but-not-Drive synthetic case, the b1 error-envelope
verification, or the trusted-leader rate-limit bypass burst).

```
DRIVER_BEARER: crl_live_7ac2de370b5c7bd313baf6125cc309d56e08068cc612c04dfe8edf7f8ad3a0a9
```

**Cycle-2 cowork output (READ FIRST for context):** the cycle-2
session emitted 22 findings in JSONL form plus a HANDOFF document.
All 22 either shipped or were resolved-by-policy before cycle-3
kicks off; the regression axis (§7 below) verifies they stayed
shipped. The cycle-2 output dir is at:

```
C:\Users\dsbog\AppData\Roaming\Claude\local-agent-mode-sessions\
  3402438a-2072-4bc9-b8ed-e0a87f93d157\
  1195fb50-a2f4-47bb-a77a-be8d4984036c\
  local_b4761d62-b644-4832-a6c8-43fb66fa4e67\
  outputs\sheet-music-app-mcp\outputs\autonomous-run\cycle-2\
```

Files of interest there: `findings.jsonl`, `HANDOFF-TO-SUPERVISOR.md`,
`artifacts/_summary.json`, `artifacts/_mutation-matrix.json`. Read
the HANDOFF first — it tells you which findings shipped vs which
resolved-by-policy and what to verify in regression.

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

**What shipped since cycle-2** (cycle-3-specific probe surface — every
item below MUST be exercised somewhere in the audit):

1. **`a1-drive-importer`** (master @ `27e22e2a1`). New cron route
   `/api/cron/drive-sync` (Vercel cron schedule `*/5 * * * *`,
   env-gated on `DAVID_DRIVE_DROP_FOLDER_ID` — dormant unless the
   env var is set). Watches David Lazaroff's Drive folder for new
   PDFs and ingests them into Storage via `processChartUpload` with
   `source: 'drive_drop'` and a populated `driveMetadata` field. New
   `needs_storage_sync` state on `ChartHealth`. New
   `VerifySetlistChartsResult.needsSyncCount` aggregate.

2. **`a2-reconcile-library`** (master @ `cf4ae6d46`). New admin-only
   MCP tool `reconcile_library({dryRun, force})`. Mirrors Drive
   bytes into Firebase Storage at the existing `fileId`. Marks
   Drive-404 rows as orphaned. Preserves curation metadata.
   `dryRun: true` returns full plan without writes (F-05 discipline);
   real run requires `force: true`.

3. **`a3-ai-enrichment`** (master @ `0cf194841`, **provider being
   swapped at cowork kickoff — see provider note below**). Event bus
   that fires `library.row.created` after every successful
   `library_signals` broadcast. AI subscriber consumes the event,
   calls multi-modal (PDF/image/text) LLM API, populates
   `enrichmentStatus` on the `library_index` row. Status values:
   `'pending' | 'review_pending' | 'enriched' | 'failed' | 'human_curated' | 'human_rejected'`.
   Content-hash cache at `aiEnrichmentCache/<sha256>`. Fail-open
   retry queue at `aiEnrichmentRetryQueue/<rowId>`. New cron route
   `/api/cron/ai-enrich-retry` (`*/30 * * * *`). Firestore rules
   restrict `aiEnrichmentCache` + `aiEnrichmentRetryQueue` +
   `aiConfig` to admin + server. **`aiConfig/autoApplyEnabled` stays
   `false`** for the duration of cowork — every enriched row should
   land in `review_pending`, not auto-`enriched`.

   **PROVIDER NOTE (load-bearing for §7.B.3):** the original a3
   shipped using Anthropic Sonnet 4.7 via `@anthropic-ai/sdk` gated
   on `ANTHROPIC_API_KEY`. Daniel ratified a provider swap to the
   latest Gemini Pro model on 2026-05-18T16:40Z, and the
   `a3-gemini-swap` agent is in flight at cowork kickoff. The
   target provider on master is the latest Gemini Pro
   (e.g. `gemini-3.1-pro-preview` or current equivalent — verify
   from the deployed code) via `@google/generative-ai` (or
   `@google/genai`), gated on `GEMINI_API_KEY`. Daniel confirmed
   `GEMINI_API_KEY` is set in Vercel prod. So:
   - If `a3-gemini-swap` has shipped by the time cowork checks
     master tip at P0 → AI subscriber is active on Gemini.
     Probes in §7.B.3 fire end-to-end with real Gemini calls.
     Budget ~$0 (Gemini free tier covers expected volume).
   - If `a3-gemini-swap` has NOT shipped at P0 → AI subscriber
     is DORMANT (current code uses ANTHROPIC_API_KEY which is NOT
     set). §7.B.3 degrades to structural-only probing (event bus
     wires, queue/cache shape, threshold gating logic exercised
     via c2 admin MCP tools, autoApplyEnabled gating). Emit a
     `mcp_gap` NOTE finding documenting that AI subscriber was
     dormant at probe time + skip the end-to-end assertions.
   - **At each phase boundary**, re-check `git log origin/master`
     (via `master-tip.md` or the deployed surface). If the swap
     lands mid-run, transition §7.B.3 probes from structural-only
     → end-to-end on the next phase boundary and note the
     transition timestamp in your findings.
   - Either way, every persisted `EnrichmentOutput` blob on
     `library_index.aiSuggestion` should match the Zod schema
     documented in a3's archive (a3-gemini-swap preserves the
     schema exactly). Schema divergence post-swap = HIGH
     `regression` finding.

4. **`a4-library-review-ui`** (in-flight; may or may not have
   shipped by the time cowork runs). If it has, expect new admin
   routes at `/manage/library-review` (browser) and
   `/api/admin/library-review/*` (HTTP). Endpoints surface
   accept / reject / edit / retry / dismiss against pending rows.
   **You probe this surface dynamically** — at the start of each
   phase (P0..P5), `git`-style check the deployed surface (load
   `/manage/library-review` and probe `/api/admin/library-review`).
   If the surface exists, fold it into the matrix; if not, emit
   no findings against it.

5. **`b5-needs-sync-count`** (master @ `68314b7e9`). New field
   `needsSyncCount: number` on `publish_setlist` + `preview_publish`
   `chartHealth`. Counts charts in the new `needs_storage_sync`
   state. Symmetry with `unhealthyCount` / `missingCount`.

6. **`b6-perform-uat-suite`** (master @ `acdd92c8f`). New Playwright
   e2e suite under `e2e/`. Covers consumer/band browser surface:
   perform-flow, chart-bind-picker, gig-packet-print. Auth via
   `/api/auth/test-session` (the b3 GAP-001 close — the
   programmatic browser-test auth surface that cycle-2 explicitly
   flagged as missing). **This endpoint is itself part of your
   probe surface in cycle-3** — exercise it from your browser
   probes; consider whether to use it for in-band-authed browser
   testing.

7. **`c2-ai-config-mcp`** (master @ `2b7a9292c`). Three new admin
   MCP tools: `get_ai_config`, `set_ai_auto_apply({enabled,
   dryRun?, force?})`, `set_ai_threshold({value, dryRun?, force?})`.
   Admin-only. `dryRun:true` default + `force:true` gate on real
   runs (F-05). Rich error envelope on every refusal.

8. **`b1-error-envelope-sweep`** (master @ `3e1d9b4fd`). Rich error
   envelope `{ ok:false, error: { code, machine_code, message,
   debug? } }` is now load-bearing across **every MCP tool** AND
   `/api/drive/file/[fileId]`. The `debug` field is redacted in
   production responses (it carries internal trace context only in
   non-prod). Any tool or endpoint that returns a bare
   `{error: "..."}` string shape or any other legacy envelope is a
   regression finding.

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
   dry-run-mode without `force`, that's a real bug. **F-05 applies
   to all admin tools that touch real data**: as of cycle-3 that's
   `reconcile_library`, `dedupe_library_index`, `backfill_library_index`,
   `backfill_setlist_test_flag`, `set_ai_auto_apply`,
   `set_ai_threshold`, plus any `library-review` admin endpoints
   that a4 ships if it lands mid-run.

3. **Chart-access policy is intentionally public.** Chart bytes are
   accessible to anyone with a `fileId` by design — Daniel's call
   (per `feedback_chart_access_policy`). Do NOT flag "chart
   accessible to unauth user" as a security finding. Do NOT
   suggest tightening drive/file auth.

4. **No cover art for songs or setlists.** UI is max-density text
   rows (Logic Pro track-list style). If you find image-based
   song/setlist art in the UI, that's a regression.

5. **Terminology:** "Vocal Lead" for the singer assignment, NOT "Lead"
   or "Leader." Rabbi-led services use a separate "Led by" field.

6. **Trusted-leader rate-limit bypass.** `admin` and `band_leader`
   roles get rate-limit bypass on MCP writes (per
   `feedback_admin_rate_limit_bypass`). The bypass is implemented
   via `checkUserRateLimit(uid, tier, {bypass: isTrustedLeader(roles)})`.
   **Verifying this is a hard probe in cycle-3** (§7).

7. **`bridge/**` is do-not-touch.** There may be `/api/bridge/*`
   endpoints; do not probe them. (CRIT-003 is now resolving via a
   separate Companion-bridge direction; cowork must not interfere.)

8. **`cleanup_all_test_data` self-revokes the caller** if the caller
   itself is a test bearer. Plan your cleanup phase accordingly —
   don't call it from a test bearer expecting to do more work after.

9. **Master is production.** `https://www.centralreform.live` is the
   master deploy. No staging environment.

10. **Dedup tolerance is fixed at 0.85 strict + `force: true` per-call
    override** (per `feedback_dedup_force_override`). Don't propose
    tuning the threshold or weakening the default. Probing dedup at
    boundary scores is fine — proposing a different baseline is not.

11. **`/v2/*` may or may not exist mid-run.** A v2-shell agent is in
    flight. If routes resolve, treat as opt-in beta surface — light
    probe, no expectation of feature parity with `/v1`. Tag findings
    with `route_namespace: 'v2'`.

12. **Rich error envelope contract** (`b1-error-envelope-sweep`).
    Every refusal/validation path must emit
    `{ ok:false, error: { code, machine_code, message, debug? } }`
    with prod-redacted `debug`. Any tool/endpoint still returning a
    bare `{error: string}` is a regression finding.

---

## 2. Tools at your disposal

You have:

- **MCP** at `https://www.centralreform.live/api/mcp` — authenticate
  with the `DRIVER_BEARER` above as `Authorization: Bearer <token>`.
  Call `tools/list` first to enumerate the available tools (don't
  assume what exists; the surface is changing). As of cycle-3 the
  tool count is in the 30–35 range across setlist read/write,
  library, publish, monitor, test-tokens, reconcile, AI config.
- **Browser/Playwright** against `https://www.centralreform.live`.
  Full headless browser, with HAR capture, console-log capture,
  screenshot capability. **Browser-side auth constraint update for
  cycle-3:** the b3 GAP-001 fix shipped `/api/auth/test-session` —
  a programmatic browser-test auth endpoint. Probe it; if it works
  cleanly, use it to extend your browser-side probing into
  authed-only routes (Perform mode, chart-bind picker, library
  browse, gig-packet print). If it doesn't work cleanly, that's
  itself a regression finding against b3 GAP-001.
- **File write** to an output directory:
  `sheet-music-app-mcp/outputs/autonomous-run/cycle-3/`.
  - Primary output: `findings.jsonl` (one finding per line)
  - Artifacts: `artifacts/<finding_id>/` (screenshots, HARs,
    MCP transcripts, console logs)
  - Cleanup audit: `cleanup-audit.json` (your final cleanup pass)
  - Convergence log: `convergence.log` (your phase checkpoints)
- **Test-identity provisioning:** `create_test_account`,
  `list_test_accounts`, `revoke_test_account`, `cleanup_all_test_data`
  — use these to spin synthetic users at admin / band_leader /
  musician / member roles. **Trusted-leader rate-limit bypass
  probe (§7) requires one test user at EACH role tier.**

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
4. **Reconcile / library writes target test rows only.** When probing
   `reconcile_library`, scope to a test setlist + test-uploaded
   charts. If the tool doesn't support per-row scoping in its
   schema, run `dryRun: true` extensively, run with `force: true`
   only against a synthetic scenario you set up yourself (e.g.
   upload a test PDF, delete from Storage, then reconcile and
   verify just the test row is touched). If you can't bound the
   blast radius confidently, **emit a feature_gap finding rather
   than running the real-write probe blind**.
5. **AI enrichment posture:** `GEMINI_API_KEY` is set in Vercel
   (confirmed by Daniel). `ANTHROPIC_API_KEY` is intentionally NOT
   set — the provider swap is in flight (see §1 provider note). If
   `a3-gemini-swap` has shipped by the time you check master at P0,
   real Gemini calls fire on every fixture chart you upload (budget
   ~$0, free tier). If not yet shipped, AI subscriber is DORMANT
   and §7.B.3 degrades to structural-only — see §7.B.3 + the
   provider note in §1 for the dynamic-detection protocol. Budget:
   ~5–15 fixture uploads is the expected probe volume regardless
   (one per content-type you want to exercise — PDF chord chart,
   image chord chart, lyric-only PDF, near-duplicate pair for
   dedup, deliberately-corrupt PDF to exercise the retry queue,
   etc.). DO NOT bulk-upload large fixture sets. DO NOT mass-flush
   the cache (`aiEnrichmentCache/*`) — let it accumulate normally.
   `aiConfig/autoApplyEnabled` STAYS `false` throughout. If you
   set it `true` via `set_ai_auto_apply` for any probe, you MUST
   set it back to `false` before phase exit. Same for
   `set_ai_threshold` — record original value via `get_ai_config`
   at P0, restore in P5 cleanup.
6. **No probing of `bridge/**`.** If you discover `/api/bridge/*`
   endpoints, do not call them. Note their existence as a NOTE-level
   finding only.
7. **Chart-access policy public is by design** — see standing rule
   #3. Do not flag.
8. **No DoS-style stress.** "Long-running" means thorough probing,
   not flood. Use sensible call rates. The trusted-leader rate-limit
   probe in §7 is an EXCEPTION — it deliberately bursts 50 calls
   in a short window to find the limit; that's bounded and
   intentional, not flood.
9. **Don't try to escape the sandbox.** No filesystem reads outside
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
| `usability` | Friction, confusing flow, error-message clarity, unrecoverable state. AI-enrichment review workflow ergonomics in scope. |
| `ui_ux` | Visual consistency, accessibility, perf budget, dark-first OKLCH palette adherence, mobile/iPad form-factor breakage. v1 vs v2 namespace tagging mandatory. |
| `mcp_gap` | Browser-exposed mutation has no MCP equivalent, OR MCP tool has awkward shape/missing context. Daniel's MCP-first authoring workflow makes completeness load-bearing. |
| `performance` | Slow path, large payload, expensive Firestore query, JS bundle size, Core Web Vitals regression, AI provider round-trip latency on enrichment (Gemini Pro post-swap; Sonnet 4.7 pre-swap). |
| `data_quality` | `library_index` state issues — orphans, duplicates, mime drift, stale snapshot, enrichmentStatus drift, retry-queue stuck items. |
| `ops` | Deploy/infra/monitoring/observability gap. Cron-route health (`/api/cron/drive-sync`, `/api/cron/ai-enrich-retry`) in scope. |
| `regression` | Cycle-2 finding didn't actually close the underlying issue, or new code broke prior behavior. |

---

## 5. Probe modes (every finding tagged with one)

You probe in five modes; tag each finding with which mode discovered it:

1. **`mcp_surface`** — straight MCP API audit. Call `tools/list`,
   probe every tool with valid + boundary + adversarial inputs,
   verify response shape, **rich error envelope** (b1: `{ ok:false,
   error: { code, machine_code, message, debug? } }` with `debug`
   redacted in prod), validation surfacing, idempotency,
   `dryRun` semantics (F-05), role-based access (including
   trusted-leader bypass behavior).

2. **`browser_surface`** — straight browser/Playwright audit. Crawl
   the route tree from `/` recursively. For each route: load, screenshot,
   capture HAR + console, click interactive elements, test forms.
   Mobile + iPad viewport variants (band uses iPads in Perform mode).
   Accessibility audit (keyboard nav, ARIA, contrast). Auth-gated
   routes tested both unauthed AND authed (via `/api/auth/test-session`
   if it works). Probe `/manage/library-review` and
   `/api/admin/library-review/*` dynamically — re-check existence
   at each phase boundary.

3. **`mutation_parity`** — for every mutation you discover (either
   side), execute it from BOTH MCP and browser, verify identical
   end-state via independent reads. Examples (illustrative, NOT
   exhaustive — DISCOVER the mutation surface, don't work from a
   fixed list): create setlist, clone setlist, add/remove/reorder
   tracks, edit track fields, bond/unbond charts, publish + republish
   + unpublish, import chart from Drive, upload chart (with AI
   enrichment downstream), reconcile library, dedupe library,
   accept/reject AI-enriched row (a4), set AI auto-apply, set AI
   threshold, mint/revoke test tokens. Any browser-exposed mutation
   without an MCP equivalent = `mcp_gap` HIGH finding. Any parity
   divergence (different end-state for the same logical operation)
   = HIGH finding regardless of axis.

4. **`regression`** — verify each cycle-2 fix actually closed its
   finding. List in §7.

5. **`next_cycle_input`** — verify each carried-over input from
   cycle-2's HANDOFF and from §8 below.

---

## 6. Discovery mandate (probe modes 1+2+3)

You are explicitly NOT working from a fixed list of tools or routes.
Your surface enumeration is part of the audit:

- **MCP enumeration:** call `tools/list` first. For each tool,
  inspect the input schema, derive valid/boundary/adversarial test
  cases. Find tools whose names suggest features that should exist
  symmetrically (e.g. if `create_setlist` exists, does `clone_setlist`?
  If `set_ai_threshold` exists, does `get_ai_threshold` — or does
  `get_ai_config` cover it?). For each absent-but-implied tool,
  that's an `mcp_gap` finding. **Re-enumerate at the start of P3 and
  P4** — c2 may have shipped additional AI-config tools, or a4 may
  have shipped admin-review MCP tools, between cycle-2 and cycle-3
  paste time.
- **Browser route enumeration:** start from `/` and crawl. Note:
  `/v2/*` is a parallel UI redesign in active development — probe
  separately and tag findings with `route_namespace: 'v1' | 'v2' | 'shared'`.
  Note: `/monitor` is the personal-IEM mixing system (WebSocket
  driven). Note: `/perform/*` is the iPad-targeted band view.
  Note: `/manage/library-review` may or may not exist (a4 dynamic
  pickup).
- **Cron-route discovery:** the new cron routes (`/api/cron/drive-sync`,
  `/api/cron/ai-enrich-retry`) should be inaccessible to non-Vercel
  callers — probe them unauthed and confirm 401/403. Don't try to
  forge the Vercel cron secret. Emit findings if they're reachable
  without proper auth.
- **Mutation cross-reference:** maintain a running internal table:
  `{operation, mcp_tool?, browser_path?, parity_verified?}`. Emit
  one finding per row where either column is empty or `parity_verified
  = false`.

---

## 7. Cycle-2 + cycle-3 hard probes (mandatory)

Two-part section: §7.A is the regression sweep against cycle-2's 22
findings; §7.B is the cycle-3-specific deep probes. If any
verification fails, emit a `regression` (for §7.A) or axis-appropriate
(for §7.B) finding with `severity: HIGH` and the appropriate
`fix_direction`.

### §7.A — Cycle-2 regression sweep

For each cycle-2 finding (from `findings.jsonl` in the cycle-2 output
dir referenced in §0), verify the fix actually closed the issue
against deployed product. Cycle-2 emitted 22 findings; the supervisor
reports all either shipped or resolved-by-policy. Cycle-3 verifies
they stayed shipped.

Read `HANDOFF-TO-SUPERVISOR.md` first — it tells you per-finding
whether the close was a code change or a policy decision. Policy
closes (e.g. chart-access public, bridge deferral) you re-confirm
the policy still applies (no flag). Code closes you re-run a probe
matching the cycle-2 repro and confirm the fix holds.

Specific cycle-2 fixes you must re-verify (non-exhaustive — read the
HANDOFF for the full list):

| cycle-2 finding class | re-verify probe |
|---|---|
| **Rich error envelope rollout** (b1 antecedents) | Sample 8+ random MCP tools with deliberately invalid inputs. Every error response shape: `{ ok:false, error: { code, machine_code, message, debug? } }`. NO bare-prose `{error: "..."}`. NO JSON-RPC `error.code: -32602` on validation failures. `debug` field MUST be absent / empty / redacted in prod (the b1 redaction contract). |
| **F-04 dual-store HEAD** (cycle-1's "SUSPECT CLOSE" re-raised by cycle-2 ADDENDUM-1) | See §7.B for the substantive probe. |
| **`/api/auth/test-session`** (b3 GAP-001) | Confirm the endpoint exists, mints a valid session for a test user, and the resulting cookie/header authorizes browser-side requests to `/setlists`, `/library`, `/perform/*`. |
| **`publish_setlist` chartHealth.needsSyncCount** (b5) | Call `publish_setlist({dryRun: true})` on a test setlist where 1+ tracks are bonded to charts in `needs_storage_sync` state. Verify `chartHealth.needsSyncCount: N` is present and accurate. Same probe on `preview_publish` — shape must be identical (cycle-1's F-006 unification still holds). |
| **Mime-tagging quality** (cycle-2 next-cycle input) | Re-query `library_index`; quantify `upload-*` rows with `mimeType: 'application/octet-stream'`. Compare to cycle-2's snapshot — has the count gone down (backfill ran), stayed flat (still broken), or gone up (root cause still firing)? |
| **`generate_gig_packet` signed URL** | Call on a test setlist; response must have `{ ok: true, downloadUrl, expiresAt, sizeBytes, pageCount }`, no `pdfBase64`. URL must fetch a valid PDF. |
| **`commit_staged_changes` version discipline** | Stage edit on 1 track; commit; verify only that track + any tracks with shifted `order` got `version` bumps. |
| **`wait_for_setlist_change` race + stale version** | Re-run the cycle-1 two-step (parallel update; timeout). |

For each verification that fails: `REG-NNN` finding, HIGH, with
`fix_direction` pointing at the cycle-2 fix that regressed.

### §7.B — Cycle-3 hard probes (cycle-3-specific)

These are the high-priority cycle-3 surfaces. Each MUST have an
explicit recipe executed and an artifact directory.

#### §7.B.1 — F-04 SUBSTANTIVE: dual-store HEAD logic

Cycle-1's F-04 close was a clarity-tweak. Cycle-2's ADDENDUM-1
reframed direction. Cycle-3 proves the dual-store logic actually
fires.

**Recipe:**
1. Upload a fresh test PDF chart via `processChartUpload` (or the
   equivalent MCP tool — `upload_chart` if it exists, else the
   browser path under a test session).
2. Note the `fileId` (should be `upload-<uuid>` for a Storage-source
   chart).
3. Create a test setlist; bond the chart to a track.
4. Verify baseline: call `verify_setlist_charts({setlistId})` — row
   should report `ok` (or `healthy`) for the bonded chart.
5. **Synthetic Storage-only-deletion:** simulate the chart existing
   in Drive (via a parallel Drive import) but missing from Storage.
   If you can't engineer this directly black-box, document the
   limitation and emit a NOTE finding; supervisor will instrument.
   Otherwise: delete the Storage object (via whatever admin path
   exists), keep the `library_index` row pointed at the Drive
   `fileId`.
6. Re-call `verify_setlist_charts({setlistId})`. **Expected:** the
   row reports `needs_storage_sync`, NOT `missing`. The tool's HEAD
   on Drive returns 200, HEAD on Storage returns 404, so the row
   is recoverable via `reconcile_library` — `needs_storage_sync` is
   the correct state.
7. If observed is `missing` (not `needs_storage_sync`): emit
   `REG-NNN` HIGH with `fix_direction: "verify_setlist_charts must
   HEAD both Storage AND Drive and resolve to needs_storage_sync
   when only one store has bytes"`. This is F-04 finally resolving
   as a real regression, not a clarity tweak.

#### §7.B.2 — `reconcile_library` round-trip

**Recipe:**
1. Engineer the §7.B.1 scenario (chart in Drive, missing from
   Storage, bonded to a test setlist).
2. Call `reconcile_library({dryRun: true})`. Verify response shape
   includes a plan listing the affected row, with the
   needs-Storage-sync action explicit. No writes performed. NO
   `force: true` required.
3. Call `reconcile_library({})` without `dryRun`, without `force`.
   Expected: refuses with `{ ok:false, error: { machine_code:
   'force_required' (or similar), ... } }` (F-05 discipline).
4. Call `reconcile_library({force: true})`. Verify: Storage object
   restored, `library_index` row state transitions back to healthy,
   `verify_setlist_charts` now reports `ok`.
5. Idempotency: re-call `reconcile_library({force: true})`. Should
   no-op (no rows to reconcile).
6. Drive-404 path: engineer a row where Drive returns 404 (delete
   the Drive file for a test chart you control). Call
   `reconcile_library({dryRun: true})`. Verify plan lists the row
   as orphan-mark, NOT as Storage-restore. Real-run with `force:
   true`: row's `status` (or equivalent) transitions to orphaned,
   curation metadata (title, vocal_lead, key, etc.) preserved.

Findings emitted per axis as observed.

#### §7.B.3 — AI enrichment end-to-end

**Recipe:**
1. P0 capture: `get_ai_config` — record the baseline `threshold`
   and `autoApplyEnabled` values. Restore in P5.
2. Verify `autoApplyEnabled === false`. If it's `true`, emit a
   `bug` HIGH and call `set_ai_auto_apply({enabled: false, force:
   true})` to enforce posture before proceeding.
3. Upload a test PDF chord chart. Within ~60s, query the
   `library_index` row's `enrichmentStatus`. Expected progression:
   `pending` → `review_pending` (since `autoApplyEnabled: false`).
4. Verify the `library.row.created` event fires AFTER
   `library_signals` broadcast (probe by watching subscriber-side
   signals OR by confirming the row exists when enrichment hits).
5. Cache hit: upload the **same exact PDF** again (same content
   hash). Verify the second row's enrichment latency is markedly
   lower than the first (cache hit at `aiEnrichmentCache/<sha256>`).
   Both rows should still land in `review_pending` because the
   posture is `autoApplyEnabled: false`.
6. Image-modal probe: upload a PNG chord chart. Verify enrichment
   processes it via the multi-modal path (any enrichmentStatus
   transition is sufficient evidence; PNG-specific extractor
   accuracy is out of scope).
7. **Threshold probe (uses c2's `set_ai_threshold`):** call
   `set_ai_threshold({value: 0.99, force: true})`. Upload a chart.
   Most enrichments should NOT clear the high threshold — row
   should remain `review_pending` (or `pending`). Then call
   `set_ai_threshold({value: 0.0, force: true})`. Upload another
   chart. **Critically: `autoApplyEnabled` is STILL `false`, so
   even a 0.0 threshold should NOT auto-apply** — row should still
   land in `review_pending`. If a 0.0 threshold + autoApply-false
   produces auto-enriched rows, that's an `mcp_gap` or `bug` HIGH
   (gating logic incorrect).
8. **Retry queue probe:** upload a deliberately-corrupt PDF
   (truncate a real PDF at byte ~512, or upload random bytes with
   `.pdf` extension). Verify within ~5 min:
   - Row's `enrichmentStatus` transitions to `failed` OR an entry
     appears at `aiEnrichmentRetryQueue/<rowId>`.
   - Cron `/api/cron/ai-enrich-retry` (or whatever the retry path
     is) eventually retries; verify by waiting ≥30 min OR by
     checking that retry attempts are recorded.
   - **Fail-open contract:** the row exists, is `enrichmentStatus:
     'failed'`, and is still visible/usable in the library. NOT
     deleted, NOT hidden, NOT in a broken state.
9. **Restore:** call `set_ai_threshold({value: <baseline>, force:
   true})` and `set_ai_auto_apply({enabled: false, force: true})`
   in P5 before final cleanup.

Findings emitted on every divergence from the above.

#### §7.B.4 — Dedup tolerance H-3

Per `feedback_dedup_force_override`: dedup score threshold is 0.85
strict, with per-call `force: true` override. Don't propose tuning
the baseline; do probe the tolerance ergonomics.

**Recipe:**
1. Create two test charts with very high content similarity but
   different filenames — same lyric body + different title. (You
   may need to engineer this carefully; e.g. upload the same PDF
   twice with two different `fileName` metadata values, or use two
   slightly-edited copies of the same chord chart.)
2. Call `dedupe_library_index({dryRun: true})`. Capture the
   computed similarity score for the pair.
3. Engineer pairs at three score points:
   - **score ~0.84** (just-below): two charts with deliberate small
     content drift to drop below threshold. Call
     `dedupe_library_index({})` no-force. Expected: NO dedup
     (below threshold).
   - **score ~0.86** (just-above): two charts with very tight
     content match. Call no-force. Expected: dedup fires (above
     threshold), loser demoted to `status: 'duplicate'`.
   - **score ~0.86 + `force: false`:** same scenario, explicit
     `force: false`. Expected: same as no-force (dedup fires).
   - **score ~0.84 + `force: true`:** explicit override. Expected:
     dedup fires despite being below threshold.
4. Emit findings on:
   - Ergonomics: is `force` confusingly named (e.g. does it imply
     skipping dedup vs forcing dedup)? `usability` finding.
   - Reporting: does dryRun output include the computed scores per
     pair so an operator can decide manually? If not, `mcp_gap` or
     `usability` finding.
   - Boundary correctness: any pair scoring exactly 0.85 — does
     the default dedup or not? Document.

#### §7.B.5 — Trusted-leader rate-limit bypass

Per `feedback_admin_rate_limit_bypass`. Bypass implementation:
`checkUserRateLimit(uid, tier, {bypass: isTrustedLeader(roles)})`.

**Recipe:**
1. Mint three test users via `create_test_account`:
   - one with `role: 'admin'`
   - one with `role: 'band_leader'`
   - one with `role: 'musician'`
2. For each role, hold its test bearer. From each bearer, fire 50
   rapid `publish_setlist({dryRun: true, recipients: [<self>]})`
   calls (or any rate-limited MCP write that's safe under dryRun)
   against a test setlist. Use a 100ms inter-call delay. Capture
   the call index N at which each tier first sees a rate-limit
   error (envelope: `{ ok:false, error: { machine_code: 'rate_limited',
   ... } }`).
3. Expected:
   - `admin`: never rate-limited within 50 calls (bypass active).
   - `band_leader`: never rate-limited within 50 calls (bypass
     active).
   - `musician`: hits the limit at some N < 50.
4. Findings:
   - If `admin` or `band_leader` hits the limit at any N: `BUG-NNN`
     HIGH, `fix_direction: "verify isTrustedLeader gate routes
     admin + band_leader through bypass: true in checkUserRateLimit
     call site"`.
   - If `musician` doesn't hit the limit by N=50: NOTE finding —
     rate limit may be too loose; surface for Daniel discussion.
   - Record exact N values per tier in artifacts.

#### §7.B.6 — `b1` rich error envelope sweep

Cycle-3-specific deep audit of the b1 contract. Already touched
under §7.A but the cycle-3 deep dive is:

1. Sample EVERY MCP tool from `tools/list` (don't sample 5-of-N
   like cycle-2 did — exhaustive here). For each tool, fire at
   least one input that MUST fail validation (e.g. wrong type for
   a required field, out-of-enum value, missing required field).
2. Per response, assert:
   - Top-level `result.isError: true` (MCP validation contract).
   - Payload shape `{ ok: false, error: { code, machine_code,
     message, debug? } }` exactly.
   - `code` is a stable integer/string identifier.
   - `machine_code` is a stable snake_case identifier.
   - `message` is human prose.
   - `debug`, if present in prod, is empty / null / redacted —
     NO file paths, NO stack frames, NO internal field names.
3. Any deviation: `REG-NNN` HIGH against b1.
4. Repeat the same envelope check against `/api/drive/file/[fileId]`
   for various failure modes (missing file, wrong auth, malformed
   fileId). Same shape required at the HTTP layer.

---

## 8. Carried next-cycle inputs (mandatory probes)

From cycle-2's HANDOFF-TO-SUPERVISOR.md "Next-cycle inputs" section,
plus newly-surfaced inputs:

1. **User-draw annotation feature** (b6 cycle-3 survey, 2026-05-17).
   `PDFOverlay.tsx` has a docblock referencing a user-draw annotation
   feature that doesn't appear to be shipped. Probe: in
   Perform-mode browser surface, look for annotation UI affordances
   (pen tool, draw layer, highlight tool, eraser). If absent, emit
   `feature_gap` MED with note that the docblock implies intended
   functionality. If partially present (UI exists but doesn't
   persist), `bug` HIGH.

2. **F-04 substantive HEAD-both-stores verification** — see §7.B.1.

3. **Cycle-2 mime-tagging delta** — see §7.A row. Quantify whether
   the `upload-*` rows with `mimeType: 'application/octet-stream'`
   count has trended down (backfill working) or stayed flat (still
   broken at write side).

4. **Any cycle-2 deferred findings** — read the cycle-2 HANDOFF;
   any finding tagged `daniel_discussion_required: true` that
   cycle-2's supervisor didn't resolve, re-probe and re-surface
   with current evidence.

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
  "surface_cohort": "cycle3-a1-drive-importer | cycle3-a2-reconcile | cycle3-a3-ai-enrich | cycle3-a4-review-ui | cycle3-b1-error-envelope | cycle3-b5-needs-sync | cycle3-b6-uat | cycle3-c2-ai-config | cycle3-other | cycle2-regression",
  "touch_lane": ["src/lib/mcp/tools/reconcile-library.ts", "src/lib/library/enrichment/subscriber.ts"],
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
- `REG-NNN` — regression findings (failed cycle-2 verification)
- `AI-NNN` — AI-enrichment-specific findings (subscriber, cache,
  retry queue, threshold, autoApply gating)

**`surface_cohort` is new in cycle-3.** Tag every finding with the
cohort it belongs to so supervisor can dispatch by surface owner.
Use `cycle3-other` if it doesn't fit one of the named cohorts.

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
  least one for HIGH-severity findings. For AI-enrichment findings,
  include the relevant MCP transcript that captures the
  `enrichmentStatus` transitions.

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
- For AI-enrichment findings: `enrichment-timeline.json`
  documenting per-second `enrichmentStatus` reads from row-create
  to terminal state. Useful for supervisor to triage subscriber
  vs cache vs retry-queue ownership.
- For dedup findings: `score-table.json` listing pairs probed with
  computed similarity score and resulting action.
- For rate-limit findings: `rate-limit-trace.json` with per-call
  index, tier, response shape, and timestamp.
- Any other supporting data: arbitrary file with descriptive name

Keep artifacts small — screenshots compressed, HARs trimmed to the
relevant request range, transcripts trimmed to the relevant calls.
Supervisor's total ingestion budget is bounded.

---

## 11. Execution discipline — phased plan with checkpoints

Run in 6 phases. Write a checkpoint line to `convergence.log` at the
start and end of each phase: `<iso-utc> <phase> <event> <notes>`.
Also write an `a4_pickup_check: <true|false>` field at each phase
boundary recording whether `/manage/library-review` resolved as a
live route at that boundary.

### P0 — Setup + discovery (target 30–60 min)

1. Verify `DRIVER_BEARER` works: `tools/list` should return the
   tool roster. If unauth or 401, abort and have Daniel re-mint.
2. Enumerate the MCP tool surface. For each tool, capture its
   input schema (from `tools/list` response) into
   `artifacts/_mcp-tool-roster.json`. Confirm presence of
   cycle-3-new tools: `reconcile_library`, `get_ai_config`,
   `set_ai_auto_apply`, `set_ai_threshold`. Missing any: `mcp_gap`
   HIGH (regression against the shipped surface).
3. Capture AI baseline: `get_ai_config` → record `threshold` +
   `autoApplyEnabled` to internal state for P5 restore. Save to
   `artifacts/_ai-baseline.json` (NO secrets, just the two values).
4. Enumerate the browser route surface. Crawl from `/`, depth ≤3,
   capture all reachable route paths into
   `artifacts/_browser-routes.json`. Note auth-gated vs public.
   **Explicitly probe** `/manage/library-review` and
   `/api/admin/library-review` — record whether they resolve.
5. Probe `/api/auth/test-session` — does it mint a working session
   for a test user? Record result; informs P2 strategy.
6. Spin 4 test users (admin / band_leader / musician / member) via
   `create_test_account`. Capture their tokens internally; DO NOT
   write them to files. Use these for permission-axis probing AND
   the §7.B.5 rate-limit bypass burst.
7. Build the mutation cross-reference table (browser-exposed
   mutations × MCP-tool equivalents). Save as
   `artifacts/_mutation-matrix.json`. Add columns for cycle-3-new
   surfaces (AI accept/reject, reconcile, AI-config writes).
8. Emit P0 checkpoint to `convergence.log`.

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
  writes, no `force` required. (F-05 — applies to ALL 7 admin tools
  enumerated in §1 rule #2.)
- Role-based access: call each write tool from each of the 4 test
  user roles, verify expected permit/refuse decisions.
- **Rich error envelope (b1) verification — exhaustive, not sample.**
  See §7.B.6 recipe.
- Cycle-3-new tools specific probes:
  - `reconcile_library` — full recipe in §7.B.2.
  - `get_ai_config` — read-only, should never need `force`. Verify
    response shape includes both `threshold` and `autoApplyEnabled`.
  - `set_ai_auto_apply({enabled: true, dryRun: true})` — must NOT
    flip the live config. Verify by re-reading `get_ai_config`
    after.
  - `set_ai_threshold({value: -0.1, force: true})` — out-of-range
    must surface as validation error with rich envelope, NOT silent
    accept.
  - `set_ai_threshold({value: 1.5, force: true})` — same.

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
  4 key routes (`/`, `/library`, `/setlists/<some-test-setlist>`,
  `/perform/<some-test-setlist>`).
- v1 vs v2 namespace tagging on findings.
- **If `/manage/library-review` exists** (a4 dynamic pickup): probe
  it as an admin surface — list view, accept/reject flow on a
  `review_pending` row you engineered in §7.B.3, edit flow, retry
  flow, dismiss flow. Pair-test against `/api/admin/library-review/*`
  HTTP endpoints with raw bearer calls.
- **`/api/auth/test-session` exhaustive probe:** mint sessions for
  each test role, exercise authed-only routes (library, setlists,
  perform, manage), capture HAR + screenshot per role.

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
- Clone setlist (still an open MCP gap from cycle-2; verify cleanly
  whether it shipped or didn't)
- Add track / remove track / reorder tracks
- Edit track field (title / key / vocal_lead / notes)
- Bond / unbond chart from track
- Publish setlist / republish / unpublish (with chartHealth
  inspection including the new `needsSyncCount`)
- Import chart from Drive (test fileId; verify the new
  `source: 'drive_drop'` + `driveMetadata` shape if applicable)
- Upload chart (test PDF, test PNG; AI enrichment fires downstream
  — captured in §7.B.3)
- **Reconcile library** — full §7.B.2 recipe.
- **AI accept/reject** — if a4's library-review surface exists,
  exercise both MCP-side (whatever tools shipped) and browser-side
  (the review UI). Parity-check that an accept from one side is
  reflected on the other.
- **Set AI auto-apply / set AI threshold** — MCP-only writes
  (admin authoring tools); verify no browser equivalent exists or
  flag `mcp_gap` direction-reversed (browser SHOULD expose for
  Daniel admin convenience).
- Dedupe library (with §7.B.4 score-tolerance probes).
- Mint / revoke test token.
- Update template / preset (if templates exist — discover them).
- Change monitor mix bus assignment (monitor MCP exposure may
  still be incomplete; flag as gap if so — Daniel's
  "MCP monitor-mix control" deferred-issue from MEMORY).
- Manage user role (if exposed).

Emit `mutation_parity` findings.
**At P3 boundary** re-check `/manage/library-review` presence; if
it shipped between P0 and now, fold into P3's tail.
Emit P3 checkpoint.

### P4 — Regression probes + cycle-3 hard probes (target 60–90 min)

Execute every row in §7.A (cycle-2 regression sweep) and §7.B
(cycle-3 hard probes). Emit one `regression` finding per failed
§7.A verification, one axis-appropriate finding per §7.B failure.

**Pay extra attention to §7.B.1 (F-04 substantive)** — supervisor
has flagged this as a re-raised question that needs a real answer
this cycle.

**Pay extra attention to §7.B.5 (trusted-leader bypass)** — this is
the first cycle that exercises it directly; cycle-2 didn't probe.

**Pay extra attention to §7.B.6 (b1 envelope)** — the b1 contract is
load-bearing across the entire MCP + drive/file HTTP surface and
this cycle is the first sweep verifying it post-rollout.

Emit P4 checkpoint.

### P5 — Cleanup + final audit (target 30–45 min)

1. **Restore AI baseline:** call `set_ai_threshold({value:
   <baseline_from_P0>, force: true})` and
   `set_ai_auto_apply({enabled: false, force: true})` (defensively
   re-enforce false even if baseline was false). Verify via
   `get_ai_config`.
2. Aggregate stats: total findings by axis, by severity, by phase,
   **by surface_cohort**. Write to `artifacts/_summary.json` (only
   file the supervisor might skim before diving into JSONL).
3. Run `cleanup_all_test_data` from an admin context (NOT a test
   bearer — switch to the original `DRIVER_BEARER`). Verify:
   - `list_test_accounts` returns empty
   - `mcpTestUsers` collection has 0 docs (verify via your admin
     bearer)
   - Test setlists you created are deleted (via the MCP tool you
     used to create them; if there's no `delete_setlist` MCP that's
     itself an `mcp_gap` HIGH finding — and the orphan setlists are
     a `DATA-` cleanup finding).
   - Test charts uploaded during §7.B.1/2/3 are cleaned up via
     whatever path exists. If `processChartUpload` test fixtures
     don't have a cleanup MCP, that's a `GAP-NNN` finding and the
     orphans are a `DATA-NNN` finding. **Do not** call
     `reconcile_library` to clean up — it doesn't delete, it
     restores.
4. **AI-enrichment residue check:** query (or have admin MCP query)
   the `aiEnrichmentCache` collection and the `aiEnrichmentRetryQueue`
   collection. Any residue from test uploads should ideally be
   cleaned; if there's no cleanup path that's an `OPS-NNN` finding
   (cron drains them eventually but explicit-cleanup gap).
5. Write `cleanup-audit.json` with the cleanup result.
6. Emit P5 checkpoint with `event: complete`.

---

## 12. Self-convergence

You may exit early before the 6-8h budget IF and only if:

- All P0 inventories are complete, AI baseline captured.
- P1 covered ≥95% of MCP tools with at least valid-input + role-based
  + envelope-shape probes.
- P2 covered ≥95% of discoverable routes with viewport + console +
  HAR captures, including authed routes via `/api/auth/test-session`
  if that endpoint works.
- P3 covered every row in the mutation matrix, including all
  cycle-3-new mutations (reconcile, AI accept/reject if surface
  exists, AI-config writes).
- P4 ran every §7.A regression probe and every §7.B hard probe
  recipe end-to-end.
- P5 cleanup verified clean, AI baseline restored, no test residue.
- You're past the 4-hour mark.

If any of these are incomplete, keep working until the 8-hour budget.
Don't pad with redundant findings to hit a count target — the supervisor
wants signal density, not volume.

---

## 13. Final-state contract with supervisor

When you exit, the output dir should contain:

```
sheet-music-app-mcp/outputs/autonomous-run/cycle-3/
├── findings.jsonl              # primary output
├── convergence.log              # phase checkpoint log with a4_pickup_check rows
├── cleanup-audit.json           # P5 cleanup result
└── artifacts/
    ├── _mcp-tool-roster.json    # P0 inventory
    ├── _browser-routes.json     # P0 inventory
    ├── _mutation-matrix.json    # P0 inventory
    ├── _ai-baseline.json        # P0 AI config snapshot (threshold + autoApplyEnabled)
    ├── _summary.json            # P5 aggregate stats incl. by surface_cohort
    ├── <FINDING_ID>/
    │   ├── screenshot-*.png
    │   ├── har.json
    │   ├── console.log
    │   ├── mcp-transcript.json
    │   ├── enrichment-timeline.json  # for AI findings
    │   ├── score-table.json          # for dedup findings
    │   ├── rate-limit-trace.json     # for §7.B.5 findings
    │   └── ...
    └── ...
```

That's the supervisor's input. From there, supervisor groups
findings by `surface_cohort` + `touch_lane` + `parallelizable_with`,
runs a Daniel-interview pass on `daniel_discussion_required`
findings, then spins up to 5 Claude Code agents from pre-resolved
scopes.

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
- Cite the relevant standing rule (§1 rules 1–12) in
  `fix_direction` when the finding turns on a rule (e.g. "per F-05
  dryRun discipline, …", "per b1 envelope contract, …", "per
  trusted-leader bypass rule, …").

---

## 15. Begin

Go. Read DRIVER_BEARER above. Verify `tools/list` works. Read the
cycle-2 HANDOFF (path in §0). Then P0. Write your first checkpoint
line to `convergence.log` and start emitting to `findings.jsonl`.
The supervisor will read whenever you exit (or earlier, if Daniel
asks for a progress check).

Good luck.
