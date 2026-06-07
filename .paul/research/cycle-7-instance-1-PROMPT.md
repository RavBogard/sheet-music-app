# Cycle-7 Instance 1 — MCP multi-turn weekly-flow probe

**Read order:** `.coord/CODER.md` → `.coord/README.md` → `.coord/shared/master-tip.md` → `.coord/shared/decisions.md` → `.coord/shared/claims.md` → **`.paul/research/cycle-7-cowork-PARENT.md`** (full) → THIS FILE.

**Role:** PROBE instance, NOT implementer. Skip CODER.md §Worktree-setup steps 9–10. No branch, no ship.

**Bearer:** `<DANIEL-MINT crl_live_*>` (band_leader role, kickoff message in your inbox).

**uidPrefix:** `c7i1` (per PARENT §2).

**Wall-clock budget:** 90 min focused. Boot ~10min + mission ~70min + HANDOFF ~10min.

---

## §0 — Mission

Simulate David Lazaroff's Tuesday-9am weekly authoring flow under **multi-turn LLM pressure**. Cycle-6 Instance C ran each MCP tool ONCE and asserted shape. Real David **iterates**: clone → edit → re-edit → re-edit → publish, 5–8 LLM turns, English intent, no tool-name knowledge.

Per `[[project_david_band_leader]]` David is the 2nd band_leader; weekly-flow target user; informs trusted-leader gating decisions. Per `[[user_mcp_is_primary_author_workflow]]` MCP is the primary author surface; in-app UI is the fallback.

**The failure mode this probe tests:** does the toolset HOLD under realistic multi-turn drift, or does Claude Desktop run out of tool-steering capacity and start deflecting ("you should ask Daniel") or hallucinating ("let me check if `propose_template_change` exists")?

---

## §1 — The simulated David transcript

You are NOT pretending to be David. You are running a probe agent (Claude Code) that EMULATES the kind of English intent David would issue. Issue the prompts; observe what tool sequence Claude picks; record drift.

**Required turn sequence (issue these prompts to your own next-turn self; record tool choices):**

1. **T1 — "I need a Shabbat morning service for this Saturday. Use Randy's usual."**
   - Expected steering: `list_templates({templateType?:'shabbat-morning'})` → identify Randy's template → `get_template({templateId})` → `clone_setlist_from_template({templateId, eventDate, name})`.
   - Probe assertion: tool sequence selected without Daniel-deflection; cloned setlist visible via `list_setlists`.

2. **T2 — "Swap track 3 for something more upbeat than 'Yedid Nefesh' — maybe Carlebach-ish."**
   - Expected steering: `list_library({searchQuery?:'Carlebach'})` → choose candidate → `update_setlist_track({setlistId, trackId, ...})` OR delete+insert.
   - Probe assertion: search returns Carlebach matches; track replacement lands; setlist order preserved.

3. **T3 — "Move 'Halleluyah' to the closing spot."**
   - Expected steering: reorder via `update_setlist_track` position OR delete+re-add at end. (NOTE: verify what reorder primitive actually exists; supervisor pre-flight noted `update_setlist_track` may not have a `position` field — confirm via `tools/list` schema at boot.)
   - Probe assertion: reorder lands without losing other tracks; version increments cleanly.

4. **T4 — "Who's playing bass this Shabbat?"**
   - Expected steering: `list_service_personnel` OR `/api/scheduling/suggest-band` (HTTP, NOT MCP — supervisor confirmed at pre-flight). If the latter, document the gap as a finding (David won't switch surfaces mid-flow).
   - Probe assertion: scheduling info reachable from the multi-turn flow; HTTP-vs-MCP boundary documented if it bites.

5. **T5 — "Add a note that we're doing the alt-melody on Lecha Dodi."**
   - Expected steering: `update_setlist_track({notes})` OR setlist-level notes field.
   - Probe assertion: note persists; visible on subsequent `list_setlists` / `get_setlist` reads.

6. **T6 — "Try it both ways — also clone this as 'Shabbat morning quick variant' template for later."**
   - Expected steering: `create_template` snapshot from the current setlist state. Probes whether Claude understands "create-template-from-current-setlist" as an inverse of `clone_setlist_from_template`. Likely surfaces a gap.
   - Probe assertion: either the tool exists, OR the multi-turn flow gracefully suggests the in-app fallback at `src/app/(main)/manage/templates/page.tsx`.

7. **T7 — "Publish to the band."**
   - Expected steering: `publish_setlist({setlistId, audience?})`. Trusted-leader rate-limit bypass per `[[feedback_admin_rate_limit_bypass]]` must hold.
   - Probe assertion: publish succeeds; `audience` defaults sensibly; rate-limit does NOT trigger on the 7th tool call.

8. **T8 (only if budget) — Hebrew title typo tolerance.** Issue: "Find me 'Lechu Nranina' chart" then variant: "Lechu N'rann'na" then "L'chu Nranena". Probe: does search return same match? Hebrew-transliteration tolerance is a real David failure mode (cycle-6 Instance D probed RTL synthetically; this is the live-typing variant).

**Hard ceiling: 8 LLM turns total.** If you run 9+, that's the failure signal — record `time-to-failure` and emit a HIGH-severity finding.

---

## §2 — Acceptance assertions (load-bearing)

These are the cycle-7 J2 (recon Agent A) load-bearing claims. Each becomes a finding if violated.

- **A1.** English intent → published setlist in **≤8 LLM turns**.
- **A2.** **Zero tool-not-found** errors in the turn sequence.
- **A3.** **Zero rate-limit hits** on the band_leader bearer (trusted-leader bypass).
- **A4.** **Zero "I need to confirm with Daniel" deflections** — Claude commits to tool calls.
- **A5.** **No stale-tool-cache surprises.** Verify Lane 2 template tools (`list_templates`, `get_template`, `create_template`, `update_template`, `delete_template`, `clone_setlist_from_template`) are visible in `tools/list` at boot AND callable in T1.
- **A6.** **Reorder semantics hold** (T3) — tracks land in stated order; version increments per write.
- **A7.** **Hebrew transliteration variants match the same chart** (T8) within reasonable Levenshtein tolerance OR a finding is emitted documenting the brittleness.

---

## §3 — What this instance does NOT probe

- Real-iPad cold-launch (J1) — Daniel's separate Friday pillar.
- Multi-user concurrency (J3) — Instance 3.
- In-app UI deep-walk (J4) — Instance 2.
- Live-edit propagation to band-stand (J6) — folded into Instance 3.
- Production-data drift — Instance 4.
- Freeform "worst bug" hunt — Instance 5 (contrarian).

If you notice something in those zones, **emit a SCOPE-NOTE finding** (severity INFO) but don't probe it. Cross-lane regression-sweep is the auditor's job.

---

## §4 — HANDOFF requirements

Write to `.paul/research/cycle-7-instance-1-HANDOFF.md` per PARENT §4 schema:

- **Per acceptance assertion (A1–A7):** PASS/FAIL + evidence link.
- **`## Repros` section** with prod-SHA-stamped transcript per `[[feedback_mcp_lane_deployed_surface_evidence]]`. Each REPRO carries `observed_pre_fix` (= what cycle-7 saw) AND `observed_post_fix` (= what the assertion expects). Use bongo-3-init's `msg-from-coder-4-ship` as the reference exemplar.
- **Per-finding entry in `.paul/research/cycle-7-instance-1-findings.jsonl`** matching the schema in PARENT §4.
- **Screenshots / transcripts** under `.paul/research/cycle-7-instance-1-artifacts/`.
- **Cleanup checklist** at the bottom of HANDOFF: `c7i1` template + cloned setlist + test account all removed; bearer burned; sandbox clean.

ACK + HANDOFF-COMPLETE messages to `.coord/inbox/supervisor.md` signed `from coder-1`.

---

## §5 — Bail-out conditions

Per PARENT §3 boot expectations:

- **HARD-BLOCK + post BLOCKER to supervisor:** bearer rejected at boot, OR `probe.mjs` missing, OR any Lane 2 template tool absent from `tools/list`.
- **DEGRADED-OK + document inline:** `scripts/` subdir absent (synthesize inline), OR `update_setlist_track` lacks `position` param (note in finding), OR HTTP `suggest-band` returns 500 (document, continue).

If you bail HARD-BLOCK, return your bearer to Daniel un-burned for re-mint.

---

*from supervisor*
