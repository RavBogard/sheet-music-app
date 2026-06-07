# Cycle-9 Cowork Sweep — PARENT (shared context for all 5 instances)

**Purpose:** broad whole-app de-risk sweep ahead of band onboarding. 5 focused
cowork instances, each a standalone Daniel-launched session (NOT a bongo coder).
Discovery-not-gating: you REPORT findings, you do not fix.

Each instance: read THIS file first, then your `cycle-9-sweep-instance-N-PROMPT.md`.

---

## §1 — Anchor + environment

- **Probe the DEPLOYED prod surface** at `https://www.centralreform.live`.
- **Record the live SHA** at start: `GET /api/version` → put the `sha` in your
  HANDOFF. Expected base is `edb24a47c` or later.
- **Fix-lanes are in flight concurrently** — three coding lanes are landing on
  master while you probe: cycle-8-fixes (chart-bond cron registration +
  `suggest_band` index DESC fix), cycle-9 hardening A (unit-test baseline), and
  cycle-9 hardening B (trackCount drift-producer). So prod may shift mid-sweep.
  If you hit `suggest_band` 500s, chart-bond cron gaps, or trackCount drift,
  note them but tag `kind:"known-in-flight"` — they're already being fixed; the
  value is confirming the fix landed, OR finding a NEW facet the fix misses.

## §2 — Bearer + auth reality (READ — this bit bites every cycle)

- Your admin bearer is **wired into this cowork session's MCP connection by
  Daniel** (cowork mounts can't read the supervisor pool file — its parent dir
  is outside the mounted folder; cycle-8 confirmed this). If you need the raw
  value for a direct curl probe, Daniel provides it inline at launch. NEVER
  write the raw `crl_live_*` value to any file under `sheet-music-app/`,
  `.coord/`, or any artifact. You CANNOT edit the pool to mark your bearer
  burned — instead note "bearer burned" in your HANDOFF (supervisor flips the
  pool row; it TTL-expires regardless).
- Curl shape (apex→www gotcha + Accept-header gotcha + SSE strip) is in that
  file's header. The endpoint needs `Accept: application/json, text/event-stream`.
- **Harness reality** (`[[feedback_cowork_real_harness]]`): cowork is ~75min
  single-thread, NOT a 6-8h walk-away. `CFC + chrome.debugger` DOES NOT WORK.
  The real browser harness is in-sandbox Playwright at `cycle-4/harness/`
  (reuse `cycle-4/harness/lib/probe.mjs`). `/api/auth/test-session` gives a
  session COOKIE but no Web-SDK auth state (META-003) — so client-data reads
  that need Firebase Web SDK auth won't hydrate; prefer server/MCP surfaces for
  data assertions and use the harness for DOM/layout/interaction observation.
- **Test isolation** (`[[feedback_sandbox_test_isolation]]`): pass your
  `uidPrefix` (= `c9iN`) at `create_test_account` AND the matching prefix at
  `cleanup_all_test_data({prefix:"c9iN"})`. Otherwise you sweep a sibling
  instance's fixtures. Stay in your prefix; never clean another instance's.

## §3 — Verify-before-trust

Per `[[feedback_cowork_prompt_verify_before_write]]`: before asserting a tool/
param/field exists, confirm it against the deployed surface (`tools/list`, a
real call, or `git show origin/master:<file>`). Do NOT assume a tool exists
because a memory or an older spec mentions it. Several "MCP monitor-control" and
"roster scheduling" tools are KNOWN GAPS (not built) — don't probe phantoms;
note the gap as a finding instead.

## §4 — Standing policy (do NOT flag these as bugs/vulns)

- **Chart bytes are public by design** (`[[feedback_chart_access_policy]]`) —
  Daniel's explicit call: charts fetchable by anyone with a `fileId` is intended.
- **Setlist contents on `/perform/setlist/<id>` are public by design**
  (`[[feedback_setlist_public_policy]]`) — track lists, notes, song fields are
  meant to be publicly viewable. Not a PII/security finding.
- **`bridge/**` credentials (CRIT-003) are deferred by Daniel** — out of scope;
  don't rescope.
- Terminology: "**Vocal Lead**" (not "Lead"/"Leader"); rabbi "Led by" is
  distinct. Shul cadence: services **Friday evening + Shabbat morning**, NOT
  Sunday — use realistic setlists when probing.

## §5 — Finding schema + severity

Write findings as JSONL (`cycle-9-instance-N-findings.jsonl`), one object per line:
```
{"id":"C9IN-001","severity":"HIGH|MED|LOW|INFO","kind":"<short-kind>","surface":"<route/tool>","summary":"...","repro":"<exact steps>","observed":"...","expected":"...","evidence":["artifacts/..."],"deployed_surface_verified":true|false}
```
Severity is DISCOVERY signal, not a gate. Tag a finding `kind:"regression-of-shipped-fix"` only if a previously-shipped fix is broken at the deployed surface (this is load-bearing — see §7).

## §6 — Deliverables (per instance)

1. `.paul/research/cycle-9-instance-N-HANDOFF.md` — prose summary, verdict per
   sub-axis, findings table, cleanup verification section (REQUIRED — list every
   fixture minted + its cleanup proof).
2. `.paul/research/cycle-9-instance-N-findings.jsonl`.
3. `.paul/research/cycle-9-instance-N-artifacts/` — transcripts/screenshots/json.
4. Post a HANDOFF-COMPLETE message to `.coord/inbox/supervisor.md` signed
   `from cycle-9-instance-N`, summarizing severity counts + load-bearing items.
5. Mark your bearer row `ASSIGNMENT=burned` if you can reach the pool file; else
   note it in the HANDOFF (it TTL-expires regardless).

## §7 — Soft re-entry rule (what triggers a fixes wave)

The supervisor triages all 5 HANDOFFs into `cycle-9-sweep-TRIAGE.md`. A
**cycle-9-fixes parallel wave auto-revives only if the TRIAGE surfaces ≥3
BLOCKS-GREEN OR any regression-of-shipped-fix.** Otherwise findings route to a
single trailing POLISH lane or the backlog. Tag accordingly so triage is clean.

## §8 — The 5 axes (so you know your neighbors' lanes)

1. Band-facing Perform mode + iPad UX (the band-onboarding axis).
2. Weekly authoring flow end-to-end (Daniel + David's real MCP path).
3. Library / chart management + data integrity.
4. Roster / scheduling + `/monitor` IEM mixing.
5. Security / auth / multi-role / public-vs-private boundaries.

Stay in your axis; cross-axis convergence is the supervisor's job at triage.
