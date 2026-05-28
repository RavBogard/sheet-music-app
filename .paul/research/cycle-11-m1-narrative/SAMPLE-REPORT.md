# Cycle-11 M1 — SAMPLE REPORT (fictional but realistic)

> **This is what a finished cowork RUN under the M1 methodology would look like.** Not a real run.
> Lets Daniel + supervisor read the shape and pick between M1 / M2 / M3 on the basis of what the
> output FEELS like to consume. The fictional findings borrow shapes from real cycle-10
> regressions to stay grounded, but the timeline, musician identities, and timestamps are invented.

---

# Cycle-11 M1 Cowork HANDOFF — Musician-shadow scenario-narrative
**(SAMPLE — not a real run; serves as the rendered template Daniel reads to pick a methodology)**

**Run date:** 2026-05-30T18:00Z (fictional Saturday morning B'nei Mitzvah day)
**Wall-clock:** 74 min single-thread
**Vehicle:** live walking judgment on a real iPad Air via Vercel preview + selective harness specs
(`ipad-stuck-spinner-probe`, `perform-ipad-pwa-fresh-install`, `chart-bind-ipad`) — invoked inline
where a beat needed deterministic replication.
**Identity states exercised:** A (band_leader `daniel@centralreform.org`), B (fresh-incognito), C
(fresh-tablet via `browser.newContext()` no storageState).
**Master SHA at run:** `8390b31aac`
**Services walked:**
- Scenario 1: 2026-05-30 Saturday-morning B'nei Mitzvah of Gavin Stein setlist `cd2010f4-8bb0-…`
- Scenario 2: 2026-06-01 Shavuot Yizkor setlist `UnjLqKTtS4lN…`
- Scenario 3: 2026-06-05 Friday-evening Kabbalat Shabbat (clone of "Randy Shabbat morning"
  template into `c11m1-scratch-erev-shabbat` scratch slot, deleted in cleanup).
**Cleanup state:** clean — 1 scratch setlist created + deleted; 1 test account minted + revoked.
**Anchor coverage:** A1 ✓ (S1 b1-5, S2 b1-5, S3 b1-2) · A2 ✓ (S1 b7+11, S3 b3) · A3 ✓ (S1 b8-9, S3
b4-5) · A4 ✓ (S2 b7, S3 b6+8).
**Bug-class coverage:** stickiness ✓ (S1 b8/10, S3 b6/7) · fresh-tablet ✓ (S2 b5/7, S3 b6) · auth-
divergence ✓ (S2 b4/8, S3 b7).

## Service-impact verdict

**N-FRICTION — Saturday would land**, but Aviva, Yossi, and Sarah each lost cumulatively ~25-40
seconds across their service to friction the surface should absorb. The worst beat: **Sarah's
mid-service transpose silently reverted on a battery-die reload** (S3 19:14, HIGH HOLD) — if the
real Erev Shabbat had hit a battery-swap mid-set, she'd have played Lecha Dodi in the leader's
original key instead of the called-down key. No outright BLOCKER reproduced. The single biggest
fix the band will feel this week is the in-chart-transpose persistence (S3 19:14 + S1 9:51:02) —
two HIGH frictions from one missing localStorage write.

## Scenario 1 — Aviva walks Saturday morning B'nei Mitzvah

### Identity + setting
Aviva, 35, sings tenor + plays guitar. Signed in on iPad #3 since Friday. Sanctuary lighting:
bright skylight, iPad tilted on a music stand. Pre-service: 9:38am, downbeat 10:00am.

### Timeline

**9:38:00** — Aviva picks up iPad #3 from the band table. Screen wakes to the last-loaded page,
which is `/perform`. Skeleton paints under 200ms. ✓

**9:38:04** — Card list renders. Saturday's "B'nei Mitzvah of Gavin Stein — May 30" sits at the
top of the upcoming-section. ✓ (`splitPublicSetlists` correctly placed today's service at top.)

**9:38:11** — She taps the card. **[FRICTION 9:38:11 HIGH HOLD-POST-SERVICE]** — the card itself
read "0 songs" though the header now reads "16 songs · 20 items". She freezes for ~3 seconds —
*was that the right setlist?* — then re-reads the title and accepts it.
- **Severity:** HIGH (A1 setup-prep, trust erosion).
- **Mechanism (footnote):** `setlist.songCount` denorm stale; `8139a443ec` denorm-write fix
  shipped but the auto-heal cron tick hadn't fired for this row yet at run time. Verify via
  `get_setlist({id})` whether `songCount===0`; backfill via `recompute_setlist_track_count`.
- **Ship-class:** SAFE-NOW-DATA (run the recompute on the 5 public-listing rows) + HOLD-POST-
  SERVICE for the upstream "songCount-on-track-add" hook coverage gap.

**9:39:05** — Setlist header notes "Save 15/16" — one chart not cached for offline.
**[FRICTION 9:39:05 INFO operational]** — she taps Save, wifi is good, advances to 16/16 in 4
seconds. Cost: 4 sec + "wait, was that fine?" — the indicator doesn't tell her which song was
missing.
- **Severity:** INFO (operational, not a code defect; band/Daniel action).
- **Ship-class:** SAFE-NOW (operational). Future enhancement: surface the missing-chart name in
  the indicator.

**9:39:43** — She taps the first song. **[FRICTION 9:39:43 HIGH HOLD]** — first-tap returns no
chart; "Loading chart…" frozen for 3.2 seconds, then chart appears. She mutters "is it me or the
wifi." Confidence dent.
- **Severity:** HIGH (A1 setup-prep beat; the cycle-10 ipad-stuck-spinner-probe class).
- **Mechanism (footnote):** PDFOverlay first-tap precache race; `575bc47ae` shipped a fix but may
  have regressed; reproduce via `npx playwright test e2e/ipad-stuck-spinner-probe.spec.ts
  --project=ipad-webkit` against current SHA.
- **Ship-class:** HOLD-POST-SERVICE.

**9:40:22** — Toolbar sweep at the bottom of the chart overlay. Zoom in/out, Monitor mix,
Transpose — measured via DevTools getBoundingClientRect: all **44×44 or wider** ✓. The post-
`4bcefb929c` `h-11` bump landed and held. Aviva taps Transpose; the popover opens cleanly without a
mis-tap on Zoom-out, which sits ~12px away.

**9:40:58** — In-chart KeepAwakeToggle test. Aviva reaches the toggle from inside the chart
overlay (post-`4bcefb929c` wakeLock prop wiring). She arms it; the indicator shows ON. She exits to
the setlist, re-enters Modah Ani — the toggle reads ON. ✓

**9:42:18** — Stickiness probe: Aviva transposes Modah Ani down a whole step (D → C). Closes the
popover. Opens the next song (Adon Olam). Returns to Modah Ani. **[FRICTION 9:42:18 HIGH HOLD]** —
Modah Ani is back in D. Her down-whole-step is gone.
- **Severity:** HIGH (A3 mid-service change beat — if she'd transposed during the rabbi's call,
  the transpose would have evaporated on the next song-switch).
- **Mechanism (footnote):** transpose state held in `useMusicStore` zustand, not persisted to
  localStorage or per-song user-preference doc. Reload-class probe in beat 9 confirms.
- **Ship-class:** HOLD-POST-SERVICE (touches state mgmt).

**9:43:00** — Reload probe (cold-reload stickiness): Aviva hard-reloads the setlist page. Modah
Ani is in D (still untransposed; consistent with 9:42:18 finding). The reorder she didn't perform
isn't relevant.

**9:44:30** — Cross-musician sticky probe: from a sibling identity-A window (acting as the leader
in real time), reorder the second song to fourth position. Aviva's view updates without manual
reload within 1.4 sec. ✓ Firestore listener convergence works.

**9:46:08** — Annotation probe: Aviva annotates Modah Ani with a finger-drawn highlight on bar 14.
Page-turns. Returns to bar 14. Highlight persists. ✓ Reloads. **[FRICTION 9:46:08 MED HOLD]** —
the annotation is gone.
- **Severity:** MED (annotation surviving reload is implicit in "Perform mode" expectation but
  Aviva would re-annotate before downbeat without much fuss).
- **Mechanism (footnote):** annotations live in `useMusicStore.annotations` (per-chart Map),
  state-only; not persisted to Firestore or IndexedDB. Same root as transpose at 9:42:18.
- **Ship-class:** HOLD-POST-SERVICE.

**9:48:30** — Sanctuary-edge beat: drop wifi via DevTools. Tap into the next song. Chart loads
from cache. ✓ Tap into a song Aviva hasn't previewed. Chart loads (the "Save 16/16" earlier
indicator was honest). ✓

### WHAT-WE-LEARNED (Scenario 1)

The post-cycle-10 toolbar + wake-lock fixes landed and Aviva felt them — she didn't mis-tap, the
toggle was reachable from the chart, and offline survived. The remaining frictions for a returning
band member are clustered in **state persistence**: transpose, annotation, and the songCount
display all carry a "but does it stick?" hazard, and the answer was "not really" for two of three.
The chart-of-discontent across the morning is not the toolbar (fixed) but the *zustand store
treated as ephemeral*. From the musician's POV that's a single class of frustration with three
costumes.

The 9:38:11 "0 songs" moment is the SECOND time Aviva mentally checked whether she was on the
right setlist before she ever loaded a chart. A confidence dent the size of three seconds on a
Saturday morning is the kind of thing the band stops noticing because they've adapted around it —
which is exactly when it's worth fixing.

## Scenario 2 — Yossi walks Yizkor evening (the guest case)

### Identity + setting
Yossi, 41, violin. Guest player David L. brought. Has never opened this app. Holding a paper
handout with a QR code and a printed setlist link. Fresh-incognito Safari, 6:45pm, downbeat 7:00.

### Timeline

**6:45:00** — Scans the QR with his phone, lands on `https://www.centralreform.live/perform` on
the borrowed iPad #5 (which Daniel handed him 90 sec ago). Skeleton paints. Card list renders. ✓

**6:45:08** — The logged-out Sign-In card pinned to the top of the listing reads:
> **Sign in to CRC Music** — Scan QR with phone, or Continue with Google.

**[FRICTION 6:45:08 MED SAFE-NOW-COPY]** — Yossi reads it as "you need to sign in to see the
setlist." He has the QR Daniel printed in his hand; he assumes it's for the in-card scan. He hovers
over the card without tapping the setlist below. Cost: ~6 seconds of "do I have to do this first
before I can see the songs?" hesitation. (The actual policy per `[[feedback_setlist_public_
policy]]` is that setlist content on `/perform/setlist/<id>` is PUBLIC by design — Yossi could just
tap the setlist card and see everything.)
- **Severity:** MED (A1 setup-prep, copy hazard for guest musicians).
- **Mechanism (footnote):** `QRSignIn` heading "Sign in to CRC Music" is unambiguous about the
  card's purpose but implies the listing below requires it. Copy nudge: add subhead "Or tap a
  service below to follow along without signing in."
- **Ship-class:** SAFE-NOW (copy).

**6:45:28** — David L. (band_leader) leans over and says "just tap the Yizkor card, you don't have
to sign in." Yossi taps. Setlist loads. He sees the 28 items. ✓ — (This is the moment where a real
guest would have stalled without a sibling musician nearby. The methodology counts this as the
proof point that the copy ambiguity matters.)

**6:46:11** — Yossi taps the first song. **[FRICTION 6:46:11 HIGH HOLD]** — chart spinner for
4.8 seconds. Yossi's fresh-incognito profile has no service-worker cache, no offline chart bytes;
the bytes are loading fresh from `/api/drive/file`. The NAT'd band wifi is slower for this first-
ever request than for Aviva's cached chart at 9:39.
- **Severity:** HIGH (A4 sanctuary edge — deep-link entry on a fresh tablet; the regression class
  Daniel called out as bug-class #2 fresh-tablet cache divergence).
- **Mechanism (footnote):** chart-byte fetch rate-limit class — `/api/drive/file` IP-rate-limited
  60/min across the band's shared NAT; a fresh fleet of iPads hitting the same setlist will
  contend for one budget. Pre-warming via Save N/M on the setlist before service would prevent
  this; the band would need to know to pre-tap. Reproduce via
  `npx playwright test e2e/perform-ipad-pwa-fresh-install.spec.ts`.
- **Ship-class:** HOLD-POST-SERVICE (touches data fetch); operational mitigation = band pre-
  warms each iPad before service.

**6:47:42** — Yossi opens the next song. Chart loads in 1.1 sec (cache primed). ✓

**6:48:55** — Live-director gesture probe: from Aviva's sibling window (band_leader), advance the
"now playing" gesture. Yossi's unauthenticated view updates within 2 seconds. ✓

**6:50:30** — Yossi decides to sign in via the QR card (curious about his own profile). Signs in
with Google; lands authed. **[FRICTION 6:50:30 MED HOLD]** — the page does NOT update to reflect
his new musician role. His view is byte-identical to the unauthenticated view (correct per
public-by-design), but he doesn't see any indication that he's signed in (no avatar, no nav
change). Cost: confusion + a tap on the back button to check the URL.
- **Severity:** MED (A1, post-sign-in feedback gap).
- **Mechanism (footnote):** `/perform/setlist/<id>` is rendered as Server Component, doesn't
  re-fetch on client-side auth state change. `useAuth()` reactivity covers the listing but not the
  per-setlist header.
- **Ship-class:** HOLD-POST-SERVICE.

**6:53:30** — A4 sanctuary edge — Yossi tilts the iPad on the stand. Reflection from skylight
across the chart. Contrast on the PDF text holds. ✓ — chart bytes are dark on white, not OKLCH-
themed; sanctuary glare survives.

### WHAT-WE-LEARNED (Scenario 2)

Yossi-the-guest is the most useful probe identity the band has, because **every friction Daniel
has adapted around hits Yossi square in the face**. The "Sign in to CRC Music" copy is technically
correct but reads as a wall to a guest; that single change of copy would save ~6 seconds for every
new musician David brings in. The 4.8-second first-chart spinner on his fresh tablet is the
fresh-tablet cache divergence Daniel called out as a new bug-class — it's real, it bit, and the
methodology surfaced it on the second beat.

The post-sign-in invisibility is a smaller thing but represents a pattern: **the surface assumes
identity continuity it doesn't actually have**, and a fresh user crossing the unauthenticated →
authenticated threshold experiences whiplash. This is M1's strongest output type — patterns the
methodology surfaces precisely BECAUSE it's walking a musician across identity transitions, which
M2's grid wouldn't.

## Scenario 3 — Sarah walks Friday Erev Shabbat (mid-service change + multi-device)

### Identity + setting
Sarah, 28, keys + harmony vocals. Uses iPad #4 because #2 is at the leader stand tonight. Also
signed in on her iPhone. 6:32pm, downbeat 7:00.

### Timeline

**6:32:00** through **6:34:30** — A1 setup-prep beats: lands `/perform`, taps tonight's Erev
card, header loads, songCount matches header (the cron tick caught up by Friday). ✓ ✓ ✓

**6:35:18** — Between-songs A2 probe (simulated): leader names "Lecha Dodi" mid-rehearsal. Sarah
finds the track in the queue, taps it. Chart opens at the bound key (G). 5.4 seconds tap-to-ready.
✓ (under the 6-sec A2 target).

**6:37:42** — A3 transpose probe: leader calls down to F. Sarah opens TransposerMenu.
**[FRICTION 6:37:42 MED HOLD]** — current key is shown but the destination key the leader called
isn't pre-staged in any obvious way. She has to count "G → F is down 2 semitones" and tap twice.
Cost: ~3 sec of mental math mid-rehearsal.
- **Severity:** MED (A3, discoverability — transpose UX assumes the musician knows the
  destination as semitones, not key-name).
- **Mechanism (footnote):** `TransposerMenu` displays current key as letter but transpose action is
  semitone offset; no "transpose-to-key" button shortcut.
- **Ship-class:** HOLD-POST-SERVICE (UX).

**6:39:11** — A3 reorder probe: from sibling Aviva-window (band_leader), remove a track. Sarah's
view updates within 1.6 sec. ✓ (cross-musician sticky works on remove path.)

**6:42:30** — Battery-die-mid-set sim. Sarah opens incognito (identity C), signs in fresh, lands
back at `/perform/setlist/<id>`. **[FRICTION 6:42:30 HIGH HOLD]** — her down-2-semitone transpose
on Lecha Dodi from 6:37:42 is GONE. The chart loads in G.
- **Severity:** HIGH (A3 + stickiness — if a real battery-swap mid-service had happened on Lecha
  Dodi, Sarah would have played the leader's down-called key in the up key. Same root as
  Scenario 1 9:42:18).
- **Mechanism (footnote):** transpose state stored only in `useMusicStore` ephemeral zustand; not
  persisted to Firestore user-preference doc or to localStorage. A cross-device or cross-session
  transpose evaporates.
- **Ship-class:** HOLD-POST-SERVICE.

**6:43:30** — Multi-device same-account: Sarah's iPhone, same Google account. iPad transposes Adon
Olam down 2. iPhone shows it in original key. **[FRICTION 6:43:30 MED HOLD]** — same root.
- **Severity:** MED (multi-device divergence of musician-personal preferences).
- **Ship-class:** HOLD-POST-SERVICE.

**6:45:00** — Sanctuary close-out: `/monitor` panel renders on iPad ✓; bus assignments visible ✓;
no fader writes attempted per Cat-N policy.

### WHAT-WE-LEARNED (Scenario 3)

Sarah's morning surfaced two HIGH frictions both rooted in the same gap: **the band's personal
musician state is not persistent**. Transposes, annotations, custom keys — they live in zustand
and die at reload. From the musician's POV the app feels "session-y" — a tool you use during a
service, not a tool that remembers you across sessions. For a fixed band of 6 musicians this is
the difference between an app that's a chart viewer and an app that's a personal practice tool.

The down-call mid-service (6:37:42) revealed a second pattern: the TransposerMenu is designed for
the *musician who already knows the destination key as a semitone offset*. Most musicians know it
as a letter. Closing that gap is a copy + small UI change.

## SERVICE-DESIGN-INSIGHT

Across the three scenarios one pattern recurred in three costumes: **the app treats per-musician
state as ephemeral while the band's mental model treats it as persistent**. Aviva's transpose at
9:42 dies on song-switch. Sarah's down-2-semitone transpose at 6:37 dies on battery-die reload.
Annotations die on reload. The shared/setlist-level state syncs beautifully via Firestore
listeners (Aviva 9:44, Yossi 6:48, Sarah 6:39 all converged within ~2 sec); the per-musician
personal-preference state has none of that infrastructure.

This is a band-app **identity** call, not a bug. Right now the app's stance is "the leader's
setlist is the truth; the musician's view is an ephemeral lens." The band has been working as if
the stance is "the musician's instrument-state is theirs to keep." The cycle-10 toolbar + wake-
lock fixes are good and held — they're the affordance layer. The cycle-11 finding is at the
DATA-OWNERSHIP layer: who owns transpose, annotation, key preference, page-zoom, last-played-
track? Currently nobody — they live in zustand. The fix is a single persistent-user-prefs
substrate (Firestore `users/{uid}/preferences/{setlistId}/{trackId}`) and a wiring pass over
TransposerMenu / annotation / zoom / wake-lock.

The second-altitude insight: **Yossi-the-guest is the truest test of the app**. Every friction the
band has internalized into their workflow hits Yossi square. The methodology recommends keeping
the "guest musician David brings on Erev Shabbat" identity as a permanent test persona for any
future surface change. A pre-commit guard could be "would this change have made Yossi's 90-second
arrival faster or slower?"

## Mechanism footnotes (the bridge to a fix wave)

| ID | Beat | One-line mechanism | Ship-class |
|----|------|--------------------|------------|
| C11M1-001 | S1 9:38:11 | songCount denorm stale; pending cron tick auto-heal | SAFE-NOW-DATA (`recompute_setlist_track_count` on 5 rows) + HOLD upstream |
| C11M1-002 | S1 9:39:05 | "Save N/M" indicator doesn't name the missing chart | SAFE-NOW (copy/UI surface) |
| C11M1-003 | S1 9:39:43 | first-tap chart precache race in PDFOverlay | HOLD (touches render) |
| C11M1-004 | S1 9:42:18 + S3 6:42:30 + S3 6:43:30 | **musician-personal state in ephemeral zustand; no persistent prefs substrate** | HOLD (architectural) |
| C11M1-005 | S1 9:46:08 | annotation persistence (same root as C11M1-004) | HOLD |
| C11M1-006 | S2 6:45:08 | QRSignIn card copy implies signing in required to view setlist | SAFE-NOW (copy) |
| C11M1-007 | S2 6:46:11 | fresh-tablet first-chart spinner; chart-byte rate-limit on shared NAT | HOLD + operational (pre-warm) |
| C11M1-008 | S2 6:50:30 | post-sign-in setlist view doesn't reflect new auth state | HOLD |
| C11M1-009 | S3 6:37:42 | TransposerMenu designed in semitones; musicians think in key letters | HOLD (UX) |

## Repros / artifacts

- Harness specs invoked inline: `e2e/ipad-stuck-spinner-probe.spec.ts --project=ipad-webkit` (S1
  9:39:43 reproduced); `e2e/perform-ipad-pwa-fresh-install.spec.ts` (S2 6:46:11 reproduced under
  fresh-context).
- Screenshots: 6 captured to `cycle-11-cowork-m1-narrative-artifacts/` (S1-3-cards.png, S1-9-songcount-mismatch.png, S1-942-transpose-lost.png, S2-645-card-copy.png, S2-650-post-signin.png,
  S3-642-battery-die-reset.png).
- Per-beat repros: each FRICTION footnote includes the exact tap sequence + tool to deterministically
  re-fire from a `c11m1`-prefix test account.

## Manual cleanup needed

None — `c11m1-scratch-erev-shabbat` setlist deleted (S3 cleanup), test account `test-c11m1-band_
leader-*` revoked + swept via `cleanup_all_test_data({prefix:"c11m1"})`. `list_test_accounts()`
post-cleanup returns 0 matching `c11m1`.
