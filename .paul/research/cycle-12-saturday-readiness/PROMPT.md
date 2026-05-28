# Cycle-12 Cowork — Saturday-readiness sweep (HYBRID methodology)

> **Drafted 2026-05-28 against deployed surface at origin/master `0709bccfa6`** — every
> route / component / hook / route-handler / MCP tool name / e2e spec / harness helper
> cited below was verified via `git ls-tree` + `git cat-file -p` against that SHA per
> `[[feedback_cowork_prompt_verify_before_write]]`. **Re-confirm at run-time** via
> `git log -1 origin/master` and note any drift inline in §A of the REPORT.
>
> **Saturday 2026-05-30T15:00Z (10:00 local) — B'nei Mitzvah of Gavin Stein.** Real
> setlist `cd2010f4-8bb0-4f54-ba2d-8a79d83729a6`, ~20 tracks · 16 songs · 4 dividers,
> owner Daniel. **NEVER mutate this id directly.** The PROMPT's §0 walks you through
> cloning it to a `c12-saturday`-uidPrefix-scoped fixture before any write probe runs.
>
> **The hybrid bet (vs cycle-11's M1/M2/M3 triplet):** cycle-11 ran three independent
> methodology designs in parallel — narrative timelines (M1), state-divergence matrices
> (M2), and heuristic-under-stress cards (M3). Each surfaced findings the others
> structurally missed. Cycle-12 collapses that to ONE methodology that lets each
> *finding* self-tag its best shape:
>
> - `shape: "narrative"` — the friction is a lived MOMENT in a musician's hands;
>   the narrative timeline IS the finding.
> - `shape: "matrix"` — the friction is a deterministic cell in (action × surface ×
>   identity × persistence); the matrix row IS the finding.
> - `shape: "heuristic"` — the friction is a design-affordance violation activated
>   by a stress condition; the heuristic-violation card IS the finding.
>
> Use the shape that fits the friction. ONE consolidated REPORT.md. NO three-way
> split.
>
> **Narrow worry axes** (Daniel's pick 2026-05-28T~21:25Z, post-cron-bond-health
> ship `0709bccfa6`): axis-1 = **mid-service wifi-drop / offline survival**;
> axis-2 = **stickiness + reload-survival** — does what cycle-11 *just* shipped
> hold up across the full 20 Saturday tracks under 3 musician identities?
>
> **Out of scope** (Daniel directive — do NOT re-find what cycle-11 caught):
> ⛔ fresh-tablet onboarding (cycle-11 M3 covered + iPad-baseline already-OK).
> ⛔ battery + tab-background + wake-lock-acquisition-failure mode (M3-001 covered).
> ⛔ A3 mid-service key/song change (M3-004 transposer-state-display covers part).
>
> **In scope:** A1 setup-time chart prep · A2 between-songs scramble · A4 sanctuary
> edge (offline / shared-state / public-listing-as-musician).

---

## §0 — Boot, sandbox setup, identity provisioning

### §0.1 — Boot pre-flight (HARD-BLOCK on failure → BLOCKER to supervisor, stop)

1. `git rev-parse --is-shallow-repository` → must be `false`. If `true`, run
   `git fetch --unshallow origin` and re-verify. Shallow-boundary commits lie about
   ancestry (per `[[feedback_supervisor_verify_commit_diff_not_subject]]`).
2. `git log -1 origin/master` → expected `0709bccfa6` (cycle-11 fix-wave tip). If
   advanced, run the verify-every-ref preamble against the new tip and note drift
   inline.
3. `GET https://www.centralreform.live/perform` → 200, paints `PublicSetlistListing`
   skeleton then a card list with ≤5 rows (`MAX_PUBLIC_SERVICES=5` —
   `src/components/performance/PublicSetlistListing.tsx:18`).
4. Source the supervisor's MCP bearer:
   `BEARER=$(node scripts/supervisor-prod-bearer.mjs)` (reads `SUPERVISOR_PROD_BEARER`
   from gitignored `.env.local` per `[[feedback_supervisor_bearer_persistence]]`).
   `[ -n "$BEARER" ]` and `BEARER=~30+ chars starting "crl_live_"`.
5. (Optional) `MCP_ADMIN_TEST_SESSION_SECRET` available in env. If set, the C5
   (admin-via-admin-test-session) identity below is callable; if unset, mark every
   C5 probe `⊘ skipped — secret unset` and proceed.
6. `list_setlists({})` (admin bearer) returns ≥1 row including the real
   `cd2010f4-8bb0-4f54-ba2d-8a79d83729a6`.
7. `get_setlist({id:"cd2010f4-8bb0-4f54-ba2d-8a79d83729a6"})` returns the real
   B'nei Mitzvah shape — capture: trackCount, songCount, the 20 tracks (id, type,
   position, title, key, fileId, songId, leadMusician). **This is your reference
   shape for the cloned probe; you'll compare clone-state vs reference throughout.**

### §0.2 — Sandbox: clone `cd2010f4` to a `c12-saturday`-prefixed fixture

> Verified against `src/lib/mcp/tools/clone-setlist.ts` at `0709bccfa6`. The arg
> shape is `{sourceSetlistId, newName?, newEventDate?, copyServiceNotes?}` —
> there is no `isTest` kwarg. The clone AUTO-stamps `isTest:true` when the new
> name matches `TEST_SETLIST_NAME_PATTERN = /^\[(TEST|CYCLE\d+-|CF\d+-)/i` OR the
> caller uid is test-shaped (`isTestUid`). Cf. `src/types/models.ts:128-142` +
> `src/lib/test-isolation.ts:22-28`.

```js
const clone = await mcp.call("clone_setlist", {
  sourceSetlistId: "cd2010f4-8bb0-4f54-ba2d-8a79d83729a6",
  newName: "[CYCLE12-saturday] c12 Bnei Mitzvah readiness probe",
  // newEventDate omitted (clone defaults to no eventDate — see clone-setlist.ts
  // jsdoc; we don't want this fixture leaking onto the upcoming-Saturday
  // landing).
  copyServiceNotes: false,
});
const fixtureSetlistId = clone.setlistId;   // c12-saturday-readiness probe target
const cloneShape = await mcp.call("get_setlist", { id: fixtureSetlistId });
// Assert clone.isTest === true (it should — bracketed name matches CYCLE\d+- regex);
// if not, supervisor BLOCKER + stop (the probe MUST NOT mutate real data).
```

**Why explicit clone before identity-mint:** every write probe (transpose-via-MCP,
reorder, swap_chart, annotation-persist, add-then-remove-track) hits the clone,
NEVER `cd2010f4`. Per `[[feedback_err_public_not_gated]]` + Daniel "no `publishedAt`
as a gate" directive (decisions.md 2026-05-28T~15:50Z), the clone WILL appear on
the public `/perform` landing UNLESS `isTest:true` (verified auto-stamp by clone
naming). Confirm `cloneShape.isTest === true` before continuing.

### §0.3 — Identity provisioning: 3 musician personas + 1 leader counterparty

Per `[[feedback_sandbox_test_isolation]]`: create-side `uidPrefix`, cleanup-side
`prefix` (same value, different name — `src/lib/mcp/tools/test-tokens.ts:193,1081`).
**NEVER** call `cleanup_all_test_data` without `prefix` (sweeps sibling cowork
instances per `[[feedback_self_inclusion_test_fixtures]]`).

Verified arg regex at `test-tokens.ts:193-198`: `uidPrefix` must be lowercase
alphanumeric + single hyphens, 1-32 chars, no leading/trailing/consecutive
hyphens. **`c12-saturday` passes** (12 chars, 1 hyphen, lowercase).

```js
// Aviva — the practiced band member who's signed in on iPad #3 every week for 3 years
const aviva = await mcp.call("create_test_account", {
  role: "musician",
  uidPrefix: "c12-saturday",
});
// David Lazaroff — the 2nd band_leader (per [[project_david_band_leader]]),
// the surface that exercises broad-scope listing + the writer counterparty
const david = await mcp.call("create_test_account", {
  role: "band_leader",
  uidPrefix: "c12-saturday",
});
// Daniel-persona — the rabbi (admin role). If MCP_ADMIN_TEST_SESSION_SECRET is
// set, this comes from POST /api/auth/admin-test-session with header
// `x-admin-test-secret` (NOT `x-mcp-admin-test-session-secret` — verified
// `src/app/api/auth/admin-test-session/route.ts:56`). If unset, skip the daniel
// identity and run with only aviva + david; mark §A.
const danielSession = process.env.MCP_ADMIN_TEST_SESSION_SECRET
  ? await fetch(`${baseUrl}/api/auth/admin-test-session`, {
      method: "POST",
      headers: { "x-admin-test-secret": process.env.MCP_ADMIN_TEST_SESSION_SECRET },
    }).then((r) => r.json())
  : null;

// Hydrate each identity into a Playwright context with Web-SDK auth via mintSession
// — META-003 mitigated per `cycle-4/harness/lib/probe.mjs:70-126` when `firebaseAuth`
// is passed. Verified at `0709bccfa6`. WITHOUT firebaseAuth, the cookie alone does
// not hydrate Firestore listeners and the matrix lies.
import { mintSession } from "../../cycle-4/harness/lib/probe.mjs";
const avivaCtx = await openIpadContext();
await mintSession({ baseUrl, bearer: aviva.token, uid: aviva.uid, firebaseAuth: avivaCtx.firebaseAuth });
// repeat for david and (if present) daniel.
```

**Three musician identities required** (Daniel directive 2026-05-28T~21:30Z):
- **Aviva** = `musician`-role, signed-in band member — exercises the read-side
  weekly-flow path
- **David** = `band_leader`-role — exercises broader listing scope + writes back
  to the fixture clone to simulate leader-side mid-set tweaks (no real
  `cd2010f4` writes)
- **Daniel** = `admin`-via-admin-test-session — exercises the rabbi/admin view
  (CONDITIONAL on env secret; document gap if absent)

### §0.4 — Hardware fidelity (the iPad reality)

The band runs on **6× standard 11" iPads (820×1180 WebKit portrait,
1180×820 landscape)** per `[[project_band_ipad_hardware]]`. The Playwright
projects are at `playwright.config.ts:37-50`:

| Project name | viewport | base |
|---|---|---|
| `ipad-webkit` | 820×1180 | `devices['iPad Pro 11']` |
| `ipad-webkit-landscape` | 1180×820 | `devices['iPad Pro 11 landscape']` |

**Every musician-side probe in this sweep MUST run inside one of those projects.**
Don't run musician probes against `chromium` or `mobile-chrome` — the WebKit
engine + actual viewport are the difference between cycle-10/11 "passes on dev"
and "fails on the band's stand."

Open each persona context with the appropriate project:

```js
async function openIpadContext({ orientation = "portrait" } = {}) {
  const project = orientation === "landscape" ? "ipad-webkit-landscape" : "ipad-webkit";
  return await browser.newContext({
    ...devices[orientation === "landscape" ? "iPad Pro 11 landscape" : "iPad Pro 11"],
    viewport: orientation === "landscape" ? { width: 1180, height: 820 } : { width: 820, height: 1180 },
    storageState: undefined,  // mintSession will populate after firebaseAuth signin
    // serviceWorkers: 'allow' (default — we WANT SW caching for the offline-survival probes)
  });
}
```

---

## §1 — The hybrid finding shape (the methodology)

Every finding self-tags `{shape: "narrative" | "matrix" | "heuristic"}` based on
what BEST captures the friction. Use this decision rule:

| If the friction is best captured as… | Use shape |
|---|---|
| A moment in a specific musician's hands at a specific clock-time | `narrative` |
| A deterministic cell in (action × surface × identity × persistence) that diverges | `matrix` |
| A design-affordance violation activated by a stress condition (glare, time-pressure, partial attention, offline) | `heuristic` |

Each shape's body is structured but PROSE-FORWARD. No JSONL-as-primary (per cycle-11
charter §3 AP-3); the markdown report is the source of truth, with an optional
secondary `findings.jsonl` mirror for grep at end-of-run.

### §1.1 — `shape: "narrative"` card

```markdown
### F-C12-NNN — <one-line musician-moment in user terms>
- **Shape:** narrative
- **Persona:** Aviva | David | Daniel
- **Anchor moment(s):** A1 | A2 | A4
- **Worry axis:** offline-survival | stickiness | both
- **Timeline beat:**
  > [10:14:32 — Aviva is on track 7 "Adon Olam" in B♭. Bass cuts back in. She
  > swipes left to advance to track 8. The chart starts loading — she sees a
  > "Loading chart…" spinner. She glances at David, who nods to start the
  > vamp. At 10:14:36 the chart paints — but in F, not B♭. She mutters "wait, key,"
  > opens the transpose menu, picks +1, plays the head in B♭. **Friction cost: 4
  > seconds + 1 confidence dent in front of the family.**]
- **Surface (mechanism footnote):** `src/components/performance/PDFOverlay.tsx`
  + transpose state in `SetlistPerformClient.tsx` — between-track transpose-state
  reset / per-track default-key behavior.
- **Severity (musician-felt):** HIGH (A2 between-songs — actively spent her 6-sec window)
- **Affordance fix (1-3 sentences):** Persist transpose on a per-track basis
  in the URL (mirrors track-position-in-URL pattern shipped `595153b192`). On
  reload OR between-track jump, restore the last transpose for THAT track, not
  a session-global value.
```

### §1.2 — `shape: "matrix"` card

```markdown
### F-C12-NNN — <one-line cell-divergence in user terms>
- **Shape:** matrix
- **Cell-ID:** `M.S.A1.D3` (action.persistence)
- **Action:** transpose +1 in PerformanceToolbar TransposerMenu
- **Surface:** /perform/setlist/<fixtureSetlistId>/track/<trackId> (post-`595153b192`
  track-position-in-URL sub-route)
- **Identity:** musician C.3 (Aviva)
- **Persistence:** D.3 cold reload (`context.close()` + reopen `storageState`)
- **Anchor:** A2, A4
- **Expected (user terms):** "I change the key to D♭, close my browser, reopen — chart still in D♭"
- **Observed (user terms):** "I change the key to D♭, close my browser, reopen — chart is back to E"
- **Repro (≤6 steps, reproducible from a fresh harness fire):**
  1. mintSession as Aviva (`c12-saturday` uidPrefix, role:musician)
  2. open /perform/setlist/<fixtureSetlistId>/track/<trackId-for-track-7> in `ipad-webkit`
  3. open TransposerMenu, select +1 → chart re-renders in D♭
  4. context.close() then `browser.newContext({storageState:prevState})` then re-open same URL
  5. observe initial render: chart back in E
- **Repeated 3 trials:** 3/3 diverged the same way (deterministic)
- **Severity:** HIGH
- **Affordance fix (1-3 sentences):** Mirror the track-position-in-URL pattern
  to track-transpose-in-URL: `/perform/setlist/<id>/track/<trackId>?t=+1`. Reload
  restores the transpose from the URL.
- **Artifact paths:** `artifacts/F-C12-NNN-before.png` / `-after.png`
```

### §1.3 — `shape: "heuristic"` card

```markdown
### F-C12-NNN — <one-line designer description in user terms>
- **Shape:** heuristic
- **Heuristic:** H1 (Visibility of system state) | H5 (Error prevention) | H6 (Recognition over recall) | H7 (Aesthetic + between-songs scramble test) | H8 (Help, recognize, recover from errors)
- **Stress condition:** S-offline (axis-1) | S-reload (axis-2) | S-glare | S-time-pressure | S-partial-attention | S-cross-musician
- **Anchor moment:** A1 | A2 | A4
- **Persona observed under:** Aviva | David | Daniel
- **Surface:** /perform/setlist/<id> chart-overlay
- **The musician's experience (1-2 sentences, first-person POV):**
  > "I tap track 8. The chart shows 'Loading chart…' for 3 seconds. I don't know
  > if it's loading because the wifi blipped or because the chart isn't cached.
  > I just keep waiting."
- **The heuristic violation:** H8 says the app must *tell* the musician what's
  wrong and what to do. Right now, "Loading…" is the same UI whether wifi is
  fine + chart is just slow OR wifi is dead + chart is never coming.
- **The stress condition that activates it:** S-offline (axis-1) — under flaky
  sanctuary wifi mid-set, indistinguishable spinner-states cost the musician
  4+ seconds of "is this me?" before they take action.
- **Affordance fix (1-3 sentences):** When `navigator.onLine === false` (or after
  ~2s of stalled chart load), surface a distinct "Offline — chart not cached"
  pill that tells the musician *what's wrong* and gives them a "skip to next"
  affordance. The current `KeepAwakeToggle`'s `lastError` pattern (shipped
  `fd9e5c8439`) is the template — same idea, different state.
```

---

## §2 — Scope (worry axes + anchor moments + bug-classes)

### §2.1 — Axis 1: mid-service wifi-drop / offline survival

The mid-service threat model: the band's NAT'd sanctuary wifi blips during a
Torah reading or sermon. The musician is mid-chart on track N. The blip lasts
3-30 seconds. **What survives?**

Probe each:

| Probe | Method | Pass criterion |
|---|---|---|
| **Already-loaded chart still readable when network drops** | `goOffline(page)` (route-abort http(s), per `e2e/helpers/gestures.ts:57`) — NOT `context.setOffline(true)` because it ALSO blocks `blob:` URLs and produces false failures (verified `e2e/helpers/gestures.ts:50-65` + `e2e/perform-ipad-offline.spec.ts:22-30`). Chart already loaded; toggle offline; pan/scroll/page-turn. | Chart remains readable; no white-screen; no error overlay |
| **Wake-lock survives offline transition** | `goOffline(page)` while wake-lock is on (KeepAwakeToggle); verify state pill via `KeepAwakeToggle.tsx` post-`fd9e5c8439` lastError shape | Wake-lock state stays "on" (or surfaces lastError ≠ network-related; lastError values per `src/hooks/use-wake-lock.ts` post-`fd9e5c8439`) |
| **Service-worker / Firestore offline-cache holds the chart bytes** | Pre-load track N online; `goOffline(page)`; reload page; check chart renders from cache | Chart renders within 2s of reload; no "Loading chart…" infinite |
| **Bond-fail recovery on reconnect** | `goOffline()`; navigate to an un-cached track N+1; `goOnline()`; observe recovery | Chart eventually loads after `goOnline()`; no permanent stuck-spinner; the `ipad-stuck-spinner-probe.spec.ts` class regression doesn't re-emerge |
| **Sanctuary-wifi-blip during a song doesn't nuke the next-track entry** | Mid-song offline → online with the leader's "next: <track>" — does Aviva land on track N+1 within 6s of `goOnline()`? | ≤6s from goOnline to track N+1 chart open at correct key |

The harness primitive: **`goOffline`/`goOnline` from `e2e/helpers/gestures.ts`** —
NOT `context.setOffline(true)` (which breaks blob: URLs and gives FALSE failures
on PDF chart rendering per the file's own dosctring). Reuse `goOffline()`
verbatim. Existing offline-survival specs to lean on as templates:
- `e2e/perform-ipad-offline.spec.ts` — primary offline reference
- `e2e/r1-offline-decisive.spec.ts` — supplementary
- `e2e/ipad-stuck-spinner-probe.spec.ts` — first-tap-spinner class regression check

### §2.2 — Axis 2: stickiness + reload-survival across the 20 tracks

Cycle-11 just shipped a stack of stickiness fixes — they ALL must hold up across
the FULL 20 c12-saturday-clone tracks under all 3 personas. **No sampling.** If
the c12 clone has 20 tracks, you grade 20 tracks. Sampling is what cycle-11 M3
did and it was correct for design-time; cycle-12 is verification-time and demands
exhaustive coverage on the just-landed regression surface.

| Regression-graded fix | SHA | Probe |
|---|---|---|
| Track-position-in-URL across all 20 c12 tracks (M3-009) | `595153b192` | Open `/perform/setlist/<fixtureSetlistId>/track/<trackId>` for each of the 20 tracks; reload; assert URL preserved + `activeSongIndex` correctly seeded |
| Transpose `+N` indicator persists in toolbar across reload (M3-004) | `fd9e5c8439` | Sample 4 tracks across {head, middle, end, divider-adjacent}; transpose each; reload; assert TransposerMenu button label still shows signed `+N` accent (verified `PerformanceToolbar.tsx` post-fd9e5c8439) |
| Wake-lock `lastError` pill renders on tab-hidden + denied paths (M3-001) | `fd9e5c8439` | `await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))` with `document.visibilityState='hidden'`; assert `KeepAwakeToggle.tsx` renders the inline lastError pill ("Tab not focused…") |
| SSR-prefetch landing shows c12 clone IF (and only if) `isTest:false` (M3-012) | `0aef7d53d0` | `curl https://www.centralreform.live/perform` unauth → assert c12 clone (which is `isTest:true`) is EXCLUDED; assert real `cd2010f4` IS included (it's `publishedAt:null` but per Daniel's err-public invariant it's still public) |
| Auth-indicator pill / QR card mutual-exclusion (M3-012) | `0aef7d53d0` | Open `/perform` as each persona (signed-out, Aviva, David, Daniel) and assert: signed-out → QR card visible AND auth-indicator absent; signed-in → QR card absent AND auth-indicator visible |
| songCount denorm on `clone_setlist` (PRIME write path — your fixture IS the probe) | `ae647fac20` | After §0.2's clone, assert `cloneShape.songCount === 16` (matches `cd2010f4`'s 16 songs); separately clone again with `[CYCLE12-saturday] secondary` and assert songCount = 16 again on the second clone (catches a regression in the just-landed denorm code) |
| songCount on `commit_staged_changes` multi-edit (Daniel/David weekly authoring path) | `ae647fac20` | As David: `stage_proposal({setlistId:fixtureSetlistId, edits:[{remove:trackId-1},{remove:trackId-2}]})` then `commit_staged_changes`; assert post-commit `songCount === 14` (16 − 2). |
| Widened cron bond-health includes `publishedAt:null` rows (`cd2010f4` regression) | `0709bccfa6` | `curl -H "Authorization: Bearer $CRON_SECRET" https://centralreform.live/api/cron/verify-chart-bond-health` → response includes `surveyed` count > 0 AND the in-process `data.isTest === true` filter EXCLUDES the c12 clone (assert `cd2010f4` appears in scope; c12 clone does NOT) |

For each grade: pass / partial / regress. A `partial` outcome (e.g., track-position
persists on tracks 1-16 but breaks on the 4 dividers) is itself a finding — don't
collapse to PASS.

### §2.3 — The 4 anchor moments (charter §1 — A1, A2, A4 only; A3 OUT)

| Anchor | What "good" looks like for c12 | Probe (in the hybrid PROMPT) |
|---|---|---|
| **A1 setup-prep** | Fresh iPad-webkit-landscape (1180×820), Aviva opens cloned c12 setlist; all 16 song-rows visible at-a-glance; each chart loads on first tap; offline-cache primed (verify via subsequent `goOffline()` reload — chart still renders) | §3 part A walk-through, all 20 tracks |
| **A2 between-songs scramble** | From track N (3 sample tracks across the 20), can the musician land on track N+1 chart at the right key in **≤6s with network OFF**? Wake-lock holds across the song change? Cycle-11 M3-009 track-position-in-URL means reload-mid-set lands on the right track — verify across ALL 20 tracks, not sampled | §3 part B sweep across 20 tracks |
| **A4 sanctuary edge** | Wifi-flaky-mid-set; Firestore offline-cache behavior on the c12 clone; PWA service-worker chart-bytes caching; reconnect-on-resume; songCount denorm holds across a c12 clone → add-track → remove-track → reload sequence (regression-grade the 4 leak paths `ae647fac20` fixed: `clone_setlist`, `clone_setlist_from_template`, `createSetlistServerSide`, `commit_staged_changes`) | §3 part C + the offline matrix |

**A3 mid-service key/song change — INTENTIONALLY OUT** (Daniel directive 2026-05-28T~21:30Z;
M3-004 transposer-state-display covers part). DO NOT add A3 cells; if you find
A3-class frictions emerge during walkthrough, NOTE them in §F (out-of-cycle-12-scope)
of the REPORT, do NOT promote them as cycle-12 findings.

### §2.4 — The 3 bug-classes (charter §2)

Each MUST surface as a named beat across the run (zero-finding outcome is acceptable
data, but the probes must run):

- **Stickiness regressions** — Cycle-11 just shipped stickiness fixes; the regression
  surface is the FULL §2.2 table. Each row IS a stickiness probe.
- **Fresh-tablet cache divergence** — INTENTIONALLY OUT (cycle-11 M3 covered).
  Don't probe fresh-incognito or no-storageState contexts; the personas should
  use `storageState` populated by `mintSession({firebaseAuth})`.
- **Auth-state divergence** — surfaces via the 3 personas (Aviva musician vs.
  David band_leader vs. Daniel admin). The auth-indicator-vs-QR-card matrix
  cell + the `list_setlists` scope per role IS the auth-divergence probe.

---

## §3 — Walkthrough plan (~75 min budget; 3 personas × 3 moments)

**Total wall-clock budget: ~75 min** per `[[feedback_cowork_real_harness]]` (single
cowork session, NOT walk-away). Pace per the table:

| Phase | Time | Vehicle |
|---|---|---|
| §0 boot + clone + identity mint | ~10 min | MCP calls + Playwright context setup |
| **§3.A — A1 setup-prep walk (Aviva)** | ~15 min | live walking judgment in `ipad-webkit-landscape` + selective harness specs |
| **§3.B — A2 between-songs sweep across 20 tracks (Aviva)** | ~15 min | scripted Playwright loop across the 20 trackIds + stopwatch + ≤6s assertion |
| **§3.C — A4 sanctuary-edge offline matrix (all 3 personas)** | ~15 min | `goOffline`/`goOnline` matrix + multi-context cross-musician |
| **§3.D — Regression-grade the 8 cycle-11 SHAs (§2.2 table)** | ~10 min | scripted matrix per the table |
| Cleanup + REPORT write | ~10 min | `cleanup_all_test_data({prefix:"c12-saturday"})` + write §A-§F sections |

### §3.A — A1 setup-prep walk (Aviva, ~15 min)

Identity state: Aviva (musician, `c12-saturday` uidPrefix). Open
`ipad-webkit-landscape` context. Landing flow:

1. Aviva wakes the iPad → lands on `/perform`. **Beat 1:** card list paints
   within 200ms; the c12 clone is EXCLUDED (it's `isTest:true`); the real
   `cd2010f4` is INCLUDED (it's `publishedAt:null` but per err-public
   invariant is intentionally listed). Verify both visually and via DOM.
2. Aviva taps the cd2010f4 card. **Beat 2:** Setlist header loads. Read the
   `songCount` "16 songs · 20 items" on the card vs the header — must match.
   Cycle-10 C10I1-002 documented this mismatch; cycle-11 `8139a443ec` +
   `ae647fac20` shipped fixes; verify zero mismatch.
3. Aviva BUT then switches to the fixture clone (`/perform/setlist/<fixtureSetlistId>`)
   so all subsequent writes hit the clone. Setlist header loads on the clone.
4. **Beat 3:** Scan-time. All 16 song-rows visible without scrolling at
   1180×820 landscape? In 820×1180 portrait? Note any track row hidden
   below the fold.
5. **Beat 4:** Tap each of the 20 tracks in sequence. Time the chart paint
   from tap to first chord-glyph visible. Bucket: <1s, 1-2s, 2-4s, >4s. The
   >2s tail is a friction signal.
6. **Beat 5:** While walking through, NOTE every state-affordance Aviva sees:
   does she know wake-lock is ON? Transposed +N? Bound chart vs un-bound?
   "Save 16/16" cache primed? Use the §1.3 H1 lens.

Beat 4's per-track open results feed into §3.B. Capture screenshots only for
findings — passing beats stay in the timeline narrative.

### §3.B — A2 between-songs sweep across 20 tracks (Aviva, ~15 min)

For each pair `(track N, track N+1)` across the 20:

1. Open `/perform/setlist/<fixtureSetlistId>/track/<trackId-N>` (post-595153b192
   sub-route)
2. Trigger the next-track entry — there are two paths to grade:
   - **Path A**: swipe/keyboard PageDown / next-track button (whichever
     the in-app affordance is at master)
   - **Path B**: direct URL change to `track/<trackId-N+1>` (simulates the
     reload-mid-set case)
3. **Stopwatch from path-trigger to chart-paint-with-glyph.** Assert ≤6s
   (the musician has ~6s in A2 per charter §1).
4. **Verify state at landing:** correct trackId in URL, correct key (matches
   `cloneShape.tracks[N+1].key`), wake-lock still on, transpose state
   appropriate (sticky-per-track per the M3-004 fix? Per-session global?
   per-URL? — Note finding if behavior is unexpected).

20 trackIds → 19 (N, N+1) pairs × 2 paths = 38 transitions. With ~24s budget
per transition, this lands in ~15 min. Findings emerge inline; cells that
take >2 min → mark `⊘ slow — defer` and move on.

### §3.C — A4 sanctuary-edge offline matrix (~15 min)

The offline-survival matrix per §2.1. For each row of the table (5 rows × 3
personas = 15 cells; each cell ~50s):

```js
async function probeOfflineCell(persona, probeKind) {
  const ctx = personaContexts[persona]; // pre-minted from §0.3
  const page = await ctx.newPage();
  await page.goto(`/perform/setlist/${fixtureSetlistId}/track/${tracks[7].id}`);
  await waitChartCached(page); // per e2e/helpers/gestures.ts
  await goOffline(page); // route-abort http(s)
  // ... probe-kind-specific steps
  await goOnline(page);
  return verdict;
}
```

Cells go in the matrix table in §F of the REPORT, with a per-cell
pass/partial/regress verdict + the friction observation (heuristic-shape if
the friction is about an affordance, narrative-shape if it's about a moment).

### §3.D — Regression-grade the §2.2 SHAs (~10 min)

Run each row of the §2.2 table mechanically. Capture pass/partial/regress per
row. Any regression on a just-landed cycle-11 fix is a P0 finding (must dispatch
before Saturday downbeat). Any partial is a P1.

---

## §4 — Boot order (the cowork instance's runbook)

1. Read this PROMPT.md end-to-end.
2. Read `.coord/cycle-11-CHARTER.md` once (north-star, 4 anchor moments, 3 bug-classes,
   anti-patterns, run policy — same shared frame as cycle-11 trio).
3. Read `cycle-4/harness/README.md` for the `npm run stress` reality + probe-batch +
   `mintSession` shape.
4. Boot pre-flight §0.1 — HARD-BLOCK on failure.
5. Sandbox setup §0.2 — clone `cd2010f4` to fixture; assert `cloneShape.isTest === true`.
6. Identity provisioning §0.3 — mint Aviva + David + (conditional) Daniel via
   `mintSession({firebaseAuth})`. **NEVER** raw `test-session` cookie alone (META-003).
7. Open contexts §0.4 — `ipad-webkit-landscape` primary, `ipad-webkit` portrait for
   A1 beat 4 check; document any orientation-specific findings.
8. Run §3 phases A→B→C→D in order. Time-box each.
9. Cleanup §6.
10. Write REPORT.md per §5.

---

## §5 — Output shape (the deliverable)

Write to **`.paul/research/cycle-12-saturday-readiness/REPORT.md`** (ONE consolidated
file; the hybrid bet — no three-way split). Optional secondary
`findings.jsonl` mirror at end of file for grep — markdown is the source of truth.

```markdown
# Cycle-12 Saturday-readiness — REPORT

**Run date:** YYYY-MM-DDTHH:MMZ
**Wall-clock:** ~75 min single-thread (per [[feedback_cowork_real_harness]])
**Master SHA at run:** <git log -1 origin/master>  (expected `0709bccfa6` ± minor drift)
**Personas exercised:** Aviva (musician) + David (band_leader) + Daniel (admin via admin-test-session) [or "Daniel SKIPPED — MCP_ADMIN_TEST_SESSION_SECRET unset"]
**Real Saturday setlist (reference, read-only):** cd2010f4-8bb0-4f54-ba2d-8a79d83729a6
**Fixture clone (write target):** <fixtureSetlistId> — `[CYCLE12-saturday]` named; `isTest:true` verified at create-time
**Anchor coverage:** A1 ✓  A2 ✓  A3 OUT-OF-SCOPE  A4 ✓
**Bug-class coverage:** stickiness ✓  fresh-tablet OUT-OF-SCOPE  auth-divergence ✓
**Cleanup state:** clean | partial — list orphans below
**Saturday-readiness verdict:** SHIP-AS-IS | SHIP-WITH-FIXES <list of P0s> | HOLD-AND-FIX

---

## §A — Saturday-readiness verdict (≤200 words)

One paragraph: would I trust this app to land Saturday's B'nei Mitzvah without
a service-quality incident? Anchor on the worry axes — does offline survive?
Does stickiness hold across all 20 tracks? What's the single biggest thing the
band will feel that we should fix in the <38h-to-downbeat window? What's the
worst-case beat from the run — would a real musician have stalled out of the
service over it?

---

## §B — WHAT-WE-LEARNED (≥3 design principles)

Each principle = one-line distillation + 2-3-sentence explanation. Designer-
actionable insights, NOT bug-counts. Per charter §3 AP-4 break.

Example shape (do not reuse verbatim):
- **"Stickiness is now structurally per-track, not per-session — the URL is the
  source of truth."** Cycle-11's `595153b192` track-position-in-URL change
  shifted the persistence model. The cycle-12 sweep validated this holds for 20
  tracks across 3 personas with zero regressions; the few partial-stickiness
  beats observed traced to client state OUTSIDE the URL (transpose) and are
  candidates for the next persistence migration.

---

## §C — Findings (per the §1 hybrid shape; tagged narrative | matrix | heuristic)

Each finding gets a `F-C12-NNN` ID + the §1 card schema. Order by severity
within shape.

### F-C12-001 — <one-line moment in user terms>
[card per §1.1 / §1.2 / §1.3]

### F-C12-002 — …
[…]

Target finding count: **5–12.** Quality > quantity. A 5-finding REPORT with
deep moment-anchored frictions is preferable to a 25-finding scattershot.

---

## §D — The §2.2 cycle-11 regression matrix (explicit pass/partial/regress per SHA)

| Fix SHA | Probe | Persona | Verdict | Note |
|---|---|---|---|---|
| `595153b192` track-position-in-URL | 20 tracks × URL preservation | Aviva | ✓ all 20 | |
| `fd9e5c8439` transpose +N indicator | 4 sample tracks × reload | Aviva | … | |
| `fd9e5c8439` wake-lock lastError pill (tab-hidden + denied) | visibility-change probe | Aviva | … | |
| `0aef7d53d0` SSR-prefetch isTest exclusion | unauth GET /perform | (none — anon) | … | c12 clone excluded? Y/N; cd2010f4 included? Y/N |
| `0aef7d53d0` auth-indicator/QR card exclusion | each of 4 auth states | all | … | |
| `ae647fac20` songCount denorm on clone_setlist | post-§0.2 clone | David | … | |
| `ae647fac20` songCount on commit_staged_changes | stage→commit on fixture | David | … | |
| `0709bccfa6` cron-bond-health publishedAt:null + isTest exclusion | curl /api/cron/verify-chart-bond-health | (anon w/ CRON_SECRET) | … | cd2010f4 in scope? Y/N; c12 clone excluded? Y/N |

ANY `regress` row is a P0 (must fix pre-Saturday). ANY `partial` row is a P1
(should fix pre-Saturday).

---

## §E — Offline-survival matrix (axis-1, §2.1 × 3 personas)

| Probe | Aviva | David | Daniel |
|---|---|---|---|
| Already-loaded chart readable when offline | … | … | … |
| Wake-lock survives offline transition | … | … | … |
| SW / Firestore offline-cache holds chart bytes | … | … | … |
| Bond-fail recovery on reconnect | … | … | … |
| Sanctuary-blip mid-song doesn't nuke next-track entry | … | … | … |

---

## §F — Out-of-cycle-12 scope (parking lot)

Findings that surfaced during the walk but are OUT of cycle-12 scope (A3
mid-service change, fresh-tablet onboarding, battery, wake-lock acquisition
failure — see §2.3). Note for the supervisor's triage; do NOT promote.

---

## §G — Cleanup state + manual cleanup (if any)

If §6 cleanup partially failed, list orphans. Daniel sweeps.

---

## §H — Optional `findings.jsonl` (grep mirror — secondary, not source-of-truth)

[one JSON line per F-C12-NNN, schema: `{id, shape, anchor, axis, persona, severity, surface, mechanism, fix_hint}`]
```

### HANDOFF-COMPLETE message body (for `.coord/inbox/supervisor.md`)

```
from cycle-12-saturday-readiness
HANDOFF-COMPLETE
Saturday-readiness verdict: <SHIP-AS-IS | SHIP-WITH-FIXES <list> | HOLD-AND-FIX>
anchors-covered: A1 ✓  A2 ✓  A3 OUT  A4 ✓
bug-classes-covered: stickiness ✓  fresh-tablet OUT  auth-divergence ✓
load-bearing P0/P1 findings (≤5 IDs + one-line moments):
  F-C12-NNN  P0 narrative — <one-line>
  F-C12-NNN  P1 matrix    — <one-line>
  …
cycle-11 SHA regressions (any): <SHA list, or "zero">
cleanup: clean | partial — list orphans
report: .paul/research/cycle-12-saturday-readiness/REPORT.md
```

---

## §6 — Cleanup (end-of-run, ~5 min) — MANDATORY before HANDOFF-COMPLETE

```js
// 1. Delete the fixture clone (and any secondary clones from the §2.2 songCount-on-clone probe)
await mcp.call("delete_setlist", { id: fixtureSetlistId, force: true });
// for each secondary clone created during the run:
await mcp.call("delete_setlist", { id: secondaryCloneId, force: true });

// 2. Sweep test accounts (prefix-scoped — never call without prefix per
//    [[feedback_self_inclusion_test_fixtures]])
await mcp.call("cleanup_all_test_data", { prefix: "c12-saturday" });

// 3. Verify zero residual
await mcp.call("list_test_accounts", {}); // → none matching c12-saturday
await mcp.call("search_library", { query: "c12-saturday" }); // → empty
await mcp.call("list_setlists", {}); // → no [CYCLE12-saturday] or c12-saturday-named setlists
```

If any verify step fails → list orphans under §G "Manual cleanup needed" in REPORT.

---

## §7 — Anti-patterns explicitly broken (charter §3 — required disclosure)

This PROMPT intentionally breaks these cycle-1-through-10 anti-patterns:

- **AP-1 (class-violation findings).** Every finding card carries an anchor-moment
  tag + a worry-axis tag + a musician-felt severity grade. Cards that reduce to
  "h-10 button vs HIG 44" without a musician-felt friction are rejected to §F.
- **AP-3 (JSONL primary).** The REPORT.md is the source of truth; the optional
  `findings.jsonl` mirror at §H exists only for grep compatibility with the
  cycle-10 supervisor pipeline.
- **AP-4 (findings-as-only-output).** §A verdict + §B WHAT-WE-LEARNED + §E
  offline-matrix + §F out-of-scope parking lot together carry the design-level
  insight that AP-4 says should not be reduced to a bug-count.
- **AP-6 (pre-service ship-freeze).** Per Daniel directive 2026-05-28: NO ship-freeze.
  Reports → immediate fix wave. Saturday risk accepted.
- **AP-7 (single-state probe).** 3 personas (Aviva musician, David band_leader,
  Daniel admin via admin-test-session) — explicit multi-identity probing baked in.
  The matrix-shape cells use multi-identity contrast as the probe.

This PROMPT does NOT explicitly break (and is structurally vulnerable to — note for
future-cycle awareness):
- **AP-2 (app-wide roam).** Deliberately narrow — 2 axes × 3 moments × 1 fixture
  clone. The breadth this misses is by design; broader sweep is a future cycle's
  problem.
- **AP-5 (audit-the-app stance).** The narrative-shape cards use first-person
  musician POV, but the matrix-shape and heuristic-shape cards retain an
  observer voice. That's deliberate — the hybrid bet is the SHAPE flexes per
  friction, not the VOICE.

---

## §8 — Operational rules + hard out-of-scope

**Operational (binding):**
- ⛔ **No writes to real `cd2010f4`.** Every write hits the fixture clone OR a
  newly-minted secondary clone with the same `[CYCLE12-saturday]` name prefix.
- ⛔ **No live X32 / monitor writes.** `/monitor` is visual-shape ONLY (per
  `[[project_mixer_feature]]` + `[[feedback_terminology]]` — wedges, not IEM).
  This sweep doesn't probe `/monitor` at all; it's not in scope for the
  Saturday-readiness axis-1 / axis-2.
- ⛔ **No bearer / secret in any file under `sheet-music-app/`.** Redact as
  `***redacted***` in the REPORT.
- ⛔ **`publish_setlist` only on the fixture clone, never on real upcoming
  recipients.** (And actually, given the fixture is `isTest:true`, calling
  `publish_setlist` on it is harmless — but stick to fixture-only out of
  habit.)
- ⛔ **NEVER `cleanup_all_test_data` without `prefix`** (sweeps sibling cowork
  instances).

**Hard out-of-scope (do NOT probe):**
- Repo-root `mcp/`, `bridge/`, `SetlistGrid.tsx`, `src/lib/mcp/errors.ts`,
  `src/lib/mcp/error-envelopes.ts` (do-not-touch zones per `[[CODER.md]]`).
- F-002 lyric-search (feature dropped at `3155fb2881`).
- `/monitor` (out of cycle-12 scope; A4 sanctuary-edge probes only the chart-overlay
  surface, not the mixer).
- A3 mid-service key/song change (Daniel directive — out of cycle-12).
- Fresh-tablet / no-cache contexts (Daniel directive — out of cycle-12).
- Battery / tab-background / wake-lock-acquisition-failure mode (Daniel
  directive — out of cycle-12).

---

## §9 — Success criterion (auditor checks this before ACCEPT)

The cowork RUN is "ran successfully" iff:
- ≥18 of the 20 c12 cloned tracks were traversed in §3.B (≥90% coverage on the
  full-track stickiness sweep).
- §2.2 regression table has a verdict per row (no `?` cells).
- §A verdict is decisive (SHIP-AS-IS / SHIP-WITH-FIXES / HOLD-AND-FIX) with a
  one-sentence-per-P0 rationale.
- §B has ≥3 design principles.
- Cleanup §6 verified empty (or §G lists orphans).
- HANDOFF + HANDOFF-COMPLETE landed in supervisor inbox.

**Auditor verification (Tier-0 doc for THIS prompt-design lane; Tier-1 for the
eventual cowork RUN):** per-finding reproducibility on a fresh harness fire. If
a finding isn't reproducible, downgrade to `partial`. Per `[[feedback_auditor_deployed_surface_verification.md]]`,
sample 2-3 P0/P1 findings against the deployed surface (curl probe or playwright
re-fire) before ACCEPTing the cowork RUN.

---

## §10 — Sign-off

The cowork instance signs the supervisor inbox HANDOFF-COMPLETE message
`from cycle-12-saturday-readiness`. The auditor reads the REPORT against (a)
verify-every-ref pass (b) §2.2 regression-table full (c) §A verdict + §B
principles present (d) cleanup verified.

Go.

— from coder-1 (lane `cycle-12-saturday-readiness-prompt-design`)
