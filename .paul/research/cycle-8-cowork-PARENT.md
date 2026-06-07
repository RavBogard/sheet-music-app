# Cycle-8 Cowork — PARENT spec

**Author:** supervisor
**Date:** 2026-05-19T~21:00Z
**Anchor SHA:** `edb24a47c` — bearer-mint lane shipped + earned auditor ACCEPT
(msg-from-auditor-028, Tier-2 full rigor, root-revocation cascade proven at
prod). Dispatch gate cleared 2026-05-20T~04:35Z. Pre-flight on the 3 new tools
PASSED (shipped Zod schemas match: `mint_admin_bearer({purpose, ttlSec?})`,
`list_minted_bearers({includeRevoked?, includeExpired?})`,
`revoke_minted_bearer({tokenId})`; tools/list confirms all 3 at prod).
**Reads-once contract:** each cycle-8 instance + auditor reads this file once at boot. Per-instance prompts do NOT re-paste anything here.
**Predecessor:** cycle-7 cowork (`.paul/research/cycle-7-cowork-PARENT.md`) — reuse its §3 harness reality verbatim; it has not changed.

---

## §0 — North star

**New-surface stress.** Cycle-8 hammers the code that shipped in cycle-7-fixes +
the bearer-mint lane — the freshest, least-exercised surface, where bug yield is
highest. Two disjoint instances:

1. **New write/credential surface** — bearer-mint security model + template CRUD
   + publish gates under multi-turn agent pressure.
2. **Observability + data-integrity** — web-vitals read tool, chart-bond cron +
   alerts, trackCount drift-heal, orphan baseline, reconcile residuals.

This is deliberately NOT a broad multi-axis sweep and NOT a regression-hold pass
(Daniel's call 2026-05-19). It is a targeted 2-instance probe of what's new.

---

## §1 — Mission roster

| # | Instance | Mission shape | Bearer role | Wall-clock |
|---|---|---|---|---|
| 1 | New write/credential surface | bearer-mint security (depth-1 root-only mint, root-revocation cascade, rate-limit, role-gate, TTL clamp, audit trail) + template CRUD round-trips + publish test-owner/cross-owner gates, all under realistic LLM-intent pressure | `admin` root bearer (mints its own children — dogfoods the feature) | 90 min |
| 2 | Observability + data-integrity | `get_web_vitals_summary` (top-N + surface-filter + admin gate), chart-bond cron + `chart_bond_alerts` (first scheduled tick was 2026-05-21 15:00 UTC — check it fired), `recompute_setlist_track_count` drift-heal, orphan-baseline (24), reconcile `transient`-bucket residuals | `admin` (read-mostly; mutations only on `isTest` fixtures) | 75 min |

**Bearer demand: 1-2 admin roots.** Cycle-8 DOGFOODS `mint_admin_bearer`:
Instance 1 takes ONE Daniel-handed root admin bearer and mints its own working
children via the new tool (that IS part of its mission). Instance 2 needs one
admin bearer (root or a child minted by Instance 1, Daniel's choice). At
dispatch, pool depth permitting, hand 1 root per instance; if the pool is thin,
1 root for Instance 1 + 1 Instance-1-minted child for Instance 2.

---

## §2 — Bearer + sandbox policy

Same mechanics as cycle-7 PARENT §2. uidPrefix discipline per `[[feedback_sandbox_test_isolation]]`:

| Instance | uidPrefix |
|---|---|
| 1 | `c8i1` |
| 2 | `c8i2` |

Lowercase, ≤6 chars. Every `create_test_account` passes its `uidPrefix`; cleanup uses `cleanup_all_test_data({uidPrefix:"c8iN"})`. Do NOT copy bearer values into any file under `sheet-music-app/` (tracks to git). Burn each bearer in HANDOFF; Daniel revokes post-wave (or use `revoke_minted_bearer` for Instance-1-minted children — cleaner than waiting on Daniel).

---

## §3 — Harness reality

**Read cycle-7 PARENT §3 verbatim** (`.paul/research/cycle-7-cowork-PARENT.md` lines 60-81). Unchanged for cycle-8. Key reminders:
- In-sandbox Playwright at `cycle-4/harness/lib/probe.mjs`. CFC + chrome.debugger is dead.
- Web-SDK auth MANDATORY when probing client listeners (`firebaseAuth: getAuth()` into `mintSession`).
- Absolute CWV impossible in sandbox; use `webVitalsObservations` collection (or the new `get_web_vitals_summary` tool) for real-user numbers.

Boot pre-flight (HARD-BLOCK on bearer rejection / missing probe.mjs / **missing bearer-mint tools** — if `mint_admin_bearer` isn't in `tools/list` at your dispatch SHA, the dispatch gate failed; BLOCKER supervisor + stop):
```
- read package.json + assert next.js version
- tools/list bearer probe → confirm mint_admin_bearer + list_minted_bearers + revoke_minted_bearer present (Instance 1) / get_web_vitals_summary + recompute_setlist_track_count present (Instance 2)
- create_test_account({uidPrefix, role}) sanity mint+revoke
```

---

## §4 — Output shape

Each instance writes:
1. `.paul/research/cycle-8-instance-<N>-HANDOFF.md` — structured findings, severity-only tags (HIGH/MED/LOW/INFO), per-finding deployed-surface evidence.
2. `.paul/research/cycle-8-instance-<N>-findings.jsonl` — one finding/line (schema = cycle-7 PARENT §4).
3. `.paul/research/cycle-8-instance-<N>-artifacts/` — transcripts, screenshots, sanitized excerpts.
4. One ACK + one HANDOFF-COMPLETE message to `.coord/inbox/supervisor.md` signed `from cycle-8-instance-<N>` (NOT `coder-<N>` — these cowork instances are standalone Daniel-launched sessions, distinct from the bongo Claude Code coders that get `.coord/inbox/coder-N.md` dispatches). Cite findings count + load-bearing IDs; finding ID prefix `C8I<N>-NNN`.

---

## §5 — Standing rules

Binding for both instances (disobedience → auditor BLOCK at TRIAGE):
1. **No mutate prod** beyond `isTest:true` / `test-`/`c8iN-`-prefixed fixtures cleaned up in HANDOFF. Instance 2 is read-mostly. NEITHER instance calls `publish_setlist` to real recipients (test-owner/cross-owner GATE probing uses test fixtures + dryRun only).
2. **No probe of** `bridge/**`, repo-root `mcp/`, `SetlistGrid.tsx`, `src/lib/mcp/errors.ts`, `src/lib/mcp/error-envelopes.ts`.
3. **No worktree, no branch, no ship.** Probe roles. Output is the HANDOFF, not a commit.
4. **Cleanup before HANDOFF.** Every mint matched by cleanup: `create_test_account`→`cleanup_all_test_data`; `create_template_from_setlist`/`clone_setlist_from_template`→`delete_template`/`delete_setlist({force:true})`; `mint_admin_bearer`→`revoke_minted_bearer`. Verify zero residual `test-*` / `c8iN-*` / minted-child tokens before HANDOFF-COMPLETE.
5. **Deployed-surface evidence mandatory** for every load-bearing finding per AUDITOR.md §Validation workflow. Emulator-shape PASS does NOT close a finding. Inline `## Repros` with prod-SHA-stamped transcript, or explicit "needs auditor deployed-surface verify" annotation.
6. **Stay in your lane.** Cross-lane regression-sweep is the auditor's job.

**Special bearer-mint discipline (Instance 1):** when stress-testing the
credential surface, you WILL mint real (non-test) admin children. Every minted
child MUST be revoked via `revoke_minted_bearer` before HANDOFF — a leaked
working admin bearer in a HANDOFF artifact is a security incident. Never write a
raw minted `crl_live_*` value into any HANDOFF/artifact/`.coord/` file.

---

## §6 — Soft re-entry rule

Per cycle-7 Decision 3: post-green default = single-lane trailing work.
Parallel-wave mode auto-revives only if cycle-8 TRIAGE surfaces **≥3
BLOCKS-GREEN** OR **any regression-of-shipped-fix**. The bar is high.

---

## §7 — Dispatch gate (supervisor checklist before pasting instance prompts)

1. coder-2 bearer-mint lane shipped + auditor ACCEPT landed.
2. ~~Fill anchor SHA~~ DONE — `edb24a47c`.
3. **Re-run the 5-item cowork pre-flight** (SUPERVISOR.md §Cowork prompt pre-flight) against the ship SHA — specifically confirm `mint_admin_bearer`, `list_minted_bearers`, `revoke_minted_bearer` + their params match the deployed Zod schemas (they were spec'd, not yet deployed, when this PARENT was written).
4. Assign bearers per §1; confirm pool depth.
5. Paste instance prompts into 2 coder tabs; auditor reads this PARENT once.

---

## §8 — Auditor handoff

Auditor reads this PARENT once, validates 2 HANDOFFs as they land. TRIAGE into `.paul/research/cycle-8-TRIAGE.md` after both instance-COMPLETE messages. Green-gating at TRIAGE, not discovery. Cycle-8-fixes wave opens only on the §6 auto-revive bar.

---

*from supervisor*
