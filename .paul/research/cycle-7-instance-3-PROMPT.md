# Cycle-7 Instance 3 — Multi-user concurrency + live-edit propagation

**Read order:** `.coord/CODER.md` → `.coord/README.md` → `.coord/shared/master-tip.md` → `.coord/shared/decisions.md` → `.coord/shared/claims.md` → **`.paul/research/cycle-7-cowork-PARENT.md`** (full) → THIS FILE.

**Role:** PROBE instance, NOT implementer. Skip CODER.md §Worktree-setup. No branch, no ship.

**Bearer:** ONE admin `crl_live_*` from the pool file (see msg-cycle7-002 in your inbox). Use it to mint TWO `band_leader` test sessions via `create_test_account` — those two sessions are referenced below as "agent-A" and "agent-B" in the concurrency probes.

**uidPrefix:** `c7i3a` (for agent-A test session) + `c7i3b` (for agent-B test session). Strict prefix isolation per `[[feedback_sandbox_test_isolation]]`. Both test accounts minted from the SAME admin bearer; concurrent calls authenticate as TWO DISTINCT band_leader users (distinct customTokens → distinct session cookies).

**Wall-clock budget:** 75 min. Boot ~10min + concurrency probes ~45min + live-edit probe ~15min + HANDOFF ~5min.

---

## §0 — Mission

Two surfaces that cycle-5/6 structurally missed:

**(A) Multi-user concurrent setlist edits.** Cycle-6 burned 4 bearers but never overlapped writes. As David ramps into authoring alongside Daniel, two band_leaders editing the same setlist within seconds of each other becomes routine. Per recon Agent A J3 + Agent B §7 #5 + Agent C §5 cross-role concurrency. The MCP write atomicity contract per `[[feedback_upload_atomicity]]` covers chart upload but **not** setlist-track append. Last-write-wins data loss is the failure mode.

**(B) Live-edit propagation to the band-stand.** Per recon Agent A J6 emergency-edit path: Daniel edits a setlist mid-service via Claude Desktop → musicians' iPads ostensibly pull the change via `src\app\api\setlists\notify-updated\route.ts` Firestore listener. **No cycle has tested this path.** If the listener isn't wired, the system is functionally paper-equivalent during services. This is the unique value-prop over paper.

---

## §1 — Concurrency probes (part A)

Mint TWO band_leader test sessions from your single admin bearer. Both have band_leader role + trusted-leader rate-limit bypass. Throughout this section "agent-A" / "agent-B" mean "the MCP call carrying agent-A's customToken-derived session" vs "agent-B's", NOT two distinct crl_live_* bearers.

**Setup (atomic prep, single MCP call sequence from your admin bearer):**

1. From admin bearer: `create_test_account({uidPrefix:'c7i3a', role:'band_leader'})` → returns agent-A customToken; exchange via Web-SDK `signInWithCustomToken` for an agent-A session.
2. From admin bearer: `create_test_account({uidPrefix:'c7i3b', role:'band_leader'})` → returns agent-B customToken; exchange for agent-B session.
3. From agent-A session: `create_setlist({name:'c7i3-concurrency-probe', isTest:true})` → record `setlistId`.

**Probe 1 — Concurrent track-append.**

- Bearer-A and bearer-B simultaneously (within 5s of each other) call `add_track_to_setlist({setlistId, ...})`:
  - Bearer-A adds "Halleluyah" at position 4.
  - Bearer-B adds "Adon Olam" at position 9.
- Wait 5s; bearer-A reads back via `get_setlist({setlistId})`.
- **Load-bearing assertion:** BOTH tracks land in the final setlist. If a position conflict, ONE caller surfaces a rich-envelope error per REG-001/002 contract. **Silent overwrite of the other's track is HIGH severity.**

**Probe 2 — Concurrent track-modify (same row).**

- Bearer-A and bearer-B simultaneously `update_setlist_track({setlistId, trackId:X, ...})` on the SAME `trackId`. Bearer-A sets `key:"C"`; bearer-B sets `key:"D"`.
- **Load-bearing assertion:** version-versioned write rejects the loser with a stale-version rich envelope. Last-write-wins WITHOUT a rejection is HIGH severity. (NOTE: `wait_for_setlist_change` is shipped + version-versioned per recon Agent B §7 row 5; verify the contract at `src/lib/mcp/tools/wait-for-setlist-change.ts`.)

**Probe 3 — Concurrent template clone-from same source.**

- Bearer-A: `create_template({name:'c7i3-shared-template', ...})` → record `templateId`.
- Bearer-A and bearer-B simultaneously `clone_setlist_from_template({templateId, eventDate, name:'c7i3-clone-from-A'/'c7i3-clone-from-B'})`.
- **Load-bearing assertion:** both clones succeed; both produce distinct `setlistId`s with fresh `trackId`s (Lane 2 ship spec); neither read leaks state from the other's atomic batch.

**Probe 4 — Concurrent publish.**

- Bearer-A: `publish_setlist({setlistId, dryRun:true, audience:'test-c7i3'})`.
- Simultaneously bearer-B: `publish_setlist({setlistId, dryRun:true, audience:'test-c7i3'})`.
- **Load-bearing assertion:** rate-limit bypass holds for BOTH band_leaders; both succeed in dryRun; no duplicate-publish race; `[[feedback_dryrun_is_observability]]` contract holds (dryRun returns full report without `force`).

---

## §2 — Live-edit propagation probe (part B)

This requires Web-SDK auth wiring per PARENT §3.

**Setup:**

1. Bearer-A: `create_setlist({name:'c7i3-live-edit-probe', isTest:true})` → `setlistId`.
2. Bearer-A: `add_track_to_setlist({setlistId, title:'initial track', ...})`.
3. Spin up an in-sandbox Playwright instance on `/perform/setlist/<setlistId>` AS bearer-A's Web-SDK auth context (call `mintSession({firebaseAuth: getAuth()})` per PARENT §3 — REQUIRED, do not skip).
4. Confirm initial track visible in the rendered DOM.

**Probe 5 — Live add propagation.**

- Bearer-B (different MCP session): `add_track_to_setlist({setlistId, title:'live-added track', position:2, ...})`.
- Watch the Playwright DOM for the new row appearing.
- **Load-bearing assertion:** new track appears in the Perform-side DOM within **≤30s** without page refresh. If not, `api/setlists/notify-updated` listener is either un-wired, mis-wired, or the Firestore-listener client path is broken.

**Probe 6 — Live update propagation.**

- Bearer-B: `update_setlist_track({setlistId, trackId, key:'F'})`.
- Watch DOM for key-badge update.
- **Load-bearing assertion:** key badge re-renders ≤30s, no refresh.

**Probe 7 — Live publish notification (out-of-band check).**

- Bearer-B: `publish_setlist({setlistId, dryRun:true})`.
- Probe whether the Perform-side DOM surfaces a "published" indicator (drift-banner / toast / status badge).
- Severity decision: this is more about "is there ANY user-visible signal of the publish" than a hard contract.

---

## §3 — Acceptance assertions

- **A1.** Concurrent track-append (Probe 1): both tracks land OR one fails with rich-envelope; no silent overwrite.
- **A2.** Concurrent same-row update (Probe 2): stale-version envelope rejects the loser; LWW-without-reject is HIGH.
- **A3.** Concurrent template clone (Probe 3): two distinct setlists; fresh trackIds; atomic-batch isolation holds.
- **A4.** Concurrent publish (Probe 4): rate-limit bypass holds; no duplicate-publish side effects.
- **A5.** Live add propagation (Probe 5): ≤30s DOM refresh on `/perform/setlist/<id>` without page reload.
- **A6.** Live update propagation (Probe 6): ≤30s key-badge re-render without page reload.
- **A7.** `api/setlists/notify-updated` route + Firestore listener wiring confirmed in code-grep AND observed in network trace.

---

## §4 — What this instance does NOT probe

- MCP multi-turn LLM drift — Instance 1.
- In-app UI walks — Instance 2.
- Production data inspection — Instance 4.
- Freeform contrarian narrative — Instance 5.

---

## §5 — HANDOFF requirements

Write `.paul/research/cycle-7-instance-3-HANDOFF.md` per PARENT §4. Specific:

- One `## Probe` subsection per Probe 1–7 with timing + envelope shape + observed behavior.
- Per A1–A7: PASS/FAIL with evidence.
- `## Repros` section with prod-SHA-stamped transcript per `[[feedback_mcp_lane_deployed_surface_evidence]]`.
- `.paul/research/cycle-7-instance-3-findings.jsonl` per schema.
- Artifacts under `.paul/research/cycle-7-instance-3-artifacts/` — DOM snapshots, network HARs, JSON-RPC transcripts.
- Cleanup checklist: zero residual `c7i3a-*` + `c7i3b-*` users / setlists / templates; both bearers burned.

ACK + HANDOFF-COMPLETE to `.coord/inbox/supervisor.md` signed `from coder-3`.

---

## §6 — Bail-out conditions

- HARD-BLOCK: either bearer rejected at boot; `wait-for-setlist-change.ts` missing at master.
- DEGRADED-OK: `firebaseAuth` wiring fails (document; fall back to JSON-RPC-only concurrency probes; skip Part B propagation probes; note as A5/A6 INDETERMINATE).

---

*from supervisor*
