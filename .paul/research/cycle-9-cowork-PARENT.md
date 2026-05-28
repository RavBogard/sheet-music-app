# Cycle-9 Cowork — PARENT spec (post-fix verification sweep)

**Author:** coder-5 (lane `cycle-9-cowork-prompt-design`, dispatched by supervisor `msg-cycle-9-cowork-prompt-design-001`)
**Date:** 2026-05-27T~23:15Z
**Anchor SHA:** `97c294c621` — harness Lane C landed (MCP probes + Cat-F/I/J specs + axe wiring; DESIGN gaps closed). This is the pre-stage trigger the dispatch named ("fires when coder-7's harness Lane C lands"). Lane C is LANDED → cycle-9 is ready to dispatch on the §7 schedule.
**Reads-once contract:** each cycle-9 instance + the auditor reads this PARENT once at boot. Per-instance prompts do NOT re-paste anything here.
**Predecessors:**
- Last full cowork = the **2026-05-26 two-surface run** (`.paul/research/cowork-stress-test-2026-05-26/PROMPT-mcp-stress-test.md` + `PROMPT-web-stress-test.md`). Reuse its category structure + report schema verbatim where unchanged. Instance ids `cowork-mcp-20260526a` (14 findings) + `cowork-web-20260526a` (12 findings); the auditor independently verified 5 of the MCP findings in `.coord/audits/cowork-mcp-2026-05-26-VERIFY.md`.
- The cowork PROMPT/PARENT *shape* convention comes from `.paul/research/cycle-8-cowork-PARENT.md` (the last numbered cowork PARENT, 2026-05-19).

> **⚠️ NAMING — read before you touch any file.** A *different* effort already
> burned the bare `cycle-9-*` namespace: `cycle-9-sweep-PARENT.md`,
> `cycle-9-sweep-instance-1..5-PROMPT.md`, `cycle-9-instance-1..5-HANDOFF.md`,
> `cycle-9-fixes-lane-*` and `cycle-9-hardening-lane-*` all exist in
> `.paul/research/` from a 2026-05-24 sweep. **This cowork run namespaces
> everything `cycle-9-cowork-*`** to avoid clobbering those artifacts. Instance
> HANDOFFs go to `cycle-9-cowork-instance-<N>-HANDOFF.md` (NOT
> `cycle-9-instance-<N>-HANDOFF.md`, which already exist). If the supervisor
> prefers renumber-to-cycle-10, that's a one-line rename of these two files
> before the sweep fires — flag it.

---

## §0 — North star

**Post-fix verification, not broad discovery.** Today's fix wave (2026-05-27) shipped
fixes for ~9 MCP findings + web-a11y + data-health. Cycle-9's job is to **prove those
fixes stuck on the deployed surface, catch any regressions, and exercise the brand-new
harness coverage (Cat-F authoring / Cat-I role-matrix / Cat-J axe / Cat-M MCP probes)
that didn't exist when the 5/26 findings were filed.**

This is deliberately a **regression-confirmation pass with a thin new-coverage rim**, not
a from-scratch multi-axis hunt. The bar for opening a cycle-9-fixes wave is high (§6).

The verification model has changed since cycle-8: the **`npm run stress` harness
(`cycle-4/harness/`, Lanes A+B+C all landed)** now carries the deterministic web + MCP-probe
load and emits a cowork-shape REPORT. So cycle-9 is a **hybrid**:

- **Deterministic regression** rides the harness. Each shipped fix is modeled as a
  harness PROBE (a passing spec/probe = fix holds = no finding; a `FINDING`-annotation or
  failure = regression surfaced).
- **Judgement-heavy regression** (MCP authoring round-trips, dual-read coherence, the
  dedupe-apply canonical picker, the known-open FU-1 envelopes) rides a cowork-Claude MCP
  instance — the part the harness can't fully replace.

---

## §1 — Mission roster + instance-split recommendation

**Recommendation to supervisor: ship Instance 1 now (delivered alongside this PARENT);
defer the Instance-2 decision until a harness baseline run exists.**

| # | Instance | Surface | Vehicle | Bearer role | Wall-clock | Status |
|---|----------|---------|---------|-------------|-----------|--------|
| 1 | **MCP post-fix verification + Cat-M** | `/api/mcp` | cowork-Claude over JSON-RPC + drives `npm run stress --surface=mcp` for the Cat-M probe baseline | `admin` root bearer (Daniel-pasted) | 75 min | **PROMPT delivered: `cycle-9-cowork-instance-1-PROMPT.md`** |
| 2 | **Web/iPad residual + CFC-only gaps** | website / iPad | PROPOSED — see below | `band_leader` or `admin` (UI) | 60 min | **NOT written yet — supervisor decides post-baseline** |

**Why this split (not the 5/26 mcp+web symmetric pair):** the 5/26 web PROMPT's
categories A,B,C,D,E,H,I,J are now **directly covered by `npm run stress`** (the harness
README maps every one to a spec). Re-running them as a *manual cowork-Claude web session*
duplicates the harness. The right cycle-9 web step is **operational**: fire
`npm run stress --categories=A,B,C,D,E,F,H,I,J,K,L,S --bearer=<admin>` and triage the
emitted REPORT — that IS the web regression pass. A second *cowork* instance is only
warranted for the residual **harness-documented gaps** (Cat-N monitor surface UI, Cat-G
iPad ergonomics) that have no Playwright spec and need CFC eyes — and for the **bus5
master-mute visual confirm** (`70e59b8a65`, monitor surface = Cat-N, CFC-only). Those are
low-yield; recommend the supervisor only spin Instance 2 if the harness baseline REPORT
or the live monitor surface warrants it.

**Bearer demand: 1 admin root** for Instance 1 (Daniel-pasted at fire, per
`[[feedback_supervisor_bearer_persistence]]` the supervisor can source it via
`node scripts/supervisor-prod-bearer.mjs`). Instance 2 (if spun) needs a UI session, not a
bearer.

---

## §2 — Bearer + sandbox policy

Same mechanics as cycle-8 PARENT §2 + the 5/26 MCP PROMPT "Setup" section. uidPrefix
discipline per `[[feedback_sandbox_test_isolation]]`:

| Instance | uidPrefix |
|----------|-----------|
| 1 | `c9i1` |
| 2 (if spun) | `c9i2` |

Lowercase, ≤6 chars. **★ The create-side param is `uidPrefix`; the cleanup-side param is
`prefix` — same value, different name** (verified against source 2026-05-26, still true at
`97c294c621`). Every `create_test_account({role, uidPrefix:"c9i1"})` is matched by
`cleanup_all_test_data({prefix:"c9i1"})`. **NEVER** call `cleanup_all_test_data` without a
`prefix` (sweeps sibling sessions per `[[feedback_self_inclusion_test_fixtures]]` +
`[[feedback_sandbox_test_isolation]]`). The harness's own role-gate probe uses uidPrefix
`stress-c7-` and revokes by uid — do not collide with `c9i1`.

Do NOT copy any `crl_live_*` bearer value into any file under `sheet-music-app/` (tracks
to git). Burn bearers in the HANDOFF only as `crl_live_***redacted***`. Daniel revokes the
root post-wave (or use `revoke_minted_bearer` for any Instance-1-minted children).

---

## §3 — Harness reality

**Read the 5/26 MCP PROMPT "Envelope-shape contract" + cycle-7 PARENT §3 verbatim.**
Unchanged. Plus the NEW harness reality (Lanes A+B+C, all on master at `97c294c621`):

- **One-command web+MCP matrix:** `npm run stress` (`cycle-4/harness/README.md` is the
  authoritative usage + category→spec map). `--surface=web|mcp|both`, `--categories=...`,
  `--bearer=...`, `--projects=...`, `--dry-run`, `--fail-on=...`. Report lands at
  `cycle-4/harness/out/REPORT-stress-<run-id>.md` (gitignored).
- **iPad fidelity:** Playwright `ipad-webkit` (820×1180 WebKit) + `-landscape`. CFC does
  NOT replicate iPad viewport/offline/long-press/role-gate — reach for `npm run stress`
  for those, CFC only for the documented Cat-N/Cat-G gaps.
- **MCP probes (Cat-M):** `--surface=mcp|both` runs `cycle-4/harness/probes/*.mjs` →
  `scripts/probe-batch.mjs` → JSONL → emitter Category-M findings. The 4 Lane-C probes
  (verified present at `97c294c621`): `server-tools-list.mjs` (registry floor 50;
  baseline 108), `get-bridge-health.mjs` (envelope shape, NOT online-assert),
  `list-setlists.mjs` (≥1 row floor), `role-gate-musician-refusal.mjs` (mints
  `test-musician-*` uidPrefix `stress-c7-`, confirms admin-gated refusal, revokes by uid).
- **Web-SDK auth** is mandatory when probing client listeners (`mintSession` in
  `lib/probe.mjs`). `/api/auth/test-session` gives a cookie but no Web-SDK auth state
  (META-003) per `[[feedback_cowork_real_harness]]`. Cowork is ~75 min single-thread, NOT
  a 6-8h walk-away.

**Boot pre-flight (HARD-BLOCK on any failure → BLOCKER supervisor + stop):**
```
- read package.json + assert next.js version (sanity the deployed target)
- tools/list → confirm registry non-empty + the 9 fix-touched tools present:
  upload_chart, get_song, add_track_to_setlist, get_setlist, dedupe_library,
  salvage_chart_bytes, backfill_track_mimetype, archive_nonchart_artifacts, update_song
- create_test_account({uidPrefix:"c9i1", role:"musician"}) sanity mint, then
  cleanup_all_test_data({prefix:"c9i1"}) sanity sweep — confirm the param-name asymmetry
- (web instance only) `npm run stress -- --dry-run` resolves the spec plan
```

---

## §4 — Regression-PROBE matrix (the heart of cycle-9)

Each shipped fix becomes a PROBE row. **A PROBE that behaves as the fix intended produces
NO finding** (it counts toward "probes executed"); a deviation produces a finding. This is
the harness `FINDING`-annotation model: model these so a green run is silent. All SHAs +
source paths below are verified against `origin/master` `97c294c621` per
`[[feedback_cowork_prompt_verify_before_write]]`.

| ID | Fix (SHA) | Deployed surface (verified) | PROBE — pass = silent | Finding if… |
|----|-----------|------------------------------|------------------------|-------------|
| R-F001 | isError propagation (`1b2d5e0556`) | `src/lib/mcp/tools/index.ts` jsonResult region | a tool that errors returns `result.isError:true` + prose (NOT JSON-RPC `-32602`) | error swallowed, or `-32602` shape, or `isError` missing |
| R-F005 | dedupe honesty (`1b2d5e0556`) | `src/lib/mcp/tools/library.ts:983-991` (`wouldMark`/`committed`) | `dedupe_library({dryRun:true})` returns `wouldMark:N, committed:0`; refused real-run also `committed:0` | `committed>0` on dryRun/refused, or `duplicatesMarked` legacy field returns |
| R-F007 | salvage prose (`1b2d5e0556`) | `src/lib/mcp/tools/salvage-chart-bytes.ts` | `salvage_chart_bytes` refusal prose names NO `library_index/{id}` internal path | prose leaks a Firestore doc path / internal field |
| R-F008 | backfill force honesty (`1b2d5e0556`) | `src/lib/mcp/tools/backfill-track-mimetype.ts:132` (`forceWithoutCommit`) | `backfill_track_mimetype({force:true})` (no `dryRun:false`) reports `forceWithoutCommit:true` + writes 0 | `{force:true}` alone silently commits |
| R-F010 | Unicode dedup (`d2c4936197`) | `src/lib/library/recompute-index-name-fields.ts:79-82` (`/[^\p{L}\p{N}]/gu` + NFKC) | upload Hebrew / Arabic / emoji titles → distinct `normalizedName`; no false fuzzy-collide | two distinct non-Latin titles collapse to the same key / falsely dedup |
| R-F015 | input sanitize (`1b2d5e0556`) | `src/lib/mcp/server-tracks-write.ts` | `update_track` notes/title with control-char/null-byte → stripped cleanly, no 500/stack | 500, stack trace, or silent corruption |
| R-F016 | catalog dual-read write (`c71f41bed4` + `library-upload.ts:158/164` songDefaults→`applySongMetadata`) | `src/lib/mcp/tools/song-metadata.ts` `applySongMetadata` | `upload_chart({key,bpm})` then `get_song` shows key/bpm (reaches `songs/{id}.defaults`, not just `library_index`) | `get_song` key/bpm null after upload (the original F-016 bug) |
| R-F017 | bond bpm denorm (`c71f41bed4`) | `src/lib/mcp/server-songs.ts:20,122,125` (`bpm` on `ResolvedTrackBond`) | bond an uploaded chart onto a fixture setlist → `get_setlist` track row carries key AND bpm | bonded row missing bpm (or key, for an upload-only song) |
| R-arch | bulk soft-archive (`5c0674ab9a`) | `archive_nonchart_artifacts` registered `index.ts:1706`; reconcile skips `archived` | `archive_nonchart_artifacts({dryRun:true})` is idempotent; a 2nd identical call reports same candidate set; archived rows vanish from `reconcile_library` scan | non-idempotent, or archived rows still appear in reconcile |
| R-dedup | canonical picker (`d4c441f8fb`) | `src/lib/mcp/tools/library.ts` `isGoogleAppsMime` predicate | in a dup group with a PDF + a Google-Doc, `dedupe_library({dryRun:true})` picks the **real-bytes PDF** as canonical, demotes the Google-Doc | Google-Doc wins canonical over a real-bytes PDF |
| R-web-a11y | WCAG AA contrast (`aba6a6a2a6` + `e1e1d12bbc`) | Perform/editor + SaveOffline accents | `npm run stress --categories=J` (axe) → 0 contrast/aria violations on Perform + editor | axe flags a contrast / aria-prohibited-attr regression |

**Known-OPEN (document as findings, keep noise low — DO NOT fix):** the FU-1 queue
(`mcp-envelope-httpcode-reclass`, P3) is not yet shipped. If a Cat-A envelope probe hits
F-006 (force_required standardization) / F-002 (lyric-search HOLD-C) / F-014 / F-010-code-2
(HTTP-code reclass), record ONE INFO-severity row each citing the QUEUE.md item — don't
re-litigate; they're tracked.

---

## §5 — New-coverage rim (Cat-F / Cat-I / Cat-J / Cat-M)

These are the brand-new Lane-C surfaces; cycle-9 is their first cowork exercise.

- **Cat-F authoring** (`e2e/authoring-stress.spec.ts`): STRESS-TEST-* scratch-setlist flow
  per the amended web PROMPT (`b38c5f8276` allows Daniel-owned `STRESS-TEST-*` setlists).
  Harness covers the web side; the MCP instance covers the authoring round-trip
  (`upload_chart`/`save_scraped_chart` → `get_song` → bond → `get_setlist`).
- **Cat-I role-matrix** (`e2e/role-gate-matrix.spec.ts`): 3-of-4 roles
  (band_leader / musician / member) via the Lane-B `roleGate.as()` fixture. **Admin tier
  is DEFERRED** (priv-esc guard on `create_test_account`'s `TEST_ROLE` not weakening;
  decision 2026-05-27). The admin-test-session surface is a separate Daniel-gated lane;
  cycle-9 does NOT depend on it.
- **Cat-J axe** (`e2e/axe-stress.spec.ts` + `lib/runAxe.mjs`): a11y on the post-fix
  surface. Doubles as R-web-a11y above.
- **Cat-M MCP probes** (`cycle-4/harness/probes/*.mjs`): run `--surface=mcp` for the 4
  read-mostly probe baseline; the cowork instance adds the deeper write-path regression
  rows from §4 that the static probes don't cover.

---

## §6 — Output shape

Each instance writes:
1. `.paul/research/cycle-9-cowork-instance-<N>-HANDOFF.md` — structured findings,
   severity-only tags (BLOCKER/HIGH/MED/LOW/INFO), per-finding deployed-surface evidence.
   **Finding ID prefix `C9I<N>-NNN`.** Lead with a **regression-status table** (one row
   per §4 PROBE: HELD / REGRESSED / N-A) before any new findings.
2. `.paul/research/cycle-9-cowork-instance-<N>-findings.jsonl` — one finding/line
   (schema = cycle-7/8 PARENT §4).
3. `.paul/research/cycle-9-cowork-instance-<N>-artifacts/` — transcripts, sanitized
   excerpts, the `npm run stress` REPORT copy if the instance ran it.
4. One ACK + one HANDOFF-COMPLETE message to `.coord/inbox/supervisor.md` signed
   `from cycle-9-cowork-instance-<N>` (NOT `coder-<N>` — these are standalone
   Daniel-launched cowork sessions, distinct from the bongo coders). Cite findings count +
   load-bearing IDs + the regression verdict (all-HELD vs N-regressed).

---

## §7 — Standing rules + ship-freeze

Binding (disobedience → auditor BLOCK at TRIAGE):
1. **No mutate prod** beyond `isTest:true` / `c9iN-`-prefixed fixtures cleaned up in
   HANDOFF. NEITHER instance calls `publish_setlist` to real recipients (gate-probe via
   test fixtures + `dryRun:true` only).
2. **No probe of** `bridge/**`, repo-root `mcp/`, `SetlistGrid.tsx`,
   `src/lib/mcp/errors.ts`, `src/lib/mcp/error-envelopes.ts`. **No live X32 writes** unless
   `get_bridge_health` returns `x32Connected:true` AND Daniel confirms the desk is
   intentionally on — probe monitor tools at the validation-envelope layer only.
3. **No worktree, no branch, no ship.** Probe roles. Output is the HANDOFF.
4. **Cleanup before HANDOFF.** Every `create_test_account`→`cleanup_all_test_data({prefix})`;
   every `upload_chart`→`delete_chart`; every template/clone→`delete_template`/`delete_setlist({force:true})`;
   every `mint_admin_bearer`→`revoke_minted_bearer`. Verify zero residual `c9iN-*` /
   `test-*` / minted-child tokens before HANDOFF-COMPLETE.
5. **Deployed-surface evidence mandatory** for every load-bearing finding per AUDITOR.md
   §Validation workflow. Emulator-shape PASS does NOT close a finding. Inline `## Repros`
   with prod-SHA-stamped transcript.
6. **Stay in your lane.** Cross-lane regression-sweep is the auditor's job.

**★ SHIP-FREEZE — Saturday 2026-05-30 is the bar-mitzvah service.** The cycle-9 sweep RUN
MUST NOT fire during the live service window. **Recommend dispatching the sweep post-service
Saturday afternoon or Sunday.** (This PARENT + the instance PROMPT are docs — safe to land
now; only the RUN is freeze-gated.)

---

## §8 — Dispatch gate (supervisor checklist before pasting the instance prompt)

1. Harness Lane C landed (`97c294c621`) ✓ (DONE — that's this anchor SHA).
2. Confirm the 9 fix-touched tools still in `tools/list` at the dispatch SHA (re-run the
   §3 pre-flight — the surface may advance past `97c294c621` before the sweep fires).
3. Source 1 admin root bearer (`node scripts/supervisor-prod-bearer.mjs`); hand to
   Instance 1 at fire.
4. Confirm the ship-freeze window is clear (post-Saturday-service).
5. Paste `cycle-9-cowork-instance-1-PROMPT.md` into one cowork tab; auditor reads this
   PARENT once.
6. **Decide Instance 2** only after Instance 1's HANDOFF + a `npm run stress` web baseline
   REPORT exist — spin it solely for the harness-documented Cat-N/Cat-G gaps + bus5 visual
   if those warrant CFC eyes.

---

## §9 — Auditor handoff

Auditor reads this PARENT once, validates the instance HANDOFF(s) as they land. TRIAGE into
`.paul/research/cycle-9-cowork-TRIAGE.md` after the HANDOFF-COMPLETE message(s).
Green-gating at TRIAGE, not discovery.

**§6-equivalent soft re-entry / fixes-wave bar:** a cycle-9-cowork-fixes wave opens only if
TRIAGE surfaces **≥1 REGRESSED §4 PROBE** OR **≥3 BLOCKS-GREEN new findings**. A clean
all-HELD regression table + only INFO/LOW new findings = green, no wave. (The known-open
FU-1 INFO rows do NOT count toward the bar.)

---

*from coder-5*
