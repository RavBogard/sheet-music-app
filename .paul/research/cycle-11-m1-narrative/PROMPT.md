# Cycle-11 Cowork — Lane M1: Musician-shadow scenario-narrative (METHODOLOGY DESIGN)

> **Drafted 2026-05-28 against deployed surface at origin/master `8390b31aac`** — every route /
> component / spec / tool / param below verified via `git ls-tree` + `git cat-file -p` per
> `[[feedback_cowork_prompt_verify_before_write]]`. Read `.coord/cycle-11-CHARTER.md` ONCE first
> (north-star, 4 anchor moments, 3 bug-classes, anti-patterns, run policy, §6 mandatory inputs).
>
> **Verify-before-write checklist applied:**
> 1. `/perform` SSR page + `PublicSetlistListing` + `splitPublicSetlists` + `MAX_PUBLIC_SERVICES=5`
>    + `QRSignIn` import + `useAuth()` + `!authLoading` CLS guard ✓ (git show, lines audited).
> 2. `PerformanceToolbar.tsx` post-`4bcefb929c` ≥44px tap targets (`h-11`) + in-chart `KeepAwakeToggle`
>    wakeLock prop wired through `PDFOverlay.tsx` + `SetlistPerformClient.tsx` ✓.
> 3. `src/hooks/use-wake-lock.ts` (NOT `src/lib/`) — path corrected from cycle-10 PARENT drift ✓.
> 4. `playwright.config.ts`: `ipad-webkit` 820×1180 + `ipad-webkit-landscape` 1180×820 projects ✓.
> 5. `cycle-4/harness/README.md` category-→-spec map @ `8390b31aac`: Cat A/B/C/D/E/F/H/I/J/K/L/S all
>    present in `e2e/` ✓; documented gaps Cat-G (touch ergonomics) + Cat-N (monitor UI-shape).
> 6. `/api/auth/admin-test-session/route.ts` — secret-gated mint (`MCP_ADMIN_TEST_SESSION_SECRET`,
>    1h TTL, `admin_test:true` claim, audit) ✓; `/api/auth/test-session/route.ts` cookie path ✓
>    (META-003 still applies — Web-SDK Firestore listeners don't hydrate from the cookie alone).
> 7. `src/lib/mcp/tools/test-tokens.ts`: create-side `uidPrefix`, cleanup-side `prefix` (line 621 + 976
>    docstring) ✓.
> 8. Service IDs used as scenario anchors:
>    - `cd2010f4-8bb0-4f54-ba2d-8a79d83729a6` = B'nei Mitzvah of Gavin Stein — May 30 (cited in
>      cycle-10 instance-1 findings + master-tip).
>    - `UnjLqKTtS4lNKQfMY6hB` = Shavuot Yizkor (cited in cycle-10 dispatch + decisions).
>    Confirm at run time via `list_setlists` and the live `/perform` listing — the PROMPT does not
>    bind these IDs; it asks the run to discover the upcoming-most service in each tier.

---

## You are cowork-Claude (cycle-11, lane M1 — musician-shadow scenario-narrative)

Single-thread cowork-Claude session, **~75 minutes real wall-clock** per
`[[feedback_cowork_real_harness]]`. You are NOT auditing the app. You are **walking three steps
behind a real musician through a real service**, on a real iPad, and reporting what got in their
way. The unit of value is **a moment in a musician's hands**, not "a class violation in
PerformanceToolbar.tsx".

Your stance: **first-person musician POV**. Findings live inside a minute-by-minute timeline — at
9:47 Aviva tapped Modah Ani and the chart showed the wrong key — they do NOT live as a bullet list
of DOM violations. The timeline IS the report; bugs are timestamped frictions in someone's day.

The band runs the consumer surface on **6× standard 11" iPads (820×1180 WebKit)** per
`[[project_band_ipad_hardware]]`. Perform mode must be bulletproof there. The musicians using it
range from "Aviva, who has signed in on this iPad every Friday for three years" to "Yossi, a guest
violinist who picked up a borrowed iPad 60 seconds before downbeat and has never opened this app."
Your three scenarios cover that span.

**Your two layers:**

1. **Live walking judgment** — drive a real browser (Playwright codegen / persistent context / a
   Chrome incognito profile / a real iPad if Daniel hands you one over Vercel preview) through each
   scenario as the musician would. Tap, swipe, transpose, reload, drop wifi, sign out, sign in.
   Annotate the timeline with what you see and feel.
2. **Selective harness lookups** — `npm run stress` exists and the iPad-webkit Playwright projects
   are real (`playwright.config.ts:37,44` — 820×1180 + 1180×820). You may invoke individual specs
   (e.g. `npx playwright test e2e/ipad-stuck-spinner-probe.spec.ts --project=ipad-webkit`) when a
   beat needs deterministic replication (a stickiness regression you want to confirm reloads to the
   same state in a clean session; a fresh-tablet PWA cache state via
   `perform-ipad-pwa-fresh-install.spec.ts`). The harness serves the narrative — it doesn't replace
   it. Don't run a full `npm run stress` matrix from this seat; that's a deterministic-load lane,
   not a narrative one.

### Setup

1. **Base URL:** `https://www.centralreform.live`
2. **Three identity states required across the run** (charter §3 AP-7 break):
   - **A. Logged-in band member** — a real production account (Daniel pastes a session via
     `MCP_ADMIN_TEST_SESSION_SECRET` + `/api/auth/admin-test-session` if available, OR a
     minted-via-`create_test_account({role:"band_leader", uidPrefix:"c11m1"})` bearer + matching
     test session; bearer/session NEVER written to any file under `sheet-music-app/`, redact as
     `***redacted***`).
   - **B. Fresh-incognito guest** — clean browser profile, no cookies, no IndexedDB, never signed
     in. Used to grade public-surface affordances + the "Yossi" scenario.
   - **C. Fresh-tablet-no-cache** — service-worker cleared, IndexedDB cleared, Firestore offline
     persistence cleared (Application > Storage > Clear site data in DevTools, or use a freshly-
     provisioned Playwright `browser.newContext()` with no `storageState`). Used to grade the
     fresh-tablet cache divergence bug class.
3. **uidPrefix:** `c11m1` for any minted account. ★ create-side param `uidPrefix`, cleanup-side
   param `prefix` (same value, different name — verified `src/lib/mcp/tools/test-tokens.ts:621/976`).
   **NEVER** call `cleanup_all_test_data` without `prefix` (per
   `[[feedback_self_inclusion_test_fixtures]]` + `[[feedback_sandbox_test_isolation]]`).
4. **Boot pre-flight (HARD-BLOCK → BLOCKER supervisor + stop):**
   - `GET https://www.centralreform.live/perform` → 200, paints the `PublicSetlistListing` skeleton
     then a card list with ≤5 rows.
   - `git rev-parse --is-shallow-repository` → `false` (per cold-boot Step-0).
   - `list_setlists({})` (admin bearer) returns ≥1 row.
   - Confirm the three identity states (A/B/C) all reach `/perform` and render appropriate skeleton.

### Out of scope (hard boundaries)

- ⛔ **No source modification, no worktree, no branch, no commit, no ship.** This is an OBSERVE +
  REPORT lane. Findings → fix wave is a separate dispatch (charter §5: no ship-freeze on the eventual
  RUN, but the RUN is decoupled from PROMPT-design — which is what this lane is).
- ⛔ **No live X32 monitor writes.** The wedge mixer (`/monitor`) surface is observable read-only
  (does the panel render? are the bus assignments coherent on iPad?) but you do NOT push faders.
  Monitors are **wedges**, NOT IEM, per `[[feedback_terminology]]`.
- ⛔ **No destructive writes against real setlists/library.** Any reorder/transpose/annotation you
  exercise is on a **`c11m1`-prefix scratch setlist** you clone from a template + delete in cleanup.
  Never `publish_setlist` to a real timeslot; never `delete_chart` on a real library row.
- ⛔ **F-002 lyric-search is dropped** (`3155fb2881`). Do not probe.
- ⛔ **Do not probe** repo-root `bridge/**`, repo-root `mcp/`, `SetlistGrid.tsx`,
  `src/lib/mcp/errors.ts`, `error-envelopes.ts`.

---

## §0 — Why this methodology (charter §0 framing, lane-internal)

Past cycles 1-10 produced findings shaped like `{id, severity, area, surface, measurements,
expected, actual, hypothesis, repro, evidence}` — exemplified by
`.paul/research/cycle-10-cowork-instance-1-findings.jsonl`. That shape is grep-friendly and lets the
supervisor pipe findings into a fix wave. But it **compresses the lived moment to nothing**: a
musician's confidence dent when "B'nei Mitzvah of Gavin Stein" reads "0 songs" doesn't survive the
compression. A row that says `severity:HIGH, area:Public /perform landing, hypothesis:setlist.songCount
Firestore field set at write but not updated on track-add` is true but reads as if a robot found it
in a CI report.

The musician didn't see a robot. The musician saw "wait, is there no setlist?" → backtrack to the
dashboard → scroll → confusion → re-enter the same card → header reads "16 songs · 20 items" →
relief — *7 seconds of confidence dent, mid-arrival, before even getting to the chart*. **That**
seven seconds is the finding. The Firestore field is the FIX hypothesis. The compressed schema put
those in the wrong order.

This lane's bet: **lead with the lived moment, footnote the mechanism.** A finding's primary form is
a paragraph of timestamped narrative. Severity grades how much of the musician's service the moment
ate. Hypothesis and surface are appended as footnotes so the eventual fix-wave dispatch can find
them — but the primary read is the timeline, not the JSON.

---

## §1 — The three scenarios (charter §1 anchor moments × this lane's vehicle)

You walk **three musicians through three real services**. Each scenario is named, dated, anchored
on a real service-time, and runs on a specific identity state (A/B/C above). The three scenarios
together must cover all four anchor moments (A1-A4 from charter §1) and surface beats for all three
bug-classes (charter §2).

### Scenario 1 — "Aviva" walks Saturday 5/30 B'nei Mitzvah morning

- **Identity state:** A (logged-in band member, persistent IndexedDB sign-in).
- **Service:** Saturday morning B'nei Mitzvah of Gavin Stein, ~10:00am downbeat. Find the upcoming
  Saturday service via the public `/perform` listing or `list_setlists({})`. Cycle-10 indexed it as
  `cd2010f4-8bb0-4f54-ba2d-8a79d83729a6` — confirm the ID at run time; if it has moved, anchor on
  the current upcoming-Saturday-morning row.
- **Anchor moments covered:** **A1** (setup-prep) primary, **A2** (between-songs) heavy, **A4**
  (sanctuary edge — light: glare/tilt/wedge-mixer survivor state).
- **Bug-classes probed:**
  - **Stickiness.** During the run, transpose one song down a whole step (e.g. Modah Ani D → C),
    then reload the page; does the transpose persist? Reorder two tracks on a scratch clone; reload
    in a sibling tab — does the reorder land? Annotate the chart; reload — does the annotation
    survive?
  - **Cross-musician sticky.** With identity A in one window and identity B (fresh-incognito) in a
    second window both on `/perform/setlist/<id>`, have A reorder/transpose; does B see it within
    one render cycle?
- **Beats Aviva MUST hit** (your narrative drives through all of these in order):
  1. Wake the iPad. Lands at `/perform` because it's the last URL.
  2. Card list renders. **Scan-time:** how long until she can pick out Saturday's service?
  3. Tap the Saturday card.
  4. Setlist header loads. **What does the songCount on the card claim?** Compare to header
     "X songs · Y items". Is there a mismatch she has to mentally resolve? (Known regression class
     from cycle-10 C10I1-002; songCount denorm fix shipped `8139a443ec` so it MAY now match — verify
     and note.)
  5. Note the "Save N/M" indicator value. Does it tell her *which* chart is missing?
  6. Tap the first song. Chart opens. **Tap-target sweep through the in-chart toolbar.** The
     post-`4bcefb929c` toolbar should now be ≥44×44 (`h-11`); confirm and note any control still
     below the floor.
  7. **In-chart wake-lock test.** Per the post-`4bcefb929c` wakeLock prop wiring through
     `PDFOverlay.tsx` → `PerformanceToolbar.tsx`, the keep-awake toggle should now be reachable
     from inside the chart overlay. Verify — toggle it, observe the indicator, exit chart,
     re-enter, is it still on?
  8. Transpose Modah Ani down a whole step. Open the next song. Return to Modah Ani — does the
     transpose persist (single-session stickiness)? Reload — does it persist (cold-reload
     stickiness)?
  9. Mid-set, simulate the rabbi reordering: from a sibling tab on identity A (or identity B
     observer), reorder two tracks on a clone. Does Aviva's view update without a manual reload
     (live-director gesture / Firestore listener)?
  10. Annotate one chart with a finger gesture (or pen). Page-turn. Return. Does the annotation
      survive? Reload — does it persist? (Stickiness probe through annotation.)
  11. Sanctuary-edge final beat: drop wifi (DevTools Network → Offline). Tap into the next song.
      Does the cached chart load? Tap into a song you have NOT previewed. Does the offline-cache
      indicator's "Save N/M" earlier-warning actually predict success?
- **What Aviva is NOT doing this scenario:** signing in (already signed in); printing a gig packet
  (Cantor does that); using monitor mix (the wedges are pre-set).

### Scenario 2 — "Yossi" walks Shavuot Yizkor evening (the deep-link / guest case)

- **Identity state:** B (fresh-incognito) → progress to A only if onboarding flow demands it.
- **Service:** Shavuot Yizkor — anchored on `UnjLqKTtS4lNKQfMY6hB` if still present; if not, use the
  upcoming-most "Yizkor"/"Erev"/holiday service. Yossi is a guest violinist David L. brought; he
  has the QR code Daniel printed but he has NEVER signed into this app.
- **Anchor moments covered:** **A1** (setup-prep, but FRESH — Yossi has nothing cached), **A4**
  (sanctuary edge — deep-link entry; A4 hardware: standing up, holding the iPad one-handed, glare).
- **Bug-classes probed:**
  - **Fresh-tablet cache divergence.** Yossi's iPad has no service worker registered for this
    domain, no IndexedDB, no Firestore offline cache. First touch of the week. Does `/perform` cold-
    load painlessly? Does the QR-sign-in card surface (per `PublicSetlistListing.tsx` logged-out
    branch)? Does any chart open on the first tap, or does the not-yet-cached chart need an
    online round-trip the band's NAT'd network can't deliver fast enough? (Recall:
    `[[project_chart_loss_reports_are_display_bugs]]` — "missing chart" feelings tend to be display
    not data; verify Yossi sees the same data as Aviva.)
  - **Auth-state divergence.** While unauthenticated, can Yossi see the setlist contents? (Per
    `[[feedback_setlist_public_policy]]` setlist content on `/perform/setlist/<id>` is PUBLIC BY
    DESIGN — analogous to chart-access. So Yossi should be able to follow along without signing in.
    Confirm this is true on a fresh-incognito profile end-to-end, AND that he doesn't get a
    confusing intermediate "sign in to see this" wall that turns out to be optional.)
- **Beats Yossi MUST hit:**
  1. Scans the QR code printed on a paper handout. The QR resolves to `https://www.centralreform.
     live/perform` (or a setlist-deep-link the band shares — try both).
  2. Lands at `/perform`. **What does he see?** A skeleton, then a list. Logged-out card pinned to
     the top (`PublicSetlistListing` post-`6e043a4ce5`). Is the card scannable in an *inverse* way —
     can he immediately tell whether he NEEDS to sign in or whether he can just tap a setlist?
  3. Taps the upcoming service card (Yizkor).
  4. Setlist page loads. **Does he see the songs?** (He should — public by design.)
  5. Taps the first song. **Chart opens?** This is the heartbeat moment for fresh-tablet.
  6. Sub-scenario: now he tries to use the rabbi's "live director" gesture to follow along when the
     leader changes the order. Does he have the affordance, given he's not signed in? If not, does
     the app gently degrade — say, polling the listener at a lower cadence — so his view still
     converges, just slower?
  7. **Sanctuary edge — deep-link path.** Have the band's setlist-share link push him to
     `/perform/setlist/<id>` directly. Does the page hydrate, the chart open? Or does fresh-tablet
     bite — empty skeleton, infinite spinner, "no charts found"?
  8. **Auth-divergence final beat.** Now sign Yossi in (the QR-sign-in card path — scan code on
     phone, approve, land authed in the same browser per `src/components/auth/QRSignIn.tsx` +
     `/api/auth/qr/route.ts`). Does his view change in unexpected ways post-sign-in? (e.g. did a
     setlist disappear because he became a `member` and lost a `band_leader`'s visibility? Per
     `[[feedback_setlist_public_policy]]` it should not, but probe.)

### Scenario 3 — "Sarah" walks Friday-evening Erev Shabbat (the mid-service change + cross-musician case)

- **Identity state:** A primary; opens a sibling identity-C window to simulate a freshly-rebooted
  iPad mid-set.
- **Service:** Friday evening Kabbalat Shabbat — anchor on the upcoming Friday-evening Randy
  template clone (if no scheduled service exists, clone the Randy template per
  `clone_setlist_from_template` + a `c11m1`-prefix scratch slot for the run, and delete in cleanup).
- **Anchor moments covered:** **A2** (between-songs) primary, **A3** (mid-service change) heavy.
- **Bug-classes probed:**
  - **Stickiness across reload.** Sarah transposes; the leader (a sibling Aviva-window) reorders;
    Sarah reloads — does her view land on the new order + her transpose?
  - **Cross-musician sticky.** When the leader pushes a new track or changes the bind, does Sarah's
    listener update without a manual reload?
  - **Auth-state divergence.** Sarah is also signed in on her phone. Does her iPad and her phone
    see the same setlist state at the same time? (Multi-device same-account divergence — distinct
    from cross-musician.)
- **Beats Sarah MUST hit:**
  1. 6:30pm — Sarah arrives. Picks up iPad #4 (she usually uses #2 but it's at the leader's
     stand). Wakes screen. Lands at `/perform` (sign-in persisted, A).
  2. Taps tonight's Erev card. Setlist opens. **Scans the setlist header** — does the song-count
     match what the leader will call? Are her transposed defaults loaded? (Per `getSongById`
     library_index fallback at `8390b31aac` — songDefaults should hydrate from upload-only library
     rows.)
  3. **Between-songs beat (A2):** simulate the leader naming "Lecha Dodi" mid-service. Sarah has
     6 seconds. Does she find the track in the list and tap it without overshoot? Is the chart
     open at the bound key before the count-in?
  4. **Mid-service A3 — transpose:** leader calls "Lecha Dodi in F not G" mid-song. Sarah opens
     the transpose. **Is the current key visible at-a-glance, or does she have to read the
     `TransposerMenu` popover to know where she's starting from?**
  5. **Mid-service A3 — reorder:** rabbi cuts a song mid-set; from the sibling Aviva-window
     (band_leader), remove a track. Does Sarah's listener update? Or does Sarah's view still
     show the cut song and she'll start playing it 2 seconds before the leader stops her?
  6. **Stickiness across reload:** Sarah's iPad battery dies mid-set. Identity C: open a clean
     incognito window, sign in fresh, land back at `/perform/setlist/<id>`. Does she pick up where
     she left off? (Her transpose preference — was it durable to her account, or local to the
     dead iPad?)
  7. **Multi-device same-account divergence:** simultaneously on identity-A iPad + Sarah's phone
     (same Google account). Do they converge? Does a transpose on iPad reflect on phone?
  8. **Sanctuary edge close-out:** wedge mixer (`/monitor` route, READ-ONLY — Cat-N visual-shape
     only). Is the panel coherent? Are bus 1 + bus 5 master-mute states visible? (No fader
     pushes.)

### Anchor-moment coverage matrix (must close before ship)

| Anchor | Scenario 1 (Aviva / Sat AM) | Scenario 2 (Yossi / Yizkor) | Scenario 3 (Sarah / Erev Shabbat) |
|--------|------------------------------|------------------------------|------------------------------------|
| **A1** setup-prep | PRIMARY (beats 1-5) | PRIMARY (fresh-tablet variant, beats 1-5) | secondary (beats 1-2) |
| **A2** between-songs | HEAVY (beats 7, 11) | secondary (beat 5) | PRIMARY (beat 3) |
| **A3** mid-service change | secondary (beats 8-9) | — | PRIMARY (beats 4-5) |
| **A4** sanctuary edge | LIGHT (glare + beat 11 offline) | HEAVY (deep-link + standing iPad + beat 7) | LIGHT (beat 8 monitor visual + battery-died beat 6) |

If any anchor is uncovered, your run is incomplete — extend a scenario or add a 4th (e.g. a
weekday rehearsal surprise) until A1+A2+A3+A4 each have at least 2 narrative beats across the run.

### Bug-class coverage matrix (must close before ship)

| Bug-class | Where it surfaces as a NAMED beat |
|-----------|------------------------------------|
| **Stickiness** | Scenario 1 beats 8 + 10; Scenario 3 beats 6 + 7 |
| **Fresh-tablet cache divergence** | Scenario 2 beats 5 + 7; Scenario 3 beat 6 (sister-iPad path) |
| **Auth-state divergence** | Scenario 2 beats 4 + 8; Scenario 3 beat 7 (multi-device same-account) |

---

## §2 — Anti-pattern breaks (charter §3; PROMPT-explicit)

This lane intentionally breaks **four** cycle-10 anti-patterns. The PROMPT calls them out so a
future reader sees the breaks were deliberate, not omissions:

- **AP-1 break — class-violations demoted.** A finding's primary text is a paragraph of musician
  narrative ("at 9:47 Aviva tapped Modah Ani and the transpose she'd set ten minutes earlier was
  gone"), not "PerformanceToolbar `h-10` → HIG floor 44". The DOM detail is footnoted under
  *Mechanism* AFTER the moment.
- **AP-3 break — annotated timeline as primary, JSONL as optional sidecar.** The primary report is
  `HANDOFF.md` with the timeline in prose. A secondary `findings.jsonl` can be emitted for grep
  compatibility with the cycle-10 supervisor pipeline, but the load-bearing form is the prose
  timeline.
- **AP-5 break — first-person musician voice.** The HANDOFF is written in third-person observing a
  named musician through their service ("Aviva taps", "Yossi scans", "Sarah hesitates"). It reads
  like ethnography, not like an audit transcript.
- **AP-7 break — multi-identity probing baked in.** Each scenario specifies the identity state
  (A/B/C) and the bug-class beats use the contrast between identities as the probe.

Other anti-patterns this lane does NOT explicitly break (and is therefore vulnerable to — note for
the methodology-comparison phase):
- **AP-2 (app-wide roam).** This lane is deep on 4 moments × 3 scenarios, NOT shallow across
  surfaces. That's a choice, not an omission. M2 (matrix) and M3 (heuristic) may cover surface
  breadth that this lane drops by design.
- **AP-4 (findings as the only output).** This lane explicitly requires WHAT-WE-LEARNED at the end
  of each scenario AND a single SERVICE-DESIGN-INSIGHT block at the end of the report.
- **AP-6 (ship-freeze).** Charter §5 locked NO ship-freeze regardless of methodology.

---

## §3 — Output shape (the primary deliverable)

Write to `.paul/research/cycle-11-cowork-m1-narrative-HANDOFF.md`. **Lead with a one-paragraph
service-impact verdict**, then the three annotated timelines, then WHAT-WE-LEARNED per scenario,
then a single SERVICE-DESIGN-INSIGHT block.

### Skeleton

```markdown
# Cycle-11 M1 Cowork HANDOFF — Musician-shadow scenario-narrative

**Run date:** YYYY-MM-DDTHH:MMZ
**Wall-clock:** ~75 min single-thread
**Vehicle:** live walking judgment on <browser/profile> + selective harness lookups (specs cited
inline per beat)
**Identity states exercised:** A (logged-in band member daniel/test-band_leader-c11m1-*),
B (fresh-incognito), C (fresh-tablet-no-cache via `browser.newContext()` no storageState)
**Master SHA at run:** <git log -1 origin/master>
**Services walked:**
- Scenario 1: <date> <service-name> setlist <id>
- Scenario 2: <date> <service-name> setlist <id>
- Scenario 3: <date> <service-name> setlist <id>
**Cleanup state:** [clean / partial — list orphans]
**Anchor coverage:** A1 ✓ A2 ✓ A3 ✓ A4 ✓
**Bug-class coverage:** stickiness ✓ fresh-tablet ✓ auth-divergence ✓

## Service-impact verdict

One paragraph: would I trust this app to land Saturday's B'nei Mitzvah without a service-quality
incident? What's the single biggest thing the band will feel that we should fix this week? What's
the worst-case beat from the run — would a real musician have stalled out of the service over it?

## Scenario 1 — Aviva walks Saturday morning B'nei Mitzvah

### Identity + setting
- Aviva, 35, sings tenor + plays guitar in the band. Signed in on iPad #3 since the Friday before.
- Sanctuary lighting: bright skylight, iPad tilted on a music stand.
- Pre-service: 9:38am, downbeat 10:00am, 22-minute window.

### Timeline

**9:38:00** — Aviva picks up iPad #3 from the band table. Screen wakes to the last-loaded page,
which is `/perform`. The skeleton paints under 200ms — she doesn't have to wonder if the page is
loading. ✓

**9:38:04** — Card list renders. Her eyes land on Saturday's "B'nei Mitzvah of Gavin Stein — May 30"
at the top of the upcoming-section. ✓ — `splitPublicSetlists` ordered correctly (upcoming-first,
soonest-first; today is Saturday so today's service sits at top).

**9:38:11** — She taps the card. … (continues with timestamped beats; each PASS or FRICTION is
explicit)

**9:40:30** — [FRICTION] Aviva taps into "Modah Ani". The first tap returns no chart — empty
overlay with "Loading chart…" frozen for 3.2 seconds, then the chart appears. **What got in the
way:** the ipad-stuck-spinner-probe class of bug — see also cycle-10 `ipad-stuck-spinner-probe.spec.
ts`. She muttered "is it me or the wifi." Confidence dent.

- **Severity:** HIGH (A1 setup-prep beat — chart-load failure is a confidence killer pre-service).
- **Mechanism (footnote):** PDFOverlay first-tap precache race; see `PDFOverlay.tsx` blob-resolver;
  fix shipped `575bc47ae` per master-tip but may have regressed at <SHA> — confirm.
- **Ship-class:** HOLD-POST-SERVICE (touches Perform render).

… (continues through all 11 beats; each non-PASS beat is FRICTION/BROKEN-tagged inline)

### WHAT-WE-LEARNED (Scenario 1)

Two paragraphs (NOT bullets). What did walking Aviva through Saturday morning teach us about how
the app feels to a returning band member? Where did she stall? Where did she sail through? What's
worth changing about the surface or the workflow?

## Scenario 2 — Yossi walks Yizkor evening (the guest case)

… same shape …

## Scenario 3 — Sarah walks Friday Erev Shabbat (the mid-service change case)

… same shape …

## SERVICE-DESIGN-INSIGHT

One section, one page. Distilled from across the three scenarios. **Not a list of fixes** — this is
the higher-altitude question the run answers: what's the design of the app currently optimized for,
where is it under-optimized for, what should be different about how the band uses the app, what
recurring class of friction shows up in different costumes across the three services? Answer
qualitatively. Cite specific beats by scenario + timestamp.

## Mechanism footnotes (the bridge to a fix wave)

A short table for the fix-wave dispatcher — finding IDs (`C11M1-NNN`), one-line mechanism guess,
ship-class:

| ID | Beat | One-line mechanism | Ship-class |
|----|------|--------------------|------------|
| C11M1-001 | S1 9:40:30 | first-tap precache race in PDFOverlay | HOLD |
| C11M1-002 | S2 7:42:11 | logged-out QR card scan affordance copy unclear | SAFE-NOW (copy) |
| … | | | |

## Repros / artifacts

(reference any screenshots / network traces / harness-spec outputs invoked inline)

## Manual cleanup needed

(only if a `c11m1-*` fixture was created-but-not-deleted)
```

### Cleanup (end-of-run, ~5 min) — MANDATORY before HANDOFF-COMPLETE

If you minted any test account / cloned any scratch setlist:

```
1. delete_setlist({id, force:true}) for each clone
2. delete_chart({fileId, force:true}) for any chart you uploaded (unlikely for this lane)
3. cleanup_all_test_data({prefix:"c11m1"})   // ← prefix, NOT uidPrefix
4. Verify zero residual: list_test_accounts() → none matching c11m1;
   search_library({query:"c11m1"}) → empty;
   list_setlists({}) → no c11m1-* names
```

If your run was purely read-only on the public surface, note "read-only, no fixtures" and skip. If
prefix-scoped cleanup partially fails, list orphans under "Manual cleanup needed"; Daniel sweeps.

### HANDOFF-COMPLETE message body — for `.coord/inbox/supervisor.md`

```
from cycle-11-cowork-m1-narrative
HANDOFF-COMPLETE
verdict: <one line — would the run-of-show on Saturday have stalled? what's the worst beat?>
anchors-covered: A1 ✓ A2 ✓ A3 ✓ A4 ✓
bug-classes-covered: stickiness ✓ fresh-tablet ✓ auth-divergence ✓
load-bearing frictions (3-5 finding IDs with one-line moments, e.g.):
  C11M1-001 (S1 9:40:30) HIGH HOLD — first-tap stuck-spinner before Aviva's first chart open
  C11M1-007 (S3 6:47:08) HIGH HOLD — Sarah's transpose did not persist across reload
  C11M1-012 (S2 7:55:30) MED  SAFE-NOW — Yossi's logged-out QR-card copy implies sign-in required to view setlist (it isn't)
service-design-insight: <one line — the highest-altitude takeaway>
cleanup: clean / read-only no fixtures
```

---

## §4 — Severity calibration (narrative-graded)

This lane's severities measure **how much of the musician's service the moment ate**, not DOM
violations:

- **BLOCKER** — the musician would have stalled out of the service over this. A chart that simply
  won't open mid-set. A sign-in dead-end on a setlist that should be public. The kind of moment
  where the leader has to nod for the song to start without sheet music in front of one of the
  players.
- **HIGH** — a real confidence dent or scramble that costs the musician >5 seconds in a moment
  where they have ~6. A mis-tap that opens the wrong key control. A transpose that silently reverts
  on reload. A "Save 15/16" indicator with no way to know which one is missing. Cumulatively, two
  HIGHs across a scenario can degrade a musician's whole service.
- **MED** — a friction the musician would absorb but a guest musician (Yossi) might not. Unclear
  copy. A discoverability gap. A state ambiguity that requires a mental check ("am I on the right
  setlist?").
- **LOW** — would only bite under load or in combination. A 32px nav anchor that's annoying but
  off the critical path.
- **INFO** — process / doc / observational. Not a finding the band would feel.

A finding's severity is set by **how the musician felt at that timestamp**, not by static DOM
violation grades. A `h-10` button that the musician never mis-tapped during the run is NOT a HIGH
finding from this methodology — note it as a LOW under "Mechanism footnotes" but do not promote it.

---

## §5 — Where the harness helps (and where it doesn't)

This is a judgment lane, not a deterministic one — but harness specs are still useful as **probes
to deterministically replicate a beat**:

| Beat type | Harness spec to lean on |
|-----------|--------------------------|
| Stickiness across reload | `e2e/chart-bind-ipad.spec.ts` `--project=ipad-webkit` for chart-bind persistence + (write your own ad-hoc) for transpose persistence — the harness has no transpose-persistence spec, which is itself a finding to surface |
| First-chart-tap spinner | `e2e/ipad-stuck-spinner-probe.spec.ts --project=ipad-webkit` |
| Offline survival | `e2e/perform-ipad-offline.spec.ts`, `e2e/r1-offline-decisive.spec.ts` |
| Fresh-tablet PWA cold-load | `e2e/perform-ipad-pwa-fresh-install.spec.ts` |
| Role-gate sanity (Yossi unauthenticated) | `e2e/role-gate-matrix.spec.ts` |
| QR onboarding | `e2e/onboarding-qr-ipad.spec.ts` |
| a11y axe sweep (background) | `e2e/axe-stress.spec.ts` — run ONCE at the start; cite violations only when a musician beat surfaces them |

Do not run a full `npm run stress` matrix from this lane — that's the M2 / dispatched-load lane's
work. Use these specs surgically when a beat needs deterministic replication.

---

## §6 — Coordination + ops

- **Tier:** This PROMPT is **for an eventual cowork RUN**, not the design lane itself. The current
  design lane is Tier-0 doc only (writing this PROMPT).
- **Branch / worktree for the design lane:** `feat/cycle-11-m1-narrative-design`, worktree
  `sheet-music-app-cycle-11-m1-narrative-design/`, per-worktree identity `coder-1@coord.local`.
- **Step-0 shallow check** at boot — `git rev-parse --is-shallow-repository` must be `false`; if
  `true`, `git fetch --unshallow origin` and re-verify per
  `[[feedback_supervisor_verify_commit_diff_not_subject]]`.
- **Disjoint from siblings:** M2 (coder-3, matrix) writes only into `.paul/research/cycle-11-m2-*/`;
  M3 (coder-5, heuristic) writes only into `.paul/research/cycle-11-m3-*/`. No shared files. Do not
  read sibling lanes' DESIGN-NOTES until after this lane ships — independent bets per charter §8.
- **SHIP-NOTICE** at end of this design lane → `.coord/inbox/supervisor.md` + CC
  `.coord/inbox/auditor.md`, signed `from coder-1`, summarizing the three deliverables (PROMPT.md +
  DESIGN-NOTES.md + SAMPLE-REPORT.md), the four anti-pattern breaks, and the anchor/bug-class
  coverage proof.

Go.
