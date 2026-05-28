# Cycle-12 Saturday-readiness — REPORT (FICTIONAL SAMPLE)

> ⚠️ **This is a SAMPLE.** No cowork instance has run yet. This file demonstrates
> what a finished cycle-12 cowork RUN's REPORT.md would look like in the hybrid
> methodology. The numbers, beats, screenshots, and findings are FICTIONAL but
> realistic — anchored on real components, real SHAs, real tracks-shape from
> `cd2010f4`. Use it to imagine the cowork run before reading the real one.

**Run date:** 2026-05-29T02:00Z (fictional)
**Wall-clock:** 78 min single-thread
**Master SHA at run:** `0709bccfa6` (no drift since dispatch)
**Personas exercised:** Aviva (musician) + David (band_leader) + Daniel (admin via admin-test-session)
**Real Saturday setlist (reference, read-only):** `cd2010f4-8bb0-4f54-ba2d-8a79d83729a6` (20 tracks · 16 songs · 4 dividers · eventDate 2026-05-30T15:00Z · owner Daniel)
**Fixture clone (write target):** `8e3b1a2c-fabricated-fictional-id-9d7e6f5a4b3c` — `[CYCLE12-saturday] c12 Bnei Mitzvah readiness probe`; `isTest:true` verified at create-time ✓
**Anchor coverage:** A1 ✓ A2 ✓ A3 OUT-OF-SCOPE A4 ✓
**Bug-class coverage:** stickiness ✓ fresh-tablet OUT-OF-SCOPE auth-divergence ✓
**Cleanup state:** clean
**Saturday-readiness verdict:** **SHIP-WITH-FIXES [F-C12-002, F-C12-005]** — two P0s with clear fixes; 18-hour window is enough

---

## §A — Saturday-readiness verdict (≤200 words)

I'd ship Saturday if and only if F-C12-002 (offline blob-URL fetch hang during a
sanctuary-wifi blip) and F-C12-005 (transpose state sticks across track jumps,
showing a stale "+2" on the next chart's toolbar) ship as fixes before downbeat.
The 18-hour window is comfortable for both — F-C12-002 is a 4-line conditional
adjustment in `PDFOverlay.tsx`, F-C12-005 is a 1-call `setTransposeOffset(0)` in
the track-change handler in `SetlistPerformClient.tsx`. Without those fixes,
Aviva loses ~3-4 seconds and a confidence dent in the A2 window twice in a
20-track service; David — who only band-leads, doesn't play the chart — wouldn't
feel it but Aviva and the cantor would. The remaining 8 findings are P1/P2 polish
items that won't bite Saturday. The cycle-11 fix-wave's stickiness changes
(`595153b192` track-position-in-URL, `ae647fac20` songCount denorm, `0aef7d53d0`
landing SSR) all HOLD across the full 20 tracks across 3 personas — zero
regressions on the just-landed code, which is the strongest possible
verification-time signal that cycle-11's fix wave was correctly scoped.

---

## §B — WHAT-WE-LEARNED (4 design principles)

- **"Sticky-across-tracks is now a friction class of its own."** The cycle-11
  fixes made per-track state more legible (transpose `+N` indicator,
  track-position-in-URL). The legibility raised the stakes on which state is
  per-track vs per-session — and the current "transpose is per-session" is now
  visibly wrong because the indicator that broadcasts it is per-track-context.
  F-C12-005 is the worked example.

- **"`goOffline` + blob: URLs is a deeper-than-it-looks coupling."** The
  `e2e/helpers/gestures.ts:50-65` comment block warned about
  `context.setOffline(true)` breaking blob: URL fetches and giving false
  failures — that lesson lives in the harness. But the IN-APP code path
  (PDFOverlay's first-tap blob-URL resolver) appears to have the inverse bug
  when navigator.onLine flips false mid-session: the resolver hangs instead
  of failing-fast or showing a "Offline — chart not cached" pill. F-C12-002.

- **"songCount denorm is now ROBUST across all four prior leak paths."** The
  §D regression table shows all four `ae647fac20` leak paths (`clone_setlist`,
  `clone_setlist_from_template`, `createSetlistServerSide`,
  `commit_staged_changes`) maintain songCount correctly. The cycle-10 C10I1-002
  songCount-mismatch class is structurally closed for the Saturday-flow surfaces.

- **"`isTest`-clone auto-stamping works correctly."** §0.2's clone produced
  `isTest:true` automatically via the `[CYCLE12-...]` name heuristic — no
  followup `update_setlist({isTest:true})` call needed. The
  err-public-not-gated invariant + isTest-auto-stamp combine to give a clean
  sandbox: the c12 clone is auto-isTest-excluded from the public `/perform`
  landing while `cd2010f4` (real, isTest:false) is auto-listed. That's the
  shape we want.

---

## §C — Findings (per the §1 hybrid shape)

10 findings total; 2 P0, 4 P1, 4 P2. Ordered by severity. Two cross-reference
each other (F-C12-005 narrative ↔ F-C12-006 matrix).

### F-C12-001 — Aviva's first-tap chart spinner during a deliberate offline pre-cache (RESOLVED — flake)

- **Shape:** narrative
- **Persona:** Aviva
- **Anchor moment:** A1
- **Worry axis:** offline-survival
- **Timeline beat:**
  > 9:38:11 — Aviva taps "Modah Ani" (track 3) for the first time during pre-service.
  > Chart open is normally <1s. Today it took 4.2 seconds on the first tap, then
  > <500ms for tracks 4-20. Re-ran the §3.A walk twice more, the slow-tap did not
  > reproduce. Bucket: "intermittent network warmup, not a stickiness issue."
- **Verdict:** PASS-WITH-NOTE; downgraded from initial finding to flake (§F parking).

### F-C12-002 — Chart hangs on `goOffline` mid-render; "Loading…" never resolves *(P0 — must-ship)*

- **Shape:** heuristic
- **Heuristic:** H8 (Help, recognize, recover from errors)
- **Stress condition:** S-offline (axis-1)
- **Anchor moment:** A4 (sanctuary edge)
- **Persona:** Aviva
- **Surface:** `src/components/performance/PDFOverlay.tsx` (chart-overlay)
- **The musician's experience:**
  > "I tap the next track. 'Loading chart…' appears. The wifi just dropped (it's
  > a sanctuary; this happens). The spinner never resolves. I don't know if it's
  > my tap that didn't register, the wifi, or the chart. I tap again. Same spinner.
  > I'm now 8 seconds into a 6-second window."
- **The heuristic violation:** Under S-offline, the same UI ("Loading chart…")
  signals two distinct states — "wifi fine, slow chart" vs "wifi dead, chart
  will never come." H8 says the app must tell the musician what's wrong.
- **The stress condition that activates it:** S-offline (axis-1) — under flaky
  sanctuary wifi mid-set, indistinguishable spinner-states cost the musician
  4+ seconds of "is this me?" before they take action.
- **Affordance fix (1-3 sentences):** When `navigator.onLine === false` (or
  after ~2s of stalled chart load), surface a distinct "Offline — chart not
  cached" pill. The `KeepAwakeToggle` lastError pattern shipped `fd9e5c8439`
  is the template — same idea, different state. Estimated fix: 4 lines in
  PDFOverlay's load-resolver + a new `chart-offline-pill` component (~30 lines).
- **Repro:** 5 steps via `e2e/perform-ipad-offline.spec.ts`-style harness;
  100% deterministic across 3 trials per persona (Aviva + David's musician-view).
- **Severity (musician-felt):** P0 — A4 service-block class.

### F-C12-003 — Aviva's wake-lock survives an offline blip cleanly ✓ (positive finding)

- **Shape:** matrix
- **Cell-ID:** `M.OFF.WL.D3` (offline × wake-lock × cold-reload)
- **Action:** `goOffline()` then `goOnline()` while wake-lock is on
- **Surface:** `/perform/setlist/<fixtureSetlistId>/track/<trackId>`
- **Identity:** Aviva (musician)
- **Persistence:** wake-lock state observed before/during/after offline
- **Anchor:** A4
- **Expected:** Wake-lock stays on; no spurious `lastError` from network drop
- **Observed:** Wake-lock stays on; `lastError` remains null through the
  offline→online cycle ✓
- **Severity:** PASS — counter-evidence that the cycle-11 `fd9e5c8439`
  wake-lock changes correctly distinguish network-loss from wake-lock-loss.

### F-C12-004 — David sees the c12 fixture clone in his `list_setlists` ✓ (positive finding, scope-correct)

- **Shape:** matrix
- **Cell-ID:** `M.AD.B4.C2` (auth-divergence × MCP-read × band_leader)
- **Action:** `list_setlists({})` as David (band_leader bearer)
- **Surface:** MCP read tool
- **Identity:** David (band_leader)
- **Expected:** David sees the fixture clone (he's a band_leader, broad scope)
- **Observed:** ✓ David sees the c12 clone in `list_setlists` response;
  unauth `list_setlists` would 401, musician Aviva would see her own scope
  (which excludes David's clone because he's the clone owner). Auth-divergence
  shape is intentional + correct.

### F-C12-005 — Aviva's transpose vanishes when she jumps to track 12 *(P0 — must-ship)*

- **Shape:** narrative (cross-ref F-C12-006 matrix)
- **Persona:** Aviva
- **Anchor moment:** A2 (between-songs scramble)
- **Worry axis:** stickiness (cycle-11 M3-004 / `fd9e5c8439` regression check)
- **Timeline beat:**
  > 10:23:14 — Aviva is on track 11 "Etz Chayim Hi" in F. The cantor finishes
  > the verse. David nods toward track 12 "Hashkiveinu" — keyed C in the setlist.
  > Aviva swipes left to advance. The chart paints in C at 10:23:17. **But the
  > toolbar's transpose pill still shows "+2" — the value from track 11.** She
  > glances down expecting "+0", sees "+2", does the math in her head, plays the
  > head in D, realizes 3 bars in that the chart is showing C-major but her
  > playing is in D-major. **Friction cost: 2.4 sec confusion + 3 bars of
  > misplay in front of the family.**
- **Surface (mechanism footnote):** `PerformanceToolbar.tsx` post-`fd9e5c8439`
  shows the signed-offset buttonLabel; the per-track transpose-state is sticky
  ACROSS tracks in the same session — `SetlistPerformClient.tsx` track-change
  handler doesn't reset the transpose offset.
- **Severity (musician-felt):** P0 (A2 — actively spent her 6-sec window).
- **Affordance fix (1-3 sentences):** Reset transpose to 0 on track jump (treat
  as per-track override, not session-global). Alternative: persist transpose
  per track in URL (mirrors `595153b192` pattern). The per-track-URL fix is
  stronger because it also handles reload, but the simpler reset-on-jump fix
  ships before Saturday.
- **Cross-reference:** F-C12-006 matrix.

### F-C12-006 — Transpose state cross-track persistence matrix *(cross-ref of F-C12-005)*

- **Shape:** matrix
- **Cell-ID:** `M.S.A1.D5` (transpose × cross-track-jump persistence)
- **Action:** transpose +N on track A, then jump to track B
- **Surface:** /perform/setlist/<fixtureSetlistId>/track/<trackId>
- **Identity:** Aviva (musician), David (band_leader) — same observation both
- **Anchor:** A2
- **Expected:** Track B's transpose state is 0 (its own default)
- **Observed:** Track B's transpose state is N (carried from track A) across
  all 19 (N, N+1) transitions; 100% deterministic
- **Severity:** P0 (mirrors F-C12-005's musician-felt cost).
- **Affordance fix:** See F-C12-005.

### F-C12-007 — Daniel-as-admin can see the c12 clone via `list_setlists` ✓ (positive finding)

- **Shape:** matrix
- **Cell-ID:** `M.AD.B4.C5` (auth-divergence × MCP-read × admin-via-admin-test-session)
- **Identity:** Daniel (admin via admin-test-session, `MCP_ADMIN_TEST_SESSION_SECRET` was set)
- **Expected:** Admin scope sees everything including isTest fixtures
- **Observed:** ✓ Daniel sees both c12 clone + real cd2010f4 + sibling
  test-fixtures from other parallel cowork instances (which is fine; admin scope is global).
- **Note:** This cell would be `⊘ skipped` if the secret were unset; documenting
  that it ran successfully validates the admin-test-session is correctly
  configured for cycle-12.

### F-C12-008 — Auth-indicator pill / QR card mutual-exclusion holds across personas ✓ (positive finding)

- **Shape:** matrix
- **Cell-ID:** `M.AUTH.LAND.{C6,C3,C2,C5}` (landing × 4 auth states)
- **Action:** GET `/perform`
- **Surface:** `/perform` landing (`PublicSetlistListing.tsx`)
- **Identity:** unauth (C6), Aviva musician (C3), David band_leader (C2), Daniel admin (C5)
- **Expected:** QR card visible iff signed-out; auth-indicator visible iff signed-in
- **Observed:** ✓ all 4 cells correct. Cycle-11 `0aef7d53d0` mutual-exclusion fix HOLDS.

### F-C12-009 — Cron `verify-chart-bond-health` widened scope holds ✓ (positive finding)

- **Shape:** matrix
- **Cell-ID:** `M.CRON.SCOPE.{cd2010f4-in,c12-clone-out}`
- **Probe:** `curl -H "Authorization: Bearer $CRON_SECRET" https://centralreform.live/api/cron/verify-chart-bond-health`
- **Expected:** cd2010f4 in `surveyed` count; c12 clone EXCLUDED via in-process `isTest:true` filter
- **Observed:** ✓ `surveyed=42`; cd2010f4 verified in scope; c12 clone verified excluded.
  Cycle-11 `0709bccfa6` widened-scope fix HOLDS for the Saturday-readiness scenario.

### F-C12-010 — David's `commit_staged_changes` correctly updates songCount on multi-edit ✓ (positive finding)

- **Shape:** matrix
- **Cell-ID:** `M.S.COMMIT.SONGCOUNT` (`ae647fac20` denorm regression)
- **Action:** `stage_proposal` then `commit_staged_changes` removing 2 tracks
- **Identity:** David (band_leader)
- **Expected:** Post-commit `songCount` = 14 (16 − 2)
- **Observed:** ✓ `songCount` correctly 14. Cycle-11 denorm fix on this path HOLDS.

---

## §D — Cycle-11 SHA regression matrix (FICTIONAL SAMPLE)

| Fix SHA | Probe | Persona | Verdict | Note |
|---|---|---|---|---|
| `595153b192` track-position-in-URL | 20 tracks × URL preservation | Aviva | ✓ all 20 | Every track ID round-trips correctly through reload |
| `fd9e5c8439` transpose +N indicator | 4 sample tracks × reload | Aviva | ✓ 4/4 | Indicator persists; reload restores transposed state |
| `fd9e5c8439` wake-lock lastError pill | visibility-change probe | Aviva | ✓ | `lastError='hidden'` surfaces correctly; auto-clears on visibility-restore |
| `0aef7d53d0` SSR-prefetch isTest exclusion | unauth GET /perform | (anon) | ✓ | c12 clone excluded ✓; cd2010f4 included ✓ |
| `0aef7d53d0` auth-indicator/QR card exclusion | each of 4 auth states | all | ✓ | See F-C12-008 |
| `ae647fac20` songCount denorm on clone_setlist | post-§0.2 clone | David | ✓ | songCount=16 on first clone; ✓ on secondary clone (16 again) |
| `ae647fac20` songCount on commit_staged_changes | stage→commit | David | ✓ | See F-C12-010 (songCount=14 post 2-track removal) |
| `0709bccfa6` cron-bond-health widened scope | curl /api/cron/verify-chart-bond-health | (anon w/ CRON_SECRET) | ✓ | See F-C12-009 |

**Net:** 8/8 ✓. ZERO regressions on the cycle-11 fix-wave surfaces.

---

## §E — Offline-survival matrix (axis-1)

| Probe | Aviva | David | Daniel |
|---|---|---|---|
| Already-loaded chart readable when offline | ✓ | ✓ | ✓ |
| Wake-lock survives offline transition | ✓ (F-C12-003) | ✓ | ✓ |
| SW / Firestore offline-cache holds chart bytes | ✓ | ✓ | ✓ |
| Bond-fail recovery on reconnect | ✓ | ✓ | ✓ |
| Sanctuary-blip mid-song doesn't nuke next-track entry | **✗ F-C12-002** | **✗ F-C12-002** | **✗ F-C12-002** |

15/15 cells run; 12/15 ✓; 3/15 ✗ (all F-C12-002 — same root cause, same fix).

---

## §F — Out-of-cycle-12 scope (parking lot)

Findings that surfaced during the walk but are OUT of cycle-12 scope per
Daniel directive. Noted for supervisor's triage; NOT promoted.

- **A3-class friction:** During §3.B sweep, David's leader-side transpose on
  track 7 propagated to Aviva's view with a ~4s delay. Could be a stickiness
  finding, could be a Firestore listener cadence finding, could be intentional
  (debounce). Out of cycle-12 scope (A3); flag for cycle-13.
- **F-C12-001 flake:** initial slow chart on track 3, didn't reproduce.
  Probable transient network jitter; noting in §F not promoting.
- **Battery-dim glare-impacted contrast on chord-symbol overlay:** observable
  at 30% brightness on the iPad. Out of cycle-12 scope (cycle-11 M3 covered
  battery / glare); flag for a future polish lane.

---

## §G — Cleanup state

```
[2026-05-29T03:14Z] delete_setlist({id:"8e3b1a2c-fabricated-fictional-id-9d7e6f5a4b3c", force:true}) → ok
[2026-05-29T03:14Z] cleanup_all_test_data({prefix:"c12-saturday"}) → swept 3 accounts, 0 setlists residual, 0 charts residual
[2026-05-29T03:14Z] list_test_accounts() → none matching c12-saturday ✓
[2026-05-29T03:14Z] search_library({query:"c12-saturday"}) → empty ✓
[2026-05-29T03:14Z] list_setlists({}) → no [CYCLE12-saturday] or c12-saturday-named setlists ✓
```

Clean.

---

## §H — Optional `findings.jsonl` mirror (grep secondary)

```jsonl
{"id":"F-C12-001","shape":"narrative","anchor":"A1","axis":"offline","persona":"aviva","severity":"flake","surface":"PDFOverlay.tsx","fix_hint":null}
{"id":"F-C12-002","shape":"heuristic","anchor":"A4","axis":"offline","persona":"aviva","severity":"P0","surface":"PDFOverlay.tsx","fix_hint":"offline-pill via navigator.onLine + 2s stall threshold"}
{"id":"F-C12-003","shape":"matrix","anchor":"A4","axis":"offline","persona":"aviva","severity":"pass","surface":"KeepAwakeToggle.tsx","fix_hint":null}
{"id":"F-C12-004","shape":"matrix","anchor":"A1","axis":"auth-divergence","persona":"david","severity":"pass","surface":"MCP list_setlists","fix_hint":null}
{"id":"F-C12-005","shape":"narrative","anchor":"A2","axis":"stickiness","persona":"aviva","severity":"P0","surface":"SetlistPerformClient.tsx","fix_hint":"reset transpose=0 on track-change OR persist per-track URL"}
{"id":"F-C12-006","shape":"matrix","anchor":"A2","axis":"stickiness","persona":"aviva","severity":"P0","surface":"SetlistPerformClient.tsx","fix_hint":"see F-C12-005"}
{"id":"F-C12-007","shape":"matrix","anchor":"A1","axis":"auth-divergence","persona":"daniel","severity":"pass","surface":"MCP list_setlists","fix_hint":null}
{"id":"F-C12-008","shape":"matrix","anchor":"A1","axis":"auth-divergence","persona":"all","severity":"pass","surface":"PublicSetlistListing.tsx","fix_hint":null}
{"id":"F-C12-009","shape":"matrix","anchor":"A1","axis":"stickiness","persona":"anon","severity":"pass","surface":"/api/cron/verify-chart-bond-health","fix_hint":null}
{"id":"F-C12-010","shape":"matrix","anchor":"A1","axis":"stickiness","persona":"david","severity":"pass","surface":"commit_staged_changes","fix_hint":null}
```

---

## HANDOFF-COMPLETE message body (fictional sample, for `.coord/inbox/supervisor.md`)

```
from cycle-12-saturday-readiness
HANDOFF-COMPLETE
Saturday-readiness verdict: SHIP-WITH-FIXES [F-C12-002, F-C12-005]
anchors-covered: A1 ✓  A2 ✓  A3 OUT  A4 ✓
bug-classes-covered: stickiness ✓  fresh-tablet OUT  auth-divergence ✓
load-bearing P0/P1 findings:
  F-C12-002  P0 heuristic — Chart hangs on goOffline mid-render; "Loading…" never resolves
  F-C12-005  P0 narrative — Aviva's transpose vanishes when she jumps to track 12
  F-C12-006  P0 matrix    — (cross-ref of F-C12-005)
cycle-11 SHA regressions (any): zero — all 8 SHAs ✓ across 3 personas
cleanup: clean
report: .paul/research/cycle-12-saturday-readiness/REPORT.md
```

---

*— FICTIONAL sample by coder-1 for cycle-12 prompt-design lane. A real cowork
RUN's REPORT will have real timestamps, screenshots, repro logs, and
auditor-verifiable evidence. This file is a shape-guide, not a result.*
