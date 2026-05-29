# Cycle-13a Cowork — Leader → band live-broadcast sweep (A3 anchor, MULTI-CONTEXT BROADCAST-TRACE methodology)

> **Drafted 2026-05-29 against deployed surface at origin/master `952edac4c3`** — every
> route / component / hook / sync module / MCP tool / e2e helper / config cited below was
> verified via `git ls-tree` + `git show <rev>:<path>` against that SHA per
> `[[feedback_cowork_prompt_verify_before_write]]` (NOT `cat-file -e <rev>:<path>` — mangles
> on Windows per `[[feedback_git_ref_path_check_windows]]`). **Re-confirm at run-time** via
> `git log -1 origin/master` and note any drift inline in §A of the REPORT.
>
> **This is axis A of the cycle-13 4-axis parallel design** (charter: `.coord/cycle-13-CHARTER.md`).
> 13a OWNS the **A3 anchor moment** that cycle-11 and cycle-12 BOTH deferred. Siblings 13b
> (MCP authoring round-trip) / 13c (real-WebKit re-verify) / 13d (bond hygiene + picker) are
> DISJOINT — no cross-axis synthesis (charter §Phase-2 disjoint rule).
>
> **The worry (verbatim from dispatch):** the moment a leader (Daniel / Randy / David) pushes
> a live change mid-service — a key change, a chart swap, an inserted song, a reorder — and the
> band's iPads must reflect it. *Does the band actually SEE the change? How fast? And what
> happens to a musician mid-chart when the leader jumps the queue?*

---

## §0 — WHAT THIS AXIS BREAKS vs the cycle-12 PARENT (read first)

Cycle-12 (`.paul/research/cycle-12-saturday-readiness/PROMPT.md`) was a **single-musician,
single-context** offline + stickiness sweep. It explicitly stamped A3 OUT-OF-SCOPE (cycle-12
§2.3: *"A3 mid-service key/song change — INTENTIONALLY OUT … if A3-class frictions emerge,
NOTE them in §F, do NOT promote"*). **This axis promotes A3 to the headline.**

Five things this axis breaks, each load-bearing:

1. **The single-context probe (AP-7).** Cycle-11/12 observed ONE iPad at a time. A broadcast is
   meaningless with one observer — you cannot see a change "propagate" to a device that made it.
   This axis runs a **synchronized multi-context trace**: ONE leader device + ≥2 receiver devices
   open on the SAME setlist simultaneously, and the unit of observation is *one leader action
   measured across all receivers at once*. This is the deepest AP-7 break of any cycle.

2. **The assumption that "leader broadcast" means now-playing advance.** ⚠️ **VERIFIED-FALSE.** The
   leader→band *now-playing-position* channel — the leader taps "we're on song 7 now" and the band's
   iPads jump — **DOES NOT EXIST.** `src/hooks/use-setlist-performance.ts:180` hardcodes
   `const currentTrackIndex = -1` and `:225-226` reads `// No-op position control (live stepping
   removed)` / `const setCurrentPosition = () => {}`. The `onLeaderSetPosition` prop is wired all the
   way down to `SetlistRow` (`SetlistView.tsx:73,95`) but terminates in a no-op. The dispatch asked
   "*is it the URL track-position work from `595153b192`, or independent?*" — **the answer is NEITHER:
   `595153b192` (`SetlistPerformClient.tsx:141-155`) is per-DEVICE self-navigation written to that
   device's own URL via `replaceState`; it never crosses to another iPad.** The headline A3 finding-class
   is this STRUCTURAL GAP, not a bug in an existing feature.

3. **The "content sync = the only thing that matters" framing.** Cycle-12 treated the
   Firestore→Dexie path purely as a *staleness* concern. This axis treats it as a **broadcast
   channel with latency and disruption semantics** — the same `applyEdit`→outbox→Firestore→
   `onSnapshot`→Dexie→`useLiveQuery` pipe is now graded on (a) does the change ARRIVE, (b) how
   FAST, (c) does it YANK a receiving musician's place.

4. **The findings-as-bug-list output (AP-4).** Output is a **broadcast-topology map** + a
   gap-analysis (what changes are silently un-broadcastable) + a verdict, not a bug count.

5. **The class-violation card (AP-1).** Every finding is a *broadcast trace* anchored to a real
   mid-service leader action with a musician-felt cost on the RECEIVER side.

**Anti-patterns broken: AP-1, AP-3, AP-4, AP-7** (named again in §7). Structurally vulnerable to
AP-2 (narrow — one surface-family) and AP-5 (trace cards keep an observer voice) — by design.

**Methodology novelty (don't re-run a prior cycle's):** cycle-11 = narrative/matrix/heuristic
triplet; cycle-12 = hybrid one-PROMPT self-tagging shape. **13a = the multi-context broadcast
trace** — the observation unit is `action@leader → [receiver-N: outcome + latency] → disruption`.
New shape, new depth.

---

## §1 — The broadcast topology (VERIFIED map — the thing you are stress-testing)

Everything below was read at `952edac4c3`. This is your mechanism reference; cite it in findings.

### §1.1 — The ONE real leader→band channel: content-sync via snapshot-listener

```
LEADER device                          BAND device (each receiver)
─────────────                          ───────────────────────────
in-app live edit                       startSnapshotListener (mounted by
  → applyEdit({op,patch})                use-setlist-performance.ts:124-138)
    (src/lib/live-director.ts:37,83,      → onSnapshot(setlists/{id})         [snapshot-listener.ts:156-173]
     132,163,180 — all 3 actions)        → onSnapshot(tracks where setlistId==X) [:174-201]
  → Dexie put (instant local)            → db.{setlists|tracks}.put  w/ 3 guards:
  → outbox row                              1. skip-if-pending-outbox  [:244, :303]
  → sync engine drains to Firestore         2. LWW: remote.updatedAt > local [:263-266, :349-365]
                                            3. tombstone guard          [:251, :333]
                                         → useLiveQuery picks up Dexie change
                                           (use-setlist-performance.ts:143-152)
                                         → tracks[] re-renders in SetlistView
```

- **Public read is open:** `firestore.rules:117-118` `match /tracks/{trackId} { allow read: if true }`
  — so even an UNAUTH (QR-scan) band iPad receives the broadcast. The listener mounts for public
  sessions too (`use-setlist-performance.ts:124` comment v60-12-01).
- **The leader's OWN device sees the edit instantly** (local Dexie write in `applyEdit`). **The band
  sees it only after** the leader's outbox drains to Firestore AND each receiver's `onSnapshot`
  fires AND the LWW guard passes. Each hop is a latency + failure source. **This asymmetry is the
  axis's central probe.**

### §1.2 — The three in-app live-director actions (leader-only, long-press)

`SetlistView.tsx:61` gates the gesture: `gestureEligible = isLeader && !!setlistId && !!track.id &&
track.type !== "header"`. `isLeader = isAdmin || isBandLeader` (`use-setlist-performance.ts:95`).
Long-press → `LiveDirectorGesture.tsx` → `LiveDirectorMenu.tsx` action sheet → `LiveDirectorActions.tsx`
→ `@/lib/live-director.ts`:

| Action | live-director.ts fn | Writes | Band-visible effect |
|---|---|---|---|
| **Change key** | `changeTrackKey(track.id, key)` (`:37`) | `tracks/{id}.key` (label-only; no chord-overlay touch per `LiveDirectorMenu.tsx:9-12`) | displayed key on the row + chart header updates |
| **Swap chart** | `swapTrackChart(track.id, song)` (`:83`) | re-bond `tracks/{id}` fileId/songId | the bonded chart the musician opens changes |
| **Insert song** | `insertTrack({...})` (`:163`) + order-bump (`:132`) | new `tracks/{id}` + sibling `order` patches | a new row appears; existing rows shift |

All commit on tap (tap-once-commit, `LiveDirectorActions.tsx:15`) — no confirm dialog. All route
through `applyEdit` → the §1.1 pipe.

### §1.3 — MCP authoring writes landing live (the Daniel/Claude-Desktop overlap)

MCP write tools stamp `updatedAt: FieldValue.serverTimestamp()` on track + setlist mutations
(`src/lib/mcp/server-tracks-write.ts:198,233,331,336,691,726,1177,1216,1552,1633,1790,1799` — 12
sites). Because the server timestamp always exceeds a receiver's last-known `updatedAt`, the §1.1
LWW guard passes → **an MCP edit (e.g. `commit_staged_changes`, `swap_chart`, `clone_setlist` into
an already-open setlist) propagates to an OPEN band Perform view the same way an in-app edit does.**
⚠️ **Disjoint-with-13b note:** 13b OWNS the MCP-authoring *round-trip* (clone→tweak→bond→publish).
13a touches MCP ONLY as a *broadcast source* — "does an MCP write land live on an already-open
Perform view, and how fast." Probe exactly ONE MCP-origin broadcast trace (§3.D); do NOT re-run
13b's authoring matrix.

### §1.4 — Monitor / wedge: NOT a leader→band broadcast (scope honestly)

⚠️ **VERIFIED scoping correction.** The dispatch listed monitor/wedge as a candidate broadcast
surface. The actual topology (`src/hooks/use-monitor-connection.ts:1-20`): *"The bridge writes
mixer state to Firestore; iPads read it via onSnapshot. iPad fader commands are written to
Firestore; the bridge reads and executes them."* This is **per-musician personal mixing**
(iPad ↔ X32-bridge, Firestore-mediated) — **wedges, not IEM** (`[[feedback_terminology]]`). There
is **no leader→band wedge broadcast** — David cannot push "everyone's vocal up 3dB." So monitor is
**out of the broadcast axis**. Run ONE light read-only observation (§3.E) to confirm the topology
holds and note staleness behavior, then defer the monitor surface to a future dedicated axis.
**⛔ ZERO live X32 / fader writes** (`[[project_mixer_feature]]`; cycle-12 §8 operational rule).

---

## §2 — The A3 anchor moment, made concrete + the 3 axis bug-classes

### §2.1 — A3 sub-moments (this axis OWNS A3; A1/A2/A4 belong to cycle-12)

The shared A1–A4 anchor set (from cycle-12 §2.3): A1 setup-prep · A2 between-songs scramble ·
**A3 mid-service change** · A4 sanctuary edge. **A3 = the leader alters the service in-flight and
the band must absorb it without losing the music.** Four sub-moments:

| Sub | The mid-service moment | Surface | The receiver-side worry |
|---|---|---|---|
| **A3-key** | Randy calls an audible: "let's do Adon Olam in G, not B♭." David long-presses the row → Change key → G. | §1.2 change-key | Does every band iPad's displayed key flip to G? How fast? Does a musician mid-chart in B♭ get a silent wrong-key, or a visible "key changed" cue? |
| **A3-swap** | Wrong arrangement bonded; David swaps the chart mid-set. | §1.2 swap-chart | Does the open chart re-render on the band's screens? What does a musician *currently reading the old chart* experience — a flash, a reload, a lost scroll position? |
| **A3-insert/reorder** | Rabbi adds a niggun on the fly; David inserts it after the current song. | §1.2 insert-song + order-bump | Does the new row appear on band iPads? Does the insert SHIFT a musician's scroll / their self-tracked position / their open overlay index? |
| **A3-jump** (the GAP) | The leader skips ahead — "we're cutting to the closing song." | §1.1 (NONE — no now-playing channel) | The band has **no broadcast signal** that the leader jumped. Each musician must be told verbally and self-navigate. This is the structural gap (§0.2). |

### §2.2 — The 3 broadcast bug-classes (every probe tags one; zero-finding is acceptable data)

Replaces cycle-12's {stickiness / fresh-tablet / auth-divergence} with broadcast-native classes:

- **BC-1 propagation** — does the change ARRIVE on the receiver at all? (visibility / reachability)
- **BC-2 latency** — how long from leader-commit to receiver-reflect? (stopwatch; the mid-service
  tolerance is "before the next downbeat-ish window" — grade <1s / 1-3s / 3-6s / >6s / never)
- **BC-3 mid-chart disruption** — what happens to a receiving musician's IN-PROGRESS state (scroll
  offset, open chart overlay, self-tracked track position, applied transpose) when a broadcast lands
  on them? Does it preserve or yank? (this is where receiver-felt friction lives)

The **auth dimension** folds into the persona contrast (§0.3): who can BROADCAST (band_leader/admin
only — the gesture is gated) vs who RECEIVES (everyone, incl. unauth). A musician who tries to
long-press should get the normal tap-to-open chart, NOT the live-director sheet (gate verification).

---

## §3 — Walkthrough plan (~75 min budget; 1 leader + 2 receivers, synchronized)

**Total wall-clock: ~75 min** single-thread per `[[feedback_cowork_real_harness]]` (NOT walk-away;
CFC + chrome.debugger does NOT work; the real harness is in-sandbox Playwright at `cycle-4/harness/`,
reuse it). **Environment requirement:** this axis needs a **harness-warm worktree** (`npm ci` +
`npx playwright install webkit` pre-staged) per `[[feedback_cowork_harness_warm_worktree]]` — the
multi-context WebKit broadcast trace cannot run on a bare checkout. Confirm WebKit is installed in
§0.1 or HARD-BLOCK.

| Phase | Time | Vehicle |
|---|---|---|
| §0 boot + clone fixture + mint 1 leader + 2 receivers | ~12 min | MCP calls + 3 Playwright contexts |
| **§3.A — A3-key broadcast trace** | ~12 min | leader change-key → measure both receivers |
| **§3.B — A3-swap broadcast trace** | ~12 min | leader swap-chart → measure both receivers + mid-chart disruption |
| **§3.C — A3-insert/reorder broadcast trace** | ~12 min | leader insert → measure list-shift + position disruption |
| **§3.D — MCP-origin broadcast trace (one)** | ~8 min | MCP swap_chart → already-open receiver reflects? latency? |
| **§3.E — the A3-jump GAP probe + monitor topology confirm** | ~8 min | document the absent channel; 1 read-only monitor observation |
| Cleanup + REPORT write | ~11 min | `cleanup_all_test_data({prefix:"c13a-leader"})` + write §A–§G |

### §0 — Boot, sandbox, 3-context identity provisioning

**§0.1 Boot pre-flight (HARD-BLOCK → BLOCKER to supervisor, stop):**
1. `git rev-parse --is-shallow-repository` → `false` (else `git fetch --unshallow origin`; shallow
   boundary lies about ancestry per `[[feedback_supervisor_verify_commit_diff_not_subject]]`).
2. `git log -1 origin/master` → expected `952edac4c3` ± drift; run verify-every-ref against the new
   tip and note inline if advanced.
3. `npx playwright install --dry-run webkit` (or equivalent) confirms WebKit present. If absent →
   BLOCKER (harness-warm worktree required, see §3 environment note).
4. `GET https://www.centralreform.live/perform` → 200, paints `PublicSetlistListing`.
5. `BEARER=$(node scripts/supervisor-prod-bearer.mjs)` (reads `SUPERVISOR_PROD_BEARER` from
   gitignored `.env.local` per `[[feedback_supervisor_bearer_persistence]]`); `[ -n "$BEARER" ]`.
6. `list_setlists({})` (admin bearer) returns ≥1 row. Pick a real source setlist with ≥8 song rows
   and ≥1 bonded chart (so swap + key + insert all have material). **NEVER mutate the real id.**

**§0.2 Sandbox: clone the source to a `c13a-leader`-prefixed fixture** (write target for ALL probes):
```js
// Arg shape verified against cycle-12 §0.2 (clone-setlist.ts); RE-CONFIRM at run-time.
// The clone AUTO-stamps isTest:true when newName matches /^\[(TEST|CYCLE\d+-|CF\d+-)/i.
const clone = await mcp.call("clone_setlist", {
  sourceSetlistId: "<real-source-id>",
  newName: "[CYCLE13a-leader] broadcast-trace fixture",
  copyServiceNotes: false,
});
const fixtureSetlistId = clone.setlistId;
const cloneShape = await mcp.call("get_setlist", { id: fixtureSetlistId });
// Assert cloneShape.isTest === true BEFORE any write probe (else BLOCKER + stop — never mutate real data).
```
Capture `cloneShape.tracks[]` (id, type, position, title, key, fileId, songId) — your reference for
asserting receiver state.

**§0.3 Identity: 1 broadcaster + 2 receivers** (per `[[feedback_sandbox_test_isolation]]`:
create-side `uidPrefix`, cleanup-side `prefix`, SAME value `c13a-leader`; 11 chars, lowercase, single
hyphen — passes the test-tokens regex. NEVER `cleanup_all_test_data` without `prefix`):
```js
// David — the BROADCASTER (band_leader → can long-press live-director)
const david = await mcp.call("create_test_account", { role: "band_leader", uidPrefix: "c13a-leader" });
// Aviva — RECEIVER #1, signed-in musician
const aviva = await mcp.call("create_test_account", { role: "musician", uidPrefix: "c13a-leader" });
// RECEIVER #2 = unauth public iPad (QR-scan band member) — NO account; just an iPad context with no auth.

// Hydrate authed contexts with Web-SDK auth (META-003 mitigated when firebaseAuth is passed —
// cycle-4/harness/lib/probe.mjs mintSession({...firebaseAuth})). WITHOUT firebaseAuth the cookie
// alone does NOT hydrate Firestore listeners and the trace lies.
import { mintSession } from "../../cycle-4/harness/lib/probe.mjs";
const leaderCtx   = await openIpad();  await mintSession({ baseUrl, bearer: david.token, uid: david.uid, firebaseAuth: leaderCtx.firebaseAuth });
const receiver1Ctx = await openIpad(); await mintSession({ baseUrl, bearer: aviva.token, uid: aviva.uid, firebaseAuth: receiver1Ctx.firebaseAuth });
const receiver2Ctx = await openIpad(); // public — no mintSession
```

**§0.4 Hardware fidelity (`[[project_band_ipad_hardware]]`):** all 3 contexts run in the
`ipad-webkit` project (820×1180 WebKit portrait; `playwright.config.ts:37-41`) — the band's actual
engine + viewport. Leader may use `ipad-webkit-landscape` (1180×820; `:44-47`) to mirror the
director's stand. Do NOT run any context against chromium/mobile-chrome.
```js
async function openIpad({ orientation = "portrait" } = {}) {
  return await browser.newContext({
    ...devices[orientation === "landscape" ? "iPad Pro 11 landscape" : "iPad Pro 11"],
    viewport: orientation === "landscape" ? { width: 1180, height: 820 } : { width: 820, height: 1180 },
    // serviceWorkers: 'allow' (default — we want the SW cache for the receiver state probes)
  });
}
```

### The synchronized broadcast-trace primitive (reuse across §3.A–§3.D)

```js
// All 3 contexts open the SAME fixture setlist BEFORE the leader acts.
async function openAllOnFixture() {
  const leader   = await leaderCtx.newPage();   await leader.goto(`/perform/setlist/${fixtureSetlistId}`);
  const r1       = await receiver1Ctx.newPage(); await r1.goto(`/perform/setlist/${fixtureSetlistId}`);
  const r2       = await receiver2Ctx.newPage(); await r2.goto(`/perform/setlist/${fixtureSetlistId}`);
  await Promise.all([leader, r1, r2].map(p => p.waitForLoadState("networkidle")));
  return { leader, r1, r2 };
}

// One trace = leader commits an action; both receivers are polled for the reflected change with a stopwatch.
async function broadcastTrace({ leader, r1, r2 }, commitOnLeader, assertReflected) {
  const t0 = await leader.evaluate(() => performance.now());
  await commitOnLeader(leader);                       // e.g. long-press row → Change key → G
  const lat = {};
  for (const [name, page] of [["r1", r1], ["r2", r2]]) {
    const start = await page.evaluate(() => performance.now());
    await page.waitForFunction(assertReflected, { timeout: 10_000 }).catch(() => {});
    lat[name] = (await page.evaluate(() => performance.now())) - start;   // ms to reflect (or timeout=never)
  }
  return { leaderCommitAt: t0, latency: lat };
}
```
**Before each trace, put each receiver into a realistic IN-PROGRESS state** (scrolled mid-list, OR
chart overlay open on the affected track, OR a transpose applied) so BC-3 disruption is observable —
a broadcast landing on an idle list-view tells you nothing about mid-chart disruption.

### §3.A — A3-key broadcast trace (~12 min)
1. `openAllOnFixture()`. Put r1 into chart-overlay open on track-K (in its source key); leave r2 on
   the list scrolled to track-K's row.
2. Leader: long-press track-K → Change key → pick a new key. (Verify the gesture sheet only appears
   for the leader; a musician long-press should NOT open it — gate check, BC via §2.2 auth fold.)
3. `broadcastTrace` asserting r1's open chart header + r2's row key both show the new key.
4. Record BC-1 (did both reflect Y/N), BC-2 (latency each), BC-3 (did r1's open chart flash/reload/
   keep scroll; did r2's scroll jump). A musician mid-chart seeing the key silently change with no
   "key changed" cue is a BC-3 finding even if BC-1/BC-2 pass.

### §3.B — A3-swap broadcast trace (~12 min)
1. `openAllOnFixture()`. Put r1 INTO the chart overlay reading the about-to-be-swapped chart; r2 on
   the row.
2. Leader: long-press track-S → Swap chart → bond a different library chart.
3. Trace: does r1's OPEN chart re-render to the new bytes? Does it reload from scratch (spinner,
   lost scroll within the chart), flash, or swap cleanly? Does r2's row reflect the new title/binding?
4. BC-3 focus: the musician reading the OLD chart at the moment of swap is the highest-friction
   receiver. Capture the exact experience (narrative-shape trace).

### §3.C — A3-insert/reorder broadcast trace (~12 min)
1. `openAllOnFixture()`. r1 scrolled to a row BELOW the insertion point with chart overlay closed;
   r2 with chart overlay OPEN on a song whose index will shift.
2. Leader: long-press a row → Insert song → place "after" → pick a song.
3. Trace: new row appears on both? r1's scroll position — does the inserted row above the fold shove
   r1's visible rows down (lost place)? r2's open overlay — `PDFOverlay`'s `currentIndex` is the
   array index; if an insert shifts indices, does r2's overlay now point at the WRONG song? (Check
   against the `595153b192` self-position model — the URL holds a trackId, but the overlay index is
   positional; an insert above changes the positional mapping. This is the sharpest BC-3 probe.)

### §3.D — MCP-origin broadcast trace (~8 min, ONE trace — disjoint with 13b)
1. `openAllOnFixture()` (r1 + r2 only need to be open; leader page idle).
2. Via MCP (admin bearer), call ONE write that targets the fixture — e.g.
   `swap_chart`/`update_track` (or a `stage_proposal` + `commit_staged_changes`) changing track-M's
   key or binding on `fixtureSetlistId`.
3. Trace: do r1 + r2 (which never touched the leader gesture) reflect the MCP write? Latency? This
   confirms §1.3 (server-timestamp LWW → live propagation) on the deployed surface.
4. ⛔ Do NOT expand into 13b's clone→tweak→publish round-trip. ONE broadcast trace, then stop.

### §3.E — the A3-jump GAP + monitor topology confirm (~8 min)
1. **Document the gap, don't probe a feature that isn't there.** Confirm at run-time that
   `use-setlist-performance.ts` still has `currentTrackIndex = -1` + no-op `setCurrentPosition`
   (`git show origin/master:src/hooks/use-setlist-performance.ts | grep -n "currentTrackIndex = -1\|live stepping removed"`).
   Then state plainly in §F: the leader CANNOT push now-playing position; the band relies on verbal
   cues + each musician's own `595153b192` URL self-tracking. Frame the design question for triage:
   *should there be a leader "we're here now" broadcast, given `[[feedback_err_public_not_gated]]`
   and the wedges-not-IEM live reality?* — DECISION for Daniel, not a bug to fix blindly.
2. **Monitor:** open `/monitor` as Aviva read-only; confirm the §1.4 topology (Firestore-mediated
   personal mixing, no leader→band fan-out). ⛔ ZERO X32/fader writes. One sentence of staleness
   observation, then defer to a future axis.

---

## §4 — Boot order (the cowork instance's runbook)
1. Read this PROMPT end-to-end.
2. Read `.coord/cycle-13-CHARTER.md` (shared frame: phases, anchor set, binding constraints).
3. Read `cycle-4/harness/README.md` for `mintSession` + probe-batch reality.
4. §0.1 boot pre-flight — HARD-BLOCK on shallow / missing-WebKit / no-bearer.
5. §0.2 clone fixture; assert `cloneShape.isTest === true`.
6. §0.3 mint David (broadcaster) + Aviva (receiver) + open public receiver; `mintSession({firebaseAuth})`.
7. §0.4 open all 3 in `ipad-webkit`.
8. Run §3.A → §3.E in order; time-box each; capture latency + BC-3 disruption per trace.
9. Cleanup §6.
10. Write REPORT.md per §5.

---

## §5 — Output shape (the deliverable)

Write **`.paul/research/cycle-13a-leader-broadcast/REPORT.md`** (ONE consolidated file; optional
secondary `findings.jsonl` mirror at §H for grep — markdown is source-of-truth, AP-3 break).

```markdown
# Cycle-13a Leader→band live-broadcast — REPORT

**Run date:** YYYY-MM-DDTHH:MMZ
**Wall-clock:** ~75 min single-thread
**Master SHA at run:** <git log -1 origin/master>  (expected `952edac4c3` ± drift)
**Contexts:** David (band_leader, BROADCASTER) + Aviva (musician, RECEIVER-1) + public iPad (RECEIVER-2)
**Real source setlist (read-only):** <id>
**Fixture clone (write target):** <fixtureSetlistId> — `[CYCLE13a-leader]`; isTest:true verified
**A3 sub-coverage:** A3-key ✓  A3-swap ✓  A3-insert ✓  A3-jump (GAP) documented
**Broadcast bug-class coverage:** BC-1 propagation ✓  BC-2 latency ✓  BC-3 disruption ✓
**MCP-origin trace:** ✓ (one)   **Monitor topology:** confirmed (out-of-broadcast-axis)
**Cleanup state:** clean | partial — list orphans
**Broadcast-readiness verdict:** BROADCAST-RELIABLE | RELIABLE-WITH-FIXES <P0s> | UNRELIABLE-HOLD

## §A — Broadcast-readiness verdict (≤200 words)
Would I trust that a live leader change reaches every band iPad fast enough, without yanking a
musician mid-chart? Anchor on the 3 bug-classes. Name the single biggest receiver-felt risk and
the A3-jump gap's real-world cost.

## §B — WHAT-WE-LEARNED (≥3 broadcast design principles)
One-line distillation + 2-3 sentences each. Designer-actionable, NOT bug counts (AP-4 break).
e.g. "The leader's own device lies — it shows every edit instantly; the band is always N hops behind."

## §C — Findings (broadcast-trace shape, §1 schema; tag BC-1/BC-2/BC-3 + A3 sub + persona)
Each `F-C13A-NNN` carries: action@leader, per-receiver outcome + latency, BC-3 disruption, severity
(RECEIVER-felt), affordance fix (1-3 sentences). Target 5–10. Quality > quantity.

## §D — Broadcast latency matrix (per A3 sub × receiver)
| Trace | Action@leader | R1 reflect (Y/N · ms) | R2 reflect (Y/N · ms) | BC-3 disruption | Verdict |
|---|---|---|---|---|---|
| A3-key   | change-key → G | … | … | … | ✓/partial/regress |
| A3-swap  | swap chart     | … | … | … | … |
| A3-insert| insert after   | … | … | … | … |
| MCP-origin| swap_chart via MCP | … | … | … | … |

## §E — Receiver-disruption ledger (BC-3 detail)
For each trace: what happened to the receiving musician's scroll / open overlay / self-position /
transpose when the broadcast landed. Preserve vs yank.

## §F — The A3-jump GAP + out-of-axis parking lot
The absent now-playing channel (verified at run-SHA): cost + the Daniel decision question. Monitor
topology note. Any A1/A2/A4 frictions seen → defer to cycle-12 scope, do NOT promote.

## §G — Cleanup state (orphans if any)

## §H — Optional findings.jsonl (grep mirror)
{id, a3_sub, bug_class, persona, severity, surface, latency_ms, disruption, fix_hint}
```

### HANDOFF-COMPLETE message body (for `.coord/inbox/supervisor.md`)
```
from cycle-13a-leader-broadcast
HANDOFF-COMPLETE
broadcast-readiness verdict: <BROADCAST-RELIABLE | RELIABLE-WITH-FIXES <list> | UNRELIABLE-HOLD>
A3 sub-coverage: A3-key ✓  A3-swap ✓  A3-insert ✓  A3-jump GAP documented
bug-class coverage: BC-1 ✓  BC-2 ✓  BC-3 ✓   MCP-origin trace: ✓
load-bearing P0/P1 findings (≤5 IDs + one-line traces):
  F-C13A-NNN  P0 BC-3 — <one-line>
cleanup: clean | partial — list orphans
report: .paul/research/cycle-13a-leader-broadcast/REPORT.md
```

---

## §6 — Cleanup (MANDATORY before HANDOFF-COMPLETE, ~5 min)
```js
await mcp.call("delete_setlist", { id: fixtureSetlistId, force: true });
// + any setlist created by an insert/clone side-effect during the run
await mcp.call("cleanup_all_test_data", { prefix: "c13a-leader" }); // NEVER without prefix
await mcp.call("list_test_accounts", {});           // → none matching c13a-leader
await mcp.call("list_setlists", {});                // → no [CYCLE13a-leader] rows
```
Any residual → list under §G "Manual cleanup needed".

---

## §7 — Anti-patterns explicitly broken (charter §Phase-2 required disclosure)
- **AP-1 (class-violation findings).** Every finding is a broadcast trace anchored to a real
  mid-service leader action with a RECEIVER-felt severity. Cards reducible to "h-14 vs HIG" with no
  receiver friction → §F.
- **AP-3 (JSONL primary).** REPORT.md is source-of-truth; `findings.jsonl` §H is a grep mirror only.
- **AP-4 (findings-as-only-output).** §A verdict + §B principles + §D latency matrix + §E disruption
  ledger + §F gap-analysis carry the design insight; the bug list is one section of six.
- **AP-7 (single-state probe).** THE signature break: every trace is a synchronized 3-context
  observation (1 broadcaster + 2 receivers). A broadcast is unobservable single-context.

Does NOT break (structurally vulnerable — noted for future awareness):
- **AP-2 (app-wide roam).** Deliberately narrow — one surface-family (leader→band content sync) on
  one fixture. Breadth (full app) is a future cycle's problem.
- **AP-5 (audit-the-app stance).** Trace cards keep an observer voice on the leader side; receiver
  beats use first-person musician POV. The hybrid is deliberate.

---

## §8 — Operational rules + hard out-of-scope
**Binding:**
- ⛔ No writes to the real source setlist. Every write hits the `[CYCLE13a-leader]` fixture clone.
- ⛔ ZERO live X32 / monitor / fader writes (`/monitor` is read-only-observe in §3.E).
- ⛔ No bearer / secret in any file under the repo. Redact as `***redacted***`.
- ⛔ NEVER `cleanup_all_test_data` without `prefix:"c13a-leader"` (sweeps sibling 13b/13c/13d fixtures
  per `[[feedback_self_inclusion_test_fixtures]]`).
- ⛔ `[[feedback_err_public_not_gated]]`: any fix idea must NOT gate broadcast data from musicians —
  err public. The A3-jump gap fix (if proposed) must not introduce a "private/leader-only" mode.
- ⛔ `[[feedback_no_saturday_framing]]`: NO Saturday/downbeat/service-gate framing. "Mid-service"
  here means "while the band is playing," generically — not a date-pegged deadline.

**Hard out-of-scope (do NOT probe):**
- Repo-root `mcp/`, `bridge/`, `SetlistGrid.tsx`, `src/lib/mcp/errors.ts`, `error-envelopes.ts`.
- 13b's MCP authoring round-trip (clone→tweak→bond→publish matrix) — §3.D is ONE broadcast trace only.
- 13c's offline/WebKit-engine re-verify, 13d's bond-hygiene + chart-bind picker.
- A1/A2/A4 anchors (cycle-12 owns; defer to §F if seen).
- Building the missing now-playing channel — this PROMPT DOCUMENTS the gap for Daniel's decision.

---

## §9 — Success criterion (auditor checks before ACCEPT)
The cowork RUN "ran successfully" iff:
- All 3 in-app A3 sub-traces (key/swap/insert) ran across BOTH receivers with a latency number (or
  explicit "never") per receiver.
- The ONE MCP-origin trace ran.
- §D latency matrix has a verdict per row (no `?` cells).
- The A3-jump gap is verified at run-SHA + framed as a Daniel decision in §F.
- §A verdict decisive; §B ≥3 principles; §E disruption ledger present.
- Cleanup §6 verified empty (or §G lists orphans).
- HANDOFF-COMPLETE in supervisor inbox.

**Auditor verification (Tier-0 doc for THIS prompt-design lane; Tier-1 for the eventual RUN):** per
`[[feedback_auditor_deployed_surface_verification]]`, sample 2-3 P0/P1 traces against the deployed
surface (multi-context Playwright re-fire or MCP curl) before ACCEPTing the RUN. Verify the §3.E gap
claim independently via the `git show origin/master:` grep.

---

## §10 — Sign-off
The cowork instance signs the supervisor inbox HANDOFF-COMPLETE `from cycle-13a-leader-broadcast`.
The auditor reads REPORT against (a) verify-every-ref pass (b) §D matrix full (c) §A verdict + §B
principles + §E ledger present (d) §3.E gap independently confirmed (e) cleanup verified.

Go.

— from coder-1 (lane `cycle-13a-leader-broadcast-PROMPT-design`)
