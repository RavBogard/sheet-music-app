# DISCUSSION — live key / song swap

**Lane:** `live-key-song-swap-interview` (Tier-0 INTERVIEW + DESIGN-DISCUSS)
**Author:** coder-5
**Date:** 2026-05-23T21:05Z
**Rounds:** 2 (Q/A 1+2 in this directory)

---

## TL;DR (60-second read)

Daniel's original ask was framed as one thing: "a quick and easy way to
change a key or a song for everyone in their charts mid-service." Two
interview rounds resolve it into two independent questions with two
different verdicts.

| | Verdict | Why |
|---|---|---|
| **Live key change → all iPads** | **DROP** | Most charts are PDF. PDFs can't re-render in a new key — the bytes are fixed. A "now in B♭" label on top of a chart still drawn in D is exactly the (b) fragility Daniel called a showstopper. The verbal call + per-musician local transpose (where supported) is honestly the safer ship today. Revisit when the chart mix flips to MusicXML. |
| **Live song swap / insert → all iPads** | **BUILD-MINIMAL** | New song = new chart fileId = new bytes. Every iPad fetches the new chart fresh — no (b) failure mode. Bryn is a viable single-authoring hand (Daniel-confirmed Round 2 Q2). Existing MCP write infrastructure (`propose_setlist_changes` / `add_track_to_setlist` / `commit_staged_changes`) + Firestore→Dexie→useLiveQuery propagation pipe already work end-to-end. We need a thin in-app UI affordance on the Perform-view header for authorized authors. |

**One-line recommendation:** Build the Bryn-driven live-insert button.
Drop the key-change propagation. Re-evaluate the key-change drop when
MusicXML becomes the chart-format majority.

---

## Hard constraints surfaced by the interview

1. **Daniel has no live-authoring surface.** Hands: guitar + siddur.
   Eyes: siddur. Not on Claude Desktop, not on an iPad he can reach.
   2-3x per service. (Round 1 Q1/Q5/Q7)
2. **No trust signal needed.** Daniel isn't looking at any screen during
   service. (Round 1 Q4)
3. **No undo surface needed.** Re-edit if wrong. (Round 1 Q6)
4. **Fragility-as-DROP criterion:** Daniel picked (b) wrong-but-confident
   chart display, (d) wrong-row edit, (e) wake-from-sleep stale UI. He
   did NOT pick (a) WiFi-stale or (c) no-ack — consistent with him not
   looking at the iPad himself. (Round 1 Q3)
5. **Most charts are PDF.** Strategic migration to MusicXML is in flight
   but the current mix is PDF-heavy. (Round 2 Q1)
6. **Bryn can be the dedicated tapper.** One named, hands-free authoring
   person. (Round 2 Q2)
7. **Song swaps are usually fresh** — a song from the catalog that
   wasn't in tonight's setlist. (Round 2 Q3)

---

## Design shapes (tradeoff matrix)

|  | **A. DROP / status quo** | **B. Key-change broadcast** | **C. Bryn-driven song-insert** | **D. Both B+C** |
|---|---|---|---|---|
| **Author surface** | Daniel's voice in the room | Bryn taps key on her iPad | Bryn taps "live insert" on her iPad | Bryn taps either button |
| **Daniel UX** | unchanged (turn + tell) | unchanged | unchanged | unchanged |
| **Bryn UX** | unchanged (hears Daniel; doesn't touch the iPad) | hears Daniel → tap-step-up/step-down on the current song row | hears Daniel → search library → tap song → confirm → inserts at current position | both |
| **Other-musicians UX** | self-transpose on chord-text/MusicXML if they want; mental transpose on PDF | iPad re-renders if chart is MusicXML/text; iPad shows OLD graphics + NEW key label if PDF | new chart loads on every iPad; renders fresh | both |
| **Latency** | 0s (verbal already happened) | Firestore propagation ~1-2s on good WiFi | Firestore propagation ~1-2s on good WiFi | both |
| **Failure mode (b) — wrong-but-confident chart** | doesn't exist (no centralized change) | **Guaranteed on PDF** — label changes, graphics don't | not applicable (new chart = new bytes) | **Inherits B's guaranteed failure on PDF charts** |
| **Failure mode (d) — wrong row** | doesn't exist | only one row option per song-pick (current track); Bryn deliberate-tap | confirm-step before commit; Bryn deliberate-tap on a search-picked song | both |
| **Failure mode (e) — sleep/wake stale** | doesn't exist | KeepAwakeToggle (559c6c84d) covers | KeepAwakeToggle covers | both |
| **Reliance on Bridge** | none | none | none | none |
| **Reliance on MCP/Claude mid-service** | none | none | none | none |
| **New auth surface** | none | needs band-leader role on perform-view editing | needs band-leader role on perform-view editing | shared |
| **Build size** | 0 LOC | ~150-250 LOC (UI button + transpose-write API + tests) | ~200-300 LOC (UI button + search modal + insert/replace API + tests) | ~350-500 LOC |
| **Test surface** | n/a | small-medium (transpose unit + propagation) | medium (search interaction + insert + propagation) | larger |
| **DROP rationale** | n/a — this IS dropping it | **PDF-dominant chart mix → guaranteed (b) failure → exactly the fragility Daniel called a showstopper** | n/a (recommended build) | inherits B's drop rationale |

Per [[feedback_dryrun_is_observability]] / cycle conventions, the build
shapes (C) can ship a dryRun-equivalent (read-back the proposed change
before commit) on the UI side — single confirm-step covers it.

---

## Recommendation

### 1. DROP key-change propagation (shape B) — for now.

The PDF-dominant chart mix makes it guaranteed-fragile by Daniel's own
(b) criterion. The label-vs-graphics mismatch on PDF charts is not a
solvable problem at this layer — it requires either (i) per-musician
local mental transpose (status quo, works today), or (ii) MusicXML
charts that can dynamically transpose (strategic migration). Shipping
a "key change" button on top of a PDF chart would actively HURT the
service by giving musicians wrong-but-confident chart displays. The
verbal call is the working mechanism. Don't replace it with something
worse.

**Trigger to revisit:** when MusicXML becomes the chart-format majority
(or when the band's most-frequent songs all have MusicXML versions),
this drop should be reconsidered. The build shape would then become a
small per-song-row transpose-up/transpose-down affordance on Bryn's
Perform view, calling `update_track({trackId, key})`. The propagation
infra is already there.

### 2. BUILD-MINIMAL Bryn-driven song-insert (shape C).

The build is honestly straightforward and reuses existing infrastructure:

- **UI surface:** "Live insert" button in the Perform-view header,
  visible only to roles with edit rights on the current setlist (admin /
  band_leader). Tap opens a search sheet over the library; tap-song
  shows confirm with "Insert before current row" / "Replace current row"
  / "Append at end"; tap-confirm commits.
- **Write path:** wraps existing `add_track_to_setlist` /
  `update_track` (for the swap_chart-style replace) — no new MCP tool
  needed, just an in-app UI affordance over existing HTTP endpoints.
- **Propagation:** existing Firestore→Dexie→useLiveQuery pipe (works
  today, used by every Perform iPad already).
- **Auth gate:** existing band_leader/admin role check. Bryn would need
  one of those roles; if she's currently `musician` only, that's a
  one-line role grant on her uid.
- **(b) failure mode:** **not applicable** — new song = new fileId = new
  chart bytes. Every iPad pulls the new chart fresh on the version bump.
- **(d) failure mode:** **mitigated by the confirm-step** — Bryn picks
  the song, sees "Insert 'Hashkivenu' before current row," taps confirm.
  Wrong-row is hard to reach.
- **(e) failure mode:** **mitigated by the KeepAwakeToggle** already
  shipped at 559c6c84d. (Recommend a follow-up: Bryn's iPad should
  default-on KeepAwakeToggle automatically when she enters Perform view
  — but that's a separate lane.)

**Build size estimate:** ~200-300 LOC + tests. One coder, one lane.

---

## Open follow-up questions for Daniel (post-DISCUSSION)

These don't gate the build/drop call but shape implementation if Daniel
greenlights shape C:

1. **Does Bryn currently have a `band_leader` role on her uid?** If not,
   the build's first commit is a role grant (one MCP call).
2. **For the insert default — "before current row" vs "after current
   row"?** When Daniel says "let's do Hashkivenu," does that usually mean
   "now, before what's currently up" or "next, after the current piece"?
   Default-position affects UX feel.
3. **Replace-current-row option in v1, or v2?** Build-minimal could ship
   "insert" only, leaving "replace current row" for a follow-up. Simpler
   build, narrower test surface. Or ship both in v1.
4. **Search ergonomics on Bryn's iPad** — full library search-as-you-type,
   or recent-songs first? The library has 568 rows; type-ahead is the
   normal pattern, but for live-service speed, a "recent 20 songs" tab
   might be faster.
5. **iPad real-estate** — where does the button live without crowding the
   Perform-view header? Already there: back link, title, transpose,
   KeepAwakeToggle, SaveOfflineButton, print modal trigger. One more
   button is doable but the header is filling up.

---

---

## ADDENDUM (2026-05-23T21:15Z) — iPads were in incognito today; shared-account operational fix

**Surface:** Daniel mentioned post-SHIP: "today the iPads weren't signed in
to a Google account; they were on incognito. Though I guess I could sign
them all into the same account as another solution — `crcmusic@centralreform.org`."

This is load-bearing and changes the picture.

### What incognito-mode iPads break

1. **No Dexie persistence across page reloads / wake-from-sleep.** Every
   wake = full re-hydrate from Firestore. Slow on weak WiFi; risks the
   (e) failure mode Daniel called out.
2. **No authed Firebase session.** Perform view falls back to the
   public-read path (charts are public per [[feedback_setlist_public_policy]],
   so this currently works). But:
3. **Authed Firestore listeners would be more reliable than the public-read
   fallback** for the realtime tracks subscription — fewer edge cases on
   token refresh, no public-access-rule throttles, snapshot-listener-into-
   Dexie path runs as designed.
4. **No path to WRITE from those iPads.** Even if we build shape C (Bryn-
   driven insert), Bryn's incognito iPad can't authenticate the write.
   The build is dead-on-arrival on incognito iPads.

### Why the shared-account fix actually slots in cleanly

Sign every band-iPad into `crcmusic@centralreform.org`, keep it signed in
permanently:

- **Dexie persistence is restored** → wake-from-sleep keeps state. (e)
  fragility drops materially.
- **Authed realtime listeners work** → tracks subscription runs with
  fewer edge cases.
- **The shared account can hold `band_leader` role** → every iPad
  becomes capable of authoring. The Bryn build becomes feasible to
  ship.
- **No per-iPad sign-in friction** → no one needs to remember
  credentials. Daniel sets it up once; the iPads stay signed in.
- **2FA on the Google account** caps the risk of credential leak;
  device-keychain holds the session.

### Tradeoffs of shared-account approach

- **Per-iPad authorship attribution is lost.** Every write attributes
  to `crcmusic@centralreform.org`. For liturgical-music live workflow,
  that's almost certainly fine — there isn't a need to know which iPad
  inserted Hashkivenu.
- **If creds leak, every iPad is potentially compromised.** Mitigation:
  2FA on the Google account, store credentials only in band-iPad
  keychains.
- **The "live insert" button would show on EVERY iPad** (all share the
  same role). Mitigation options:
  - Per-device opt-in via localStorage flag — Bryn's iPad has it on;
    other iPads off.
  - Long-press / two-tap gesture to reveal — prevents accidental taps.
  - Show on all iPads, accept that other musicians might tap (they're
    not, in practice; nobody's looking at the perform header during a
    song).

### Updated recommendation

1. **Sign all iPads into `crcmusic@centralreform.org`.** This is a pure
   ops change (no code), Daniel-actionable today, and is a prerequisite
   for the Bryn build to work AND a standalone improvement on its own
   (better wake/sleep, faster cold-fetch, authed listeners). Recommend
   regardless of whether shape C ships.
2. **Drop verdict on key-change propagation unchanged.** The auth fix
   doesn't help the PDF-graphics-can't-render-in-new-key problem. Still
   a DROP until MusicXML migration.
3. **Build verdict on song-swap (shape C) gets STRONGER.** Shared-account
   gives every iPad write-capability; the "Bryn taps her iPad" workflow
   becomes a "anyone-but-mostly-Bryn taps an iPad" workflow. Per-device
   opt-in keeps the button surface narrow.

### New decision item for Daniel

| Question | Recommended | Easy answer |
|---|---|---|
| Sign all band-iPads into `crcmusic@centralreform.org` shared account? | Yes — restores Dexie persistence + authed listeners + write-capability + zero code change. Single ops afternoon. | **yes share account** / keep incognito / discuss |

---

## ADDENDUM 2 (2026-05-23T21:25Z) — Daniel-ratified UX shape: long-press gesture on chart/row

**Daniel's call (verbatim):** *"I love the idea that bryn (or anyone who
is bandleader or admin) can long-press the chart they are looking at in
perform (from within the chart or setlist) and quickly change the chart
and key to something different."*

This ratifies the **BUILD** path (shape C+) with a specific UX shape.

### The chosen UX

- **Auth gate:** `band_leader` OR `admin` role only. Folds cleanly into
  the shared-account approach (Addendum 1) — the shared
  `crcmusic@centralreform.org` account holds one of those roles; gesture
  becomes available on every band-iPad.
- **Trigger:** long-press (~500ms hold).
- **Surface (dual entry-point):**
  1. **From the chart you're looking at** — long-press on the
     `PDFOverlay` chart surface while a song is open in Perform mode.
  2. **From the setlist row** — long-press on a track row in the setlist
     view (the `SetlistDrawer` queue row + `SetlistView` row +
     `MobileRowCard` are candidate hosts; build lane picks the canonical
     entry-point).
- **The menu that opens:** modal/sheet with two actions on the target
  track:
  1. **Swap chart** — pick a different chart from the library. Default
     filter to "other arrangements of this song" (filter by song-stem /
     bonded songId); user can clear the filter to search the whole
     library. Tap chart → write `update_track({trackId, fileId, songId})`
     (or its HTTP equivalent). New chart loads on every iPad via the
     existing Firestore→Dexie→useLiveQuery pipe.
  2. **Change key** — text input + step-up/step-down. Writes
     `update_track({trackId, key})`. **PDF caveat applies** — see below.

### The asymmetry between "change chart" and "change key"

These two sub-actions are NOT symmetric and the build MUST handle them
differently:

- **Change chart → safe on every format.** New chart = new bytes = every
  iPad fetches and renders fresh. No (b) fragility, because the new
  chart's graphics intrinsically match its key. ✅ Ship this freely.
- **Change key (while keeping the same chart) → fragile on PDFs.** PDF
  graphics don't transpose. The label updates to "B♭" but the chart
  still draws in D. Musicians read confidently wrong — the exact (b)
  failure Daniel called a showstopper.

This means in the long-press menu, if the chart is a PDF and the user
picks "change key," the UI needs to handle this safely. Three options
for that branch (decision needed):

- **(a) Block + redirect to swap-chart.** "This chart is a PDF and can't
  re-transpose. Swap to a different chart instead?" Forces the user to
  the safe path.
- **(b) Allow with a visible warning.** "The chord chart graphics won't
  transpose, only the key label." User confirms; key writes but the
  iPad shows "PDF in B♭ — graphics still show D" badge.
- **(c) Allow silently.** Key writes; iPads show new key label over old
  PDF graphics. Musicians self-transpose mentally — same as the verbal
  status quo today.

For MusicXML / chord-text charts, "change key" is safe in all three
options because those formats can transpose.

### Confirm-step or tap-once-and-commit?

The (d) wrong-row fragility hinges on this. Two options (decision
needed):

- **Confirm-step:** long-press → menu → pick action → confirm dialog
  → commit. Two taps after the long-press. Safer; slower.
- **Tap-once-commit:** long-press → menu → pick action → immediate
  commit. One tap after the long-press. Faster; needs more careful
  authoring.

My read: tap-once-commit, because Daniel said "quickly" and Bryn is a
deliberate, named, hands-free tapper. (d) risk is low for chart-swap
because the user is picking the new chart by tapping a specific row in
the search results — there's no implicit "current chart" reference
that can be misinterpreted. (d) risk is also low for key-change
because the input is explicit (typed/stepped value).

### Implementation cost (refined)

- Long-press detector (custom React hook; ~30 LOC + handling
  iOS/WebKit touch quirks)
- Long-press handlers wired onto PDFOverlay + setlist row components
  (~60 LOC for entry-point integration)
- Modal/sheet UI with two action tabs (Swap chart / Change key) (~150 LOC)
- Library search component inside the swap-chart tab — REUSE the
  existing `/library` search components where possible (~50 LOC for
  the search integration + 50 LOC for stem-filter default)
- Key input UI (~30 LOC)
- Auth-gated activation (existing useAuth + `isBandLeader || isAdmin`
  check; ~10 LOC)
- PDF-vs-MusicXML detection for the key-change branch (~20 LOC; chart
  type is already known from `mimeType` / `fileName.endsWith('.musicxml')`)
- Write-path wiring — REUSE `update_track` HTTP route (no new MCP
  tool); ~30 LOC for the client-side fetch + optimistic UI
- Tests — vitest unit tests on the menu + long-press hook + write-path,
  Playwright e2e on the gesture flow on iPad-webkit project (~200 LOC)

**Estimate:** ~600-800 LOC including tests. Probably one coder, one
lane, ~half a day of focused work.

### New decision items for Daniel

| Question | Recommended | Easy answer |
|---|---|---|
| PDF "change key" branch behavior — block / warn / silent? | **(a) Block + redirect to swap-chart** — it's the only honest path: PDF can't render in the new key, so the only way to actually change key on a PDF chart is to swap to a different chart that's in the new key. | **block** / warn / silent |
| Confirm-step on commit, or tap-once-and-commit? | **Tap-once-commit** — Bryn is deliberate, "quickly" is the explicit goal, (d) risk is intrinsically low for these actions. | **tap once** / confirm step / discuss |
| v1 scope — both actions (swap chart + change key) or just swap chart? | **Both, with the PDF-key branch blocked per the question above.** Swap chart is the safe primary; change key is the secondary for MusicXML/text-chord arrangements. | **both v1** / swap-only v1 / discuss |
| Long-press just the chart-row/PDF, or also a "live insert" path for adding a song not in tonight's setlist? | **Defer "live insert" to v1.1** — Daniel didn't ask for it in this round; chart-swap covers the most common case. Add later if needed. | **defer insert** / include insert v1 / discuss |

---

## ADDENDUM 3 (2026-05-23T21:35Z) — SmartTransposer (AI chord-overlay) corrects the PDF-can't-transpose claim

**Daniel's call:** *"also: we have a built in key transcriber that is a
current feature of the website."*

The "key transcriber" = **SmartTransposer**
(`src/components/music/SmartTransposer.tsx` + `src/hooks/use-smart-transposer.ts`
+ `src/components/music/TransposerMenu.tsx` + the AI route at
`src/app/api/ai/chord-validate/route.ts`). It's the AI chord-overlay
system: AI detects chord positions on a PDF page; chord labels are
rendered as absolutely-positioned divs ON TOP of the PDF graphics;
those overlay labels re-render with transposed values when the
`transposition` state in `useMusicStore` changes. The underlying PDF
never changes; the overlay does.

This invalidates the "PDFs can't transpose" claim in the original
matrix. The corrected picture:

| Chart format | Can transpose? | Mechanism |
|---|---|---|
| **PDF with AI overlays** | YES (per-iPad) | SmartTransposer chord-overlay re-renders; PDF graphics stay, overlay supersedes |
| **PDF without AI overlays** | NO | musician mentally transposes |
| **MusicXML** | YES | OSMD-driven re-render |
| **Chord-text / scraped chord-chart** | YES | text-overlay transpose |

### What this changes

The (b) failure mode for centralized key-change is **no longer
guaranteed on PDFs** — it depends on whether the chart has had the AI
chord-overlay computed already. For overlay-equipped PDFs, a "now in
B♭" label is actually backed by a chord chart the musicians can read
in B♭ (the AI overlay re-renders).

**But:** there are TWO state surfaces for "key" and the build has to
hit both for the key-change to land:

1. **`tracks/{id}.key`** — the canonical "this song is being played in K"
   on the track row. Server-side. Propagates via Firestore→Dexie→
   useLiveQuery → re-renders the key badge on the setlist row, in the
   chart header, etc. `update_track({key})` writes this.
2. **`useMusicStore.transposition`** — per-iPad local delta. Each
   iPad's musician sets this through the TransposerMenu, and SmartTransposer
   re-renders chord overlays based on it.

A "long-press → change key to B♭" centrally-pushed write hits (1) but
NOT (2). So today's outcome:
- Setlist row "Lecha Dodi (B♭)" label updates everywhere ✅
- Each iPad's actual chord overlays stay in their LOCAL transposition
  ❌ until the musician taps their own TransposerMenu

That's a real gap that the build needs to close to make the key-change
sub-action of the long-press menu actually useful.

### Two ways to close the gap

- **(α) Auto-broadcast transpose state with the key write.** When
  `tracks/{id}.key` changes from C → B♭ on a song, each iPad auto-sets
  its local `useMusicStore.transposition` to the delta needed to read
  the new key. Either via a Firestore-side new field on the track, or
  via a derived value in the perform-view client (track-key minus
  musician's preferred-key gives the transpose).
  - **Pro:** "It just works." Bryn long-presses → change key → every
    iPad's chord overlays re-render to the new key in addition to the
    label. (b) failure-mode coverage is materially better on
    overlay-equipped charts.
  - **Con:** Overrides per-iPad transposition state. A musician who'd
    set "+2 semitones" for a capo'd guitar gets their preference
    silently stomped. Mitigation: per-musician transposition is layered
    ON TOP of the track-key. The `useMusicianTransposition` hook that's
    already in the tree (`src/hooks/__tests__/use-musician-transposition.test.ts`
    references its design) appears to do exactly this layering. Build
    lane investigates / reuses.
- **(β) Don't auto-broadcast.** Long-press → change key → updates the
  track-row label only. Each musician must additionally tap their
  TransposerMenu to update their local transpose. Two steps from one
  intent.
  - **Pro:** Respects per-iPad transposition state.
  - **Con:** Half-built. The whole point of the long-press is "easy and
    quick"; making each musician tap their own iPad again defeats it.

**Recommendation:** **(α) Auto-broadcast.** And the
`useMusicianTransposition` hook (already in the tree, looks like it
layers musician-preference on top of track-key) suggests this is the
intended design — the missing piece is wiring the track-key write to
trigger a re-derivation on every iPad. Build lane confirms.

### Updated decision item

| Question | Recommended | Easy answer |
|---|---|---|
| Auto-broadcast transpose state when track key changes via long-press? (α) vs leave it per-iPad (β) | **(α) Auto-broadcast** — required for the long-press → change-key gesture to actually deliver on "easy and quick." Investigate the existing `useMusicianTransposition` layering as the likely design home. | **auto-broadcast α** / per-iPad only β / discuss |

### Knock-on question

**What fraction of the band's actual setlist songs have AI chord-overlays
computed?** If most do, the key-change gesture works for most songs out
of the box. If most don't, the gesture works for chart-swap only and
the key-change branch is a near-no-op (label changes; no chord help
for the musicians). Build lane needs this number to scope the rollout.
Daniel-answerable; gates the build lane PROMPT.

---

## ADDENDUM 4 (2026-05-23T21:45Z) — Daniel reframes: it's the KEY LABEL that has to be right, not the chord graphics. This collapses the build.

**Daniel's call (verbatim):** *"it's really, really important that we
communicate to musicians what key we are actually playing in, even if
the chart is in the other key. So bryn needs to be able to change the
key quickly of an existing chart or a new chart, to reflect what we
actually are playing live. because I (rabbi with guitar and no ipad)
will often call a new key or new piece of music on the spot."*

### What this changes

I had been over-engineering toward "the AI chord overlays auto-re-render
to the new key when Bryn long-presses." Daniel says: he doesn't need
that. The chord overlays / chart graphics can keep showing whatever
they show. What MUST be right is the **displayed key label** on every
iPad — the value the band reads as "we are playing this song in K
right now." Musicians can read a chart in C and play it in B♭; what
they can't do is play in B♭ when their iPad says "C."

This invalidates Addendum 3's α/β auto-broadcast question and the
chord-overlay coverage question. Both moot. The build doesn't touch
SmartTransposer at all.

### The collapsed build spec

**Long-press gesture** (per Addendum 2, ratified Daniel) on either the
PDFOverlay surface or a setlist row → modal/sheet with two actions:

1. **Change key** — pick or type a new key. Writes `tracks/{id}.key`.
   Propagates via Firestore→Dexie→useLiveQuery to every iPad's key
   badge in the setlist row, the chart header, the queue drawer, etc.
   **No chord-overlay manipulation. No transpose auto-broadcast. Just
   the label.**
2. **Swap chart** — pick a different chart from the library, optionally
   setting the displayed key in the same action. Writes
   `tracks/{id}.fileId, songId, key?`. Propagates same way — new chart
   loads, new key label shows.

Auth gate: `band_leader` OR `admin` (folds cleanly into the shared
`crcmusic@centralreform.org` account approach from Addendum 1).
Tap-once-commit (no confirm step) — Daniel said "quickly," Bryn is
deliberate, (d) wrong-row risk is intrinsically low because the user
is picking an explicit value or explicit chart.

### Resolved decision items (no longer need Daniel input)

| Earlier question | Resolution |
|---|---|
| PDF "change key" branch — block / warn / silent? | **Silent.** Daniel doesn't care about the chart-graphics-vs-label mismatch. Label propagation is the feature. |
| Auto-broadcast transpose state (α) vs leave per-iPad (β)? | **Neither.** The build doesn't touch transpose state at all. SmartTransposer remains the per-musician local tool it is today. |
| AI chord-overlay coverage on band's songs? | **Irrelevant to this build.** Separate question if/when the band wants better overlay coverage; not gating. |
| v1 scope — swap chart only, or swap + change key? | **Both.** Both are equally simple now (each is just a write to `tracks/{id}` + Firestore propagation). |
| Confirm-step vs tap-once? | **Tap-once.** Explicit-value writes; (d) risk is intrinsically low. |

### Refined implementation cost

- Long-press detector hook (~30 LOC, iOS/WebKit touch-handling included)
- Long-press wired onto PDFOverlay + 2-3 setlist-row component hosts (~60 LOC)
- Modal/sheet with two tabs: Change key / Swap chart (~100 LOC)
- Key picker UI — list of 12 keys + sharps/flats toggle (~40 LOC)
- Library search component for the swap-chart tab — reuse `/library`
  search where possible (~70 LOC for stem-filter default + integration)
- Auth-gated activation (existing `useAuth` + `isBandLeader || isAdmin`) (~10 LOC)
- Write-path wiring — `update_track` HTTP route already exists; ~20
  LOC for the client-side fetch + optimistic UI
- Tests — vitest unit + Playwright e2e on iPad-webkit (~150 LOC)

**Refined estimate:** ~400-500 LOC including tests. One coder, half-day
of focused work. Smaller than ADDENDUM 2 estimate (which assumed
chord-overlay integration).

### One open question for Daniel before build-lane dispatch

**Does "change the key... of an existing chart or a new chart" include
the case where Bryn needs to INSERT a brand-new song row that wasn't
in tonight's setlist?** Two readings:
- **(narrow):** "new chart" = swap the current row's chart to a different
  one. Bryn modifies an existing setlist row. No row insertion. v1 covers
  this.
- **(broad):** "new chart" = a song that isn't even in tonight's setlist
  yet — Bryn needs to add a new row mid-service. This is the "live
  insert" case I sketched in shape C earlier; it's a bigger UX surface
  (where in the setlist does it go?).

If you mean (narrow), v1 ships exactly the long-press → change-key /
swap-chart spec above. If you mean (broad), v1 also adds an "Insert
new song" path with placement options (before current / after current
/ append).

| Question | Recommended | Easy answer |
|---|---|---|
| Does the build include inserting a brand-new song row that isn't in tonight's setlist? | **(broad) Include insert in v1** — Daniel explicitly said "new piece of music on the spot" which strongly suggests fresh insertion, not just swapping. Cost: another ~150 LOC. Still a half-day lane. | **broad — include insert** / narrow — swap only / discuss |

### SmartTransposer subsystem state — informational, not gating

Daniel notes: *"no one has touched the transposer in a while, and it
hasn't been stress tested in any real way."*

Captured for the build lane: **stay out of SmartTransposer / the AI
chord-overlay subsystem entirely.** The collapsed v1 build hits only
`tracks/{id}.key` (label propagation), which flows through the existing
Firestore→Dexie→useLiveQuery pipe — that pipe IS stress-tested across
the perform-view paths. SmartTransposer remains the per-musician local
tool it has been; no new dependencies on it from this build. The build
lane PROMPT should call out "do not modify SmartTransposer / use-smart-
transposer / TransposerMenu / chord-cache" as an explicit do-not-touch
zone, mirroring the existing `mcp/` / `bridge/` / `SetlistGrid.tsx`
do-not-touch convention.

If the band wants better AI chord-overlay coverage / a stress-test of
SmartTransposer, that's a separate lane (probably worth a cycle-N sweep
focused on "does the overlay actually transpose reliably on real
service charts; what's the coverage of detected chords vs missed;
what's the AI-validation/correction loop posture"). NOT load-bearing
for this live-key-swap build.

---

## RATIFIED BUILD SPEC (2026-05-23T22:00Z) — final, ready for build-lane dispatch

Daniel ratified **BROAD** scope (insert + swap chart + change key).
Compiling all ratified pieces from Addenda 1-4 into one canonical
spec:

### Surface
- **Long-press gesture** (~500ms hold) on:
  - The `PDFOverlay` chart surface (while a song is open in Perform), AND
  - A setlist row in `SetlistView` / `SetlistDrawer` / `MobileRowCard`
    (build lane picks the canonical entry-points; cover at least the
    Perform queue drawer + chart-open surface).

### Auth
- `band_leader` OR `admin` role on the calling client.
- The shared-account approach (`crcmusic@centralreform.org`, Addendum 1)
  is the deployment vehicle — Daniel signs all band-iPads into that
  account holding one of those roles. Mitigates the
  every-iPad-shows-gesture surface via:
- **Per-device opt-in via `localStorage` flag** (recommended).
  Bryn's iPad has the flag set; others don't. Daniel can toggle it
  per-device via a hidden settings affordance. Prevents accidental
  taps on musician iPads without complicating the auth model.

### Action menu (modal/sheet on long-press)
Three actions on the target row (or, for the chart-open long-press,
on the currently-viewing track row):

1. **Change key** — picker (12 keys + sharps/flats toggle) or
   step-up/step-down. Writes `tracks/{id}.key`. Pure label propagation;
   does NOT touch SmartTransposer or any transposition state.

2. **Swap chart** — library search modal (default-filter to "other
   arrangements of this song" via songId/stem; clear-filter to whole
   library; recent-songs tab worth considering). Optionally also sets
   the displayed key in the same action. Writes `tracks/{id}.fileId`,
   `songId`, optionally `key`.

3. **Insert new song** — library search modal (no song-stem filter
   by default). Placement choice: before current / after current /
   append at end. Optionally sets displayed key on the new row.
   Writes a new `tracks/{newId}` doc + adjusts `setlists/{id}` track
   list / version per existing `add_track_to_setlist` semantics.

### Behavior
- **Tap-once-commit.** No confirm dialog. The (d) wrong-row risk is
  intrinsically low for these actions because the user is picking an
  explicit value (key) or an explicit chart (search result).
- **Propagation via existing pipe** — Firestore→Dexie→useLiveQuery.
  No new subscription surface; no new MCP tool; no SmartTransposer
  touch.
- **PDF "change key" is silent** — no warning about chart-vs-label
  mismatch. Daniel's call: musicians can read a chart in C and play
  in B♭; what they need is the LABEL to be right.

### Do-not-touch zones (build lane PROMPT must call out)
- `src/components/music/SmartTransposer.tsx`
- `src/components/music/TransposerMenu.tsx`
- `src/hooks/use-smart-transposer.ts`
- `src/lib/chord-cache.ts`
- `src/app/api/ai/chord-validate/route.ts`
- Standard list: `mcp/`, `bridge/`, `SetlistGrid.tsx`,
  `src/lib/mcp/errors.ts`, `src/lib/mcp/error-envelopes.ts`

### Reuse
- `update_track` MCP/HTTP write path — change-key + swap-chart land here.
- `add_track_to_setlist` MCP/HTTP write path — insert lands here.
- `/library` search components — pull into the swap/insert search modals.
- `useAuth` + `isBandLeader || isAdmin` — auth gate.
- Firestore→Dexie→useLiveQuery sync — propagation pipe.
- `KeepAwakeToggle` (shipped at `559c6c84d`) — already addresses (e)
  wake/sleep stale UI.

### Out of scope
- SmartTransposer changes / chord-overlay re-render coordination.
- Centralized transpose-state broadcast.
- Per-musician audit trail (shared-account loses this; accepted).
- Multi-author collaboration design.
- Voice-trigger / Claude-listens.
- MusicXML migration strategy.
- AI chord-overlay coverage backfill (separate lane if desired).

### Estimated build size
~550-650 LOC + tests, single lane, ~half-day. Tier 1 (standard
feature; no security/auth/rules/data-integrity surface beyond
existing `update_track` / `add_track_to_setlist` semantics).

### Ratified decision table

| Decision | Resolution |
|---|---|
| Drop centralized key-change propagation? | **NO — build it (as label-only propagation).** Earlier "drop" verdict was based on a wrong premise (PDFs can't render in new key). Daniel reframed: label propagation IS the feature. |
| Build Bryn-driven song-insert UI (shape C)? | **YES — broad scope.** |
| v1 scope — narrow (existing-row mods only) vs broad (also insert)? | **BROAD.** "New piece of music on the spot" = fresh insertion. |
| Long-press gesture vs visible button? | **Long-press** (per Addendum 2 Daniel ratification). Hidden affordance avoids the every-iPad-has-the-button problem. |
| Auth gate? | `band_leader` OR `admin`. Shared-account `crcmusic@centralreform.org` is the deployment vehicle. |
| Sign all band-iPads into shared account? | **YES** (Addendum 1; Daniel-actionable, ops change, zero code). |
| PDF "change key" branch — block / warn / silent? | **Silent** (Addendum 4 — Daniel-reframed; label is the feature). |
| Auto-broadcast transpose state? | **No, moot** (Addendum 4 — label-only propagation makes this irrelevant; also SmartTransposer is un-stress-tested per Daniel 21:55Z). |
| Confirm-step vs tap-once-commit? | **Tap-once.** |
| Per-device opt-in for the gesture? | **Yes — `localStorage` flag.** Bryn's iPad on, others off. Daniel toggles per-device. |

### Outstanding Daniel-actionable (ops, not code)
1. Sign all band-iPads into `crcmusic@centralreform.org` (Addendum 1) — ideally before next Friday's service so wake-from-sleep / offline-perform-fix / IDB-cached PDFs work as designed in the first place.
2. Grant `band_leader` role to the shared account uid (one MCP call after sign-in).
3. (Optional) Decide which iPad is Bryn's so the build lane knows which iPad gets the per-device localStorage flag default-on.

### Ready for build-lane dispatch
Supervisor: this discussion-product is final. The build lane PROMPT
should reference this DISCUSSION.md as the source of truth and ship a
single Tier-1 lane covering all three actions (change key / swap chart
/ insert song) under the long-press gesture. Suggested lane id:
`live-director-gesture` or `band-leader-live-edit`.

---

## ADDENDUM 5 (2026-05-23T22:10Z) — auth-deployment ratified: Bryn signs into her own account; shared-account path dropped

**Daniel's call (verbatim):** *"bryns will be signed in with her account
on the ipad. that's how we'll handle that."*

This supersedes Addendum 1's shared-account proposal AND the localStorage
opt-in flag from the RATIFIED BUILD SPEC. The model is now per-musician
personal accounts:

- **Bryn's iPad** signs in as Bryn (her personal account, granted
  `band_leader` role). The gesture lights up there because the auth
  gate (`band_leader || admin`) passes.
- **Other iPads** — incognito, or signed in as other musicians (role
  `musician`), or signed in as Daniel-the-rabbi if he ever uses one.
  In any of those cases the auth gate fails and the gesture is inert.
  No localStorage flag needed.
- **Attribution is correct** — writes attribute to Bryn's uid, not a
  shared service account. Audit trail preserved.

### Updates to the RATIFIED BUILD SPEC

- **Per-device opt-in via localStorage flag → REMOVED.** Auth-role gate
  alone (`band_leader || admin`) handles per-device restriction. Simpler.
- **Shared-account deployment (`crcmusic@centralreform.org`) → DROPPED.**
  Not happening for this feature.
- **Daniel-actionable ops items, revised:**
  1. Ensure Bryn has a personal account on the system (she may already).
  2. Grant `band_leader` role to Bryn's uid (one MCP call).
  3. Sign her into that account on her iPad and keep it signed in.
- **The other-iPads incognito problem (offline persistence / Dexie /
  wake-from-sleep) is now SEPARATE** from this lane. Those iPads may
  remain incognito or get individual accounts; that's a deferred
  decision. Doesn't gate this build.

### Implementation simplification

- Build lane DROPS the localStorage opt-in flag wiring entirely.
- Build lane DROPS any hidden settings affordance for toggling the flag.
- Build lane's auth check is just `isBandLeader || isAdmin` on the
  perform-view client (already wired via `useAuth`).
- Net LOC savings: ~20-30 LOC. Build estimate revises to ~530-620 LOC.

### Final ratified deployment model

| Concern | Resolution |
|---|---|
| How does the gesture light up on Bryn's iPad only? | Bryn signs in as herself; her uid has `band_leader` role; auth gate passes only on her iPad. |
| What about the other iPads being incognito? | Out of scope for this lane; their state is whatever Daniel sets it to separately. The gesture is inert on them either way (failing auth gate). |
| Shared `crcmusic@centralreform.org` account? | Dropped. Per-musician personal accounts is the model. |
| Per-device localStorage opt-in flag? | Not needed. Auth gate does the restriction. |

---

## Out of scope (not addressed in this discussion)

- Multi-author collaboration design (Daniel is the single live director;
  Bryn is the single live tapper).
- Real-time chord-by-chord broadcasting.
- Voice-trigger / "Claude listens" path (out of scope per PROMPT; also
  fragile per the (d) wrong-row analysis).
- MusicXML migration strategy (separate strategic effort per
  [[project_musicxml_goal]]).
- Post-service reconciliation of live changes back into the canonical
  setlist (current behavior — `update_track` writes to the live setlist
  directly — is already the right shape; no reconciliation needed).

---

## Decision needed from Daniel

| Question | Recommended | Easy answer |
|---|---|---|
| Drop the key-change propagation feature? | Yes — PDF-dominant chart mix makes it fragile by your own (b) criterion. Revisit when MusicXML majority. | **drop key** / build key anyway / discuss |
| Build the Bryn-driven song-insert button? | Yes — ~200-300 LOC, reuses existing MCP write paths + propagation pipe. | **build insert** / drop both / discuss |
| If build: insert-only in v1, or insert + replace + append? | Insert + append in v1; replace as v1.1 follow-up (lower frequency, narrower scope) | **insert+append v1** / all-three v1 / insert-only v1 |
| If build: dispatch lane now, or queue behind active waves? | Queue — current cycle ships in flight; this is not load-bearing for this week's service | **queue** / dispatch now |
