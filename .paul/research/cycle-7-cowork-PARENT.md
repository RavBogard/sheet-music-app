# Cycle-7 Cowork — PARENT spec

**Author:** supervisor
**Date:** 2026-05-19T~23:00Z
**Anchor SHA:** `59b25c87a` (master tip per `.coord/shared/master-tip.md`)
**Reads-once contract:** every cycle-7 instance + auditor reads this file once during boot. Per-instance prompts do NOT re-paste anything here.
**Source recon:** `.paul/research/cycle-7-recon-{A,B,C}-*.md` (2026-05-19).

---

## §0 — North star

**UX bulletproofing of editor + generator → live usage.** Cycle-7 is the first cycle that explicitly probes the real product surface end-to-end: David authoring under multi-turn pressure, the in-app editor / library UI that Daniel hasn't touched in weeks per `[[user_mcp_is_primary_author_workflow]]`, concurrent edits + live-edit propagation to the band-stand, and production data drift.

This is **NOT** another ABCD-mirror regression sweep. Cycle-7 explicitly drops the Daniel-shadow / David-shadow / unauth / wide-domain quadrant (rejected per Agent C §8.1) and replaces it with four disjoint mission shapes plus one contrarian.

**The four disciplined missions cover surfaces cycle-5/6 structurally missed.** The contrarian instance is the cheapest test of Daniel's "the test became predictable" hypothesis (Agent C §9).

---

## §1 — Mission roster

| # | Instance | Mission shape | Bearer role | Wall-clock |
|---|---|---|---|---|
| 1 | MCP multi-turn weekly-flow | David's Tuesday clone-edit-clone-edit-publish loop under 5–8 LLM turns; tests Lane 2 template MCP under realistic English-intent pressure | `band_leader` | 90 min |
| 2 | In-app editor + library UI deep-walk | iPad-emulated Playwright walks `/setlists/[id]`, `/library` (incl. `UploadDialog` + `ScraperModal`), `/manage/templates`, `/perform/setlist/[id]` UI side | `band_leader` | 110 min |
| 3 | Multi-user concurrency + live-edit propagation | Two parallel band_leader **test sessions** (minted from a single admin bearer); concurrent `add_track_to_setlist` race + observation of the real live-edit primitive — `wait_for_setlist_change` (server-side long-poll) + the `useSetlistPerformance` Dexie-backed Firestore snapshot listener on the iPad client. (`api/setlists/notify-updated` is the in-app notification fanout endpoint — toast/badge — NOT the live-edit listener path; corrected per Instance 3 HANDOFF + Lane 4 sub-task E.) | 1 admin bearer → 2 band_leader test sessions | 75 min |
| 4 | Real-data read-only probe | Zero-mutation inspection of production `setlists/`, `library_index`, `aiEnrichmentCache`, orphan-baseline drift from 272 | `admin` (read-only discipline) | 60 min |
| 5 | Contrarian narrative | 60-min freeform "find the most user-painful broken thing"; ≤25-line prompt; no scaffolding; HANDOFF as prose, not JSONL | `band_leader` | 60 min |

**Plus separate non-cowork pillar:** Daniel iPad-mini Friday-evening shadow walk per `.paul/research/cycle-7-ipad-shadow-CHECKLIST.md`. Tracks as a UAT-PENDING row, not as a cowork instance.

**Total bearer demand:** **5 admin `crl_live_*` bearers** — one per instance. Pre-assigned from the existing pool at `C:\Users\dsbog\.claude\projects\C--Users-dsbog-centralreform-live\.supervisor-bearers` (rows `ASSIGNMENT=cycle-7-instance-1..5`). No Daniel-mint required for cycle-7 — pool depth was sufficient at dispatch time. Instance 3 mints 2 band_leader **test sessions** from its single admin bearer via `create_test_account`.

---

## §2 — Bearer + sandbox policy

**Each instance reads its pre-assigned bearer from the pool file.** No bearer is re-used across instances. Each coder finds the row matching `ASSIGNMENT=cycle-7-instance-<N>` in `C:\Users\dsbog\.claude\projects\C--Users-dsbog-centralreform-live\.supervisor-bearers`, uses that `crl_live_*` value as MCP Authorization, and on HANDOFF-COMPLETE marks the row `ASSIGNMENT=burned`.

**Important:** the bearer pool is gitignored-by-location (outside any repo). Do NOT copy bearer values into `.coord/` files or anywhere under `sheet-music-app/` — those track to git.

**uidPrefix discipline per `[[feedback_sandbox_test_isolation]]`:**

| Instance | uidPrefix |
|---|---|
| 1 | `c7i1` |
| 2 | `c7i2` |
| 3a | `c7i3a` |
| 3b | `c7i3b` |
| 4 | (none — read-only, no fixtures created) |
| 5 | `c7i5` |

Lowercase, ≤6 chars per the shipped regex (`a42fd8a47` Lane 6). Every `create_test_account` call passes its `uidPrefix`; cleanup uses `cleanup_all_test_data({prefix: "c7iN..."})`.

**Bearer revoke on instance close:** each instance burns its bearer in HANDOFF.md. Daniel revokes via `/settings/mcp` post-wave.

---

## §3 — Harness reality (read once, don't re-derive)

This is the consolidated set of harness facts per `[[feedback_cowork_real_harness]]`. Instance prompts do NOT re-explain these.

- **In-sandbox Playwright** lives at `cycle-4/harness/lib/probe.mjs` + `cycle-4/harness/scripts/`. Survival-guaranteed at master (cycle-5 Lane 6 ship `a42fd8a47`).
- **Session minting:** `probe.mjs::mintSession` POSTs to `/api/auth/test-session`, returns `__session` cookie + (since META-003 `8fec5291f`) `customToken` for Web-SDK Firebase Auth wiring.
- **Web-SDK auth (MANDATORY when probing client listeners).** Pass `firebaseAuth: getAuth()` into `mintSession`. Without it, `onSnapshot` / `congregation-store` / `notify-updated` listeners run unauthenticated and silently no-op. Capability is GREEN-if-wired (B §1 row g); prompts forget; cycle-7 will NOT forget.
- **CFC + chrome.debugger is dead.** Do not attempt. Default-route to in-sandbox Playwright.
- **Absolute CWV measurement is impossible** (sandbox = datacenter egress). Relative throttle comparison is fine; absolute "real-iPad-on-shul-wifi" RTT is structurally out of reach. Use `webVitalsObservations` Firestore collection for real-user data when you need absolute numbers.
- **PDF byte-diff has no general probe.** Open inline, compare structural shape (page count, embedded font list, byte length). Don't waste time building a generic differ.

**Boot expectations:**

```
- read package.json + assert next.js version → ~2 min
- list_library({limit:1}) bearer probe → ~1 min
- find probe.mjs + verify shape → ~3 min
- create_test_account({uidPrefix, role}) sanity mint+revoke → ~3 min
- HARD-BLOCK on bearer rejection or missing probe.mjs; DEGRADED-OK on absent scripts/
```

If pre-flight finds a tool/route/file the prompt cites missing AT YOUR DISPATCH SHA, post a BLOCKER to `.coord/inbox/supervisor.md` and stop. Don't synthesize a workaround — supervisor failed pre-flight if this happens.

---

## §4 — Output shape

Each instance writes:

1. **`.paul/research/cycle-7-instance-<N>-HANDOFF.md`** — structured findings + per-finding evidence. Severity-only tags (HIGH/MED/LOW/INFO). NO `BLOCKS-GREEN` or `POLISH` tagging at discovery — green-gating happens at TRIAGE per ratified amendment (Decision 1 below).
2. **`.paul/research/cycle-7-instance-<N>-findings.jsonl`** — one finding per line, machine-readable.
3. **`.paul/research/cycle-7-instance-<N>-artifacts/`** — screenshots, network HARs, sanitized PDF excerpts.
4. **One ACK + one SHIP-NOTICE-equivalent message** to `.coord/inbox/supervisor.md` signed `from coder-<N>`. SHIP-NOTICE-equivalent for probe instances is the HANDOFF-COMPLETE message (no commit SHA; cite findings count + load-bearing finding IDs).

**Finding schema (JSONL row):**

```json
{
  "id": "C7I1-001",
  "severity": "HIGH" | "MED" | "LOW" | "INFO",
  "surface": "<route/tool/component>",
  "summary": "<one-line>",
  "repro": "<verbatim steps>",
  "observed": "<what happened>",
  "expected": "<what should happen>",
  "evidence": ["<artifact paths>"],
  "instance": <N>
}
```

**Contrarian instance (5) is exempt** — its HANDOFF is freeform prose per Agent C §9. No JSONL. Severity tags optional.

---

## §5 — Standing rules

Binding for all 5 instances. Disobedience surfaces as auditor BLOCK at TRIAGE.

1. **No mutate prod.** Instance 4 is explicitly read-only. Instances 1, 3, 5 write only `isTest:true` / `test-`-prefixed fixtures cleaned up in HANDOFF. Instance 2 reads UI but does not `publish_setlist` to real recipients.

2. **No probe of `bridge/**`, repo-root `mcp/`, `SetlistGrid.tsx`, `src/lib/mcp/errors.ts`, or `src/lib/mcp/error-envelopes.ts`.** Same boundary as implementer lanes per CODER.md §Hard rules.

3. **No worktree, no branch, no ship.** Cycle-7 instances are PROBE roles, not implementer lanes. Override CODER.md §Worktree-setup: skip steps 9–10 of CODER-startup.md. Your output is `.paul/research/cycle-7-instance-<N>-HANDOFF.md`, NOT a commit on master.

4. **Cleanup before HANDOFF.** Every `create_test_account` is matched by `cleanup_all_test_data({prefix})`. Every `create_template` is matched by `delete_template`. Every `create_setlist`/`clone_setlist_from_template` is matched by `delete_setlist({id, force:true})`. Verify zero residual `test-*` users + zero residual `c7iN-*` template/setlist IDs before declaring HANDOFF-COMPLETE.

5. **Deployed-surface evidence is mandatory for every load-bearing finding.** Per `[[feedback_mcp_lane_deployed_surface_evidence]]` (now promoted into AUDITOR.md §Validation-workflow per Decision 2 below): emulator-shape PASS does NOT close a finding. Each HIGH/MED finding includes either an inline `## Repros` section with prod-SHA-stamped transcript, OR a clear "needs deployed-surface verify by auditor" annotation.

6. **Stay in your lane.** Don't probe sibling instances' scope. Cross-lane regression-sweep is the auditor's job, not yours.

---

## §6 — Soft re-entry rule (replaces "last major wave")

Per Decision 3 ratified 2026-05-19T~22:30Z, the "cycle-6-fixes = last major wave" hard cap is REPLACED with:

> **Post-green default = single-lane trailing work.** Parallel-wave mode auto-revives if any subsequent probe surfaces **≥3 BLOCKS-GREEN at TRIAGE** OR **any regression-of-shipped-fix**. The trigger lives inside the protocol; Daniel doesn't have to re-litigate the commitment to re-open a wave.

This removes the commitment-defense pressure Agent C §6 surfaced. The auto-revive bar is high.

---

## §7 — Boilerplate instance prompts no longer re-paste

| Item | Lives in |
|---|---|
| Bearer / uidPrefix table | §2 above |
| Harness reality + Web-SDK auth wiring | §3 above |
| Standing rules + lane boundaries | §5 above |
| Severity-only tagging + finding schema | §4 above |
| Soft re-entry rule | §6 above |
| Anti-pattern catalog | Agent B §6 (read once if you've never seen) |
| File-claims protocol | `.coord/CODER.md` §During-work (still applies for the few files instance 2 may touch via UI screenshots) |

**Mission-content cap: 200 lines per instance prompt.** Per Decision 4 ratified 2026-05-19T~22:30Z. Exceed only with explicit supervisor justification in §0 of the instance prompt.

---

## §8 — Auditor handoff

Auditor reads this PARENT once per cycle-7, then validates 5 HANDOFFs as they land in `.coord/inbox/supervisor.md`. Validation discipline per AUDITOR.md §Validation-workflow (updated with Decision 2: deployed-surface evidence requirement promoted from feedback memory into the spec).

**TRIAGE timing:** supervisor reconciles 5 HANDOFFs into `.paul/research/cycle-7-TRIAGE.md` only after all 5 instance-COMPLETE messages land. Green-gating (BLOCKS-GREEN vs POLISH vs DEFER) happens at TRIAGE time per Decision 1, not at discovery.

**Cycle-7-fixes wave (if needed)** opens only if TRIAGE surfaces ≥3 BLOCKS-GREEN or any regression-of-shipped-fix. Otherwise trailing work moves to single-lane `/bongo:resume <N>` mode.

---

## §9 — What this PARENT explicitly does NOT do

- Does NOT specify per-instance mission content. That lives in `.paul/research/cycle-7-instance-<N>-PROMPT.md`.
- Does NOT enumerate tool schemas. Use `tools/list` against your bearer at boot.
- Does NOT re-explain the `.coord/` protocol. Read `.coord/README.md` once during boot.
- Does NOT re-state CARL global rules. Read `.coord/shared/decisions.md` once during boot.

---

*from supervisor*
