# Cycle-13a Leader→band live-broadcast — SAMPLE-REPORT (illustrative shape, NOT a real run)

> **This is a fictional finished run** showing the cowork instance the exact report shape +
> finding density + decisive-verdict tone expected. Numbers, latencies, and findings are
> illustrative — the real RUN must reproduce its own. Charter deliverable #3.

**Run date:** 2026-05-30T18:40Z *(illustrative)*
**Wall-clock:** ~74 min single-thread
**Master SHA at run:** `952edac4c3` (no drift from PROMPT draft)
**Contexts:** David (band_leader, BROADCASTER) + Aviva (musician, RECEIVER-1) + public iPad (RECEIVER-2)
**Real source setlist (read-only):** `8a73c801-…` (Kabbalat Shabbat template, 15 tracks)
**Fixture clone (write target):** `f3c1a902-…` — `[CYCLE13a-leader] broadcast-trace fixture`; isTest:true verified
**A3 sub-coverage:** A3-key ✓  A3-swap ✓  A3-insert ✓  A3-jump (GAP) documented
**Broadcast bug-class coverage:** BC-1 propagation ✓  BC-2 latency ✓  BC-3 disruption ✓
**MCP-origin trace:** ✓ (one — swap_chart via admin bearer)   **Monitor topology:** confirmed out-of-axis
**Cleanup state:** clean
**Broadcast-readiness verdict:** **RELIABLE-WITH-FIXES** — F-C13A-001 (P0), F-C13A-003 (P1)

---

## §A — Broadcast-readiness verdict (≤200 words)

Content broadcast WORKS and is reasonably fast: every in-app leader edit and the one MCP-origin write
reached both receivers (signed-in and public) within 1–3s, well inside a between-phrase window. The
band WILL see a leader's key change, chart swap, and inserted song. **But two receiver-side frictions
make it RELIABLE-WITH-FIXES, not reliable-as-is.** The load-bearing one (F-C13A-001, P0): an
insert/reorder above a musician's open chart silently re-points their overlay to the wrong song,
because the overlay resolves by positional index while the broadcast re-indexes the array — a musician
performing loses their chart mid-phrase with no cue. The second (F-C13A-003, P1): a key change lands
with no "key changed" signal, so a musician already reading the chart plays the old key until they
happen to glance at the header. The biggest structural reality is the **A3-jump gap**: there is no
leader "we're on song N now" broadcast at all (verified absent) — the band relies entirely on verbal
cues + each iPad's own URL self-tracking. That may be acceptable for a co-located band; it's a Daniel
decision, not a bug.

---

## §B — WHAT-WE-LEARNED (broadcast design principles)

- **"The leader's own device lies."** David's iPad showed every edit instantly (local Dexie write in
  `applyEdit`); both receivers were always 1–3s behind. Any future leader-facing "the band has it"
  affordance must read receiver acknowledgement, not the leader's own optimistic local state — the
  leader currently has zero signal about whether the band actually received the change.
- **"Position is per-device; content is shared."** The `595153b192` URL track-position is private to
  each iPad, while track CONTENT (key/binding/order) is broadcast. This split is mostly invisible
  until an insert/reorder changes the array indices content-side — then the private positional state
  (overlay `currentIndex`) and the shared content collide (F-C13A-001). The fix is to make the
  receiver's open-overlay resolution `trackId`-anchored so private position survives shared re-indexing.
- **"A broadcast that lands silently is half a feature."** Every trace propagated, but the receiver
  often had no idea something arrived. Reliability isn't just delivery — it's a non-blocking cue that
  preserves the musician's place while telling them it moved. The `KeepAwakeToggle` lastError inline
  pill (`fd9e5c8439`) is the established template for exactly this.
- **"The absent channel is a design choice, not an oversight."** The now-playing advance was
  deliberately removed ("live stepping removed"). For a co-located band using verbal cues + wedges,
  the gap may be correct; documenting it as a decision beats silently rebuilding it.

---

## §C — Findings (broadcast-trace shape)

### F-C13A-001 — Insert-above silently re-points a musician's open chart to the wrong song
- **A3 sub:** A3-insert · **Bug-class:** BC-3 disruption · **Persona:** broadcaster David, receiver Aviva (musician)
- **Action@leader:** long-press track 6 → Insert song → "before" → niggun
- **R1 (Aviva, overlay open on track 6):** reflected ✓ @ ~1.8s — but overlay now shows the niggun, not
  track 6; scroll-within-chart lost; URL silently rewrote to the niggun's trackId; **no cue**
- **R2 (public, on the list):** reflected ✓ @ ~2.1s — new row appeared; list scroll shoved down ~1 row
- **BC-3 disruption:** R1 YANKED (open overlay → wrong song mid-phrase). R2 mild (scroll shift).
- **Mechanism:** `PDFOverlay` keys on positional `currentIndex` (`SetlistPerformClient.tsx:321`); the
  snapshot delivery re-sorts `tracks[]` by `order` (`use-setlist-performance.ts:143`) so index 5 now
  resolves to the niggun. The `595153b192` URL effect (`:141-155`) follows the index, rewriting the URL.
- **Severity (receiver-felt):** HIGH — a performing musician loses their chart with no warning.
- **Affordance fix:** re-resolve the open overlay by `trackId` (not positional index) on every
  `tracks[]` change, so the musician stays on their song across a broadcast re-index; add a
  non-blocking "setlist updated" pill. Err-public: never gate the update, just anchor + notify.
- **Artifacts:** `artifacts/F-C13A-001-r1-before.png` / `-r1-after.png`

### F-C13A-002 — Public (unauth) receiver gets the broadcast but renders in concert pitch, not the musician's default transpose
- **A3 sub:** A3-key · **Bug-class:** BC-1 propagation (partial-by-design) · **Persona:** receiver R2 (public)
- **Action@leader:** change-key track 3 → G
- **R1 (Aviva):** reflected ✓ @ ~1.2s, key header → G, honoring her `defaultTransposition`
- **R2 (public):** reflected ✓ @ ~1.4s, key header → G, but no profile → `defaultTransposition = 0`
- **BC-3:** none (idle list). **BC-1:** technically propagated; the divergence is intended (no profile).
- **Severity:** LOW — informational; documents that the QR-scan musician sees concert pitch. Likely
  WORKING-AS-INTENDED under err-public (showing SOMETHING beats gating), but flagged so triage decides.
- **Affordance fix:** none required; consider a one-time "sign in to apply your default key" hint on
  the public overlay. Do NOT gate the chart.

### F-C13A-003 — Key change lands with no "key changed" cue for a musician already reading the chart
- **A3 sub:** A3-key · **Bug-class:** BC-3 disruption · **Persona:** receiver Aviva, chart overlay open
- **Action@leader:** change-key track 3 → G (Aviva mid-chart in the original key)
- **R1:** reflected ✓ @ ~1.3s — header key updated to G silently; chord glyphs unchanged (label-only
  change per `LiveDirectorMenu.tsx:9-12`); Aviva kept playing the old key until she glanced at the header
- **BC-3:** silent — no transient cue that the key moved.
- **Severity (receiver-felt):** MEDIUM-HIGH — wrong-key playing in front of the room until noticed.
- **Affordance fix:** flash a non-blocking "key → G" pill on the open overlay when the bonded track's
  `key` changes under the musician (same pill pattern as F-C13A-001). Label-only, err-public-safe.

### F-C13A-004 — MCP-origin swap_chart propagates live to already-open receivers (✓ confirms §1.3)
- **A3 sub:** MCP-origin · **Bug-class:** BC-1/BC-2 · **Persona:** receivers R1 + R2 (leader page idle)
- **Action@leader:** `swap_chart` via admin bearer on fixture track 9
- **R1:** reflected ✓ @ ~2.4s · **R2:** reflected ✓ @ ~2.7s
- **BC-3:** neither had track 9 open → none observed; positive confirmation that
  `updatedAt: serverTimestamp()` (`server-tracks-write.ts`) clears the LWW guard and an MCP edit lands
  on an open Perform view exactly like an in-app edit.
- **Severity:** n/a — this is a PASS finding documenting that the MCP→band broadcast channel works.

---

## §D — Broadcast latency matrix (per A3 sub × receiver)

| Trace | Action@leader | R1 reflect (Aviva) | R2 reflect (public) | BC-3 disruption | Verdict |
|---|---|---|---|---|---|
| A3-key    | change-key → G        | ✓ ~1.2–1.3s | ✓ ~1.4s | silent key swap (F-003) + pitch divergence (F-002) | partial |
| A3-swap   | swap chart (track 9)  | ✓ ~2.0s     | ✓ ~2.3s | open chart re-rendered cleanly (no F) | ✓ |
| A3-insert | insert before track 6 | ✓ ~1.8s     | ✓ ~2.1s | overlay yanked to wrong song (F-001 P0) | regress-risk |
| MCP-origin| swap_chart via MCP    | ✓ ~2.4s     | ✓ ~2.7s | none observed | ✓ |

No `never` cells. All content broadcasts propagated; the failures are BC-3 (disruption), not BC-1
(reachability).

---

## §E — Receiver-disruption ledger (BC-3 detail)

| Trace | R1 in-progress state | What happened to R1 | R2 in-progress state | What happened to R2 |
|---|---|---|---|---|
| A3-key | overlay open, original key | header → G silently, no cue (F-003) | list, scrolled to row 3 | row key → G, no disruption |
| A3-swap | overlay open on track 9 | chart bytes re-rendered cleanly, scroll-in-chart reset to top | row 9 visible | title/binding updated, no scroll move |
| A3-insert | overlay open on track 6 | **overlay → niggun (wrong song), scroll lost, URL rewritten, no cue (F-001)** | list above insert point | visible rows shoved down ~1 row |
| MCP-origin | list idle | new binding on row 9, no disruption | list idle | same |

Pattern: disruption is concentrated where the receiver has an OPEN OVERLAY on or near the changed/
shifted track. Idle-list receivers absorb broadcasts gracefully.

---

## §F — The A3-jump GAP + out-of-axis parking lot

**A3-jump (verified absent at run-SHA):** `git show origin/master:src/hooks/use-setlist-performance.ts`
confirms `currentTrackIndex = -1` + `// No-op position control (live stepping removed)` +
`setCurrentPosition = () => {}`. The leader cannot push now-playing position; the band relies on
verbal cues + each iPad's own `595153b192` URL self-tracking. **Cost:** when the leader skips ahead,
nothing on the band's screens moves — every musician must be told and self-navigate. **Daniel
decision (NOT a blind fix):** should there be a leader "we're here now" soft-broadcast? Arguments
against rebuilding it: the band is co-located and uses verbal/visual cues; wedges-not-IEM means
they're in the same room; `[[feedback_err_public_not_gated]]` warns against modes. Argument for: a
non-binding "leader is on song N" hint (that a musician can ignore) could cut re-sync friction. Framed
for triage; not pre-judged.

**Monitor topology (confirmed out-of-axis):** `/monitor` read-only as Aviva confirmed the §1.4
topology — Firestore-mediated personal mixing (iPad ↔ X32 bridge), no leader→band fan-out. Mixer
state showed ~expected staleness on reconnect; deferred to a future monitor-dedicated axis. Zero X32
writes performed.

**Out-of-axis frictions seen (deferred, NOT promoted):** none material this run. (Any A1/A2/A4 or
13b/13c/13d frictions would be parked here.)

---

## §G — Cleanup state

Clean. `delete_setlist(fixtureSetlistId, force:true)` ✓; the insert-created niggun row was part of the
fixture (deleted with it); `cleanup_all_test_data({prefix:"c13a-leader"})` ✓;
`list_test_accounts({})` → 0 matching `c13a-leader`; `list_setlists({})` → no `[CYCLE13a-leader]` rows.

---

## §H — Optional findings.jsonl (grep mirror)

```jsonl
{"id":"F-C13A-001","a3_sub":"insert","bug_class":"BC-3","persona":"aviva","severity":"high","surface":"PDFOverlay+use-setlist-performance","latency_ms":1800,"disruption":"overlay-yanked-wrong-song","fix_hint":"resolve open overlay by trackId not positional index + setlist-updated pill"}
{"id":"F-C13A-002","a3_sub":"key","bug_class":"BC-1","persona":"public","severity":"low","surface":"perform-public","latency_ms":1400,"disruption":"none","fix_hint":"optional sign-in hint; do not gate"}
{"id":"F-C13A-003","a3_sub":"key","bug_class":"BC-3","persona":"aviva","severity":"medium-high","surface":"LiveDirector-changeKey+PDFOverlay","latency_ms":1300,"disruption":"silent-key-swap","fix_hint":"flash key-changed pill on open overlay"}
{"id":"F-C13A-004","a3_sub":"mcp-origin","bug_class":"BC-1","persona":"both","severity":"info","surface":"mcp-server-tracks-write+snapshot-listener","latency_ms":2400,"disruption":"none","fix_hint":"none — confirms MCP broadcast works"}
```

---

### HANDOFF-COMPLETE (illustrative)
```
from cycle-13a-leader-broadcast
HANDOFF-COMPLETE
broadcast-readiness verdict: RELIABLE-WITH-FIXES (F-C13A-001 P0, F-C13A-003 P1)
A3 sub-coverage: A3-key ✓  A3-swap ✓  A3-insert ✓  A3-jump GAP documented
bug-class coverage: BC-1 ✓  BC-2 ✓  BC-3 ✓   MCP-origin trace: ✓
load-bearing P0/P1 findings:
  F-C13A-001  P0 BC-3 — insert-above re-points a musician's open chart to the wrong song
  F-C13A-003  P1 BC-3 — key change lands with no cue for a musician already reading the chart
cleanup: clean
report: .paul/research/cycle-13a-leader-broadcast/REPORT.md
```

— from coder-1 (lane `cycle-13a-leader-broadcast-PROMPT-design`)
