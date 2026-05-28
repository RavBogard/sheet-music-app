# Cycle-10 Cowork — Instance 1: Real-usability iPad sweep (PRIMARY)

> **Drafted 2026-05-28 against deployed surface at origin/master `3155fb2881`** — every route +
> component + spec + flag below verified via `git ls-tree` / `git cat-file -p` / direct worktree
> read per `[[feedback_cowork_prompt_verify_before_write]]`. Read `cycle-10-cowork-PARENT.md` ONCE
> first (north-star, auth/META-003 policy, harness map, severity calibration, ship policy).
>
> **Verify-before-write checklist applied:** (1) all 17 harness e2e specs confirmed present in
> `e2e/` ✓ (2) `ipad-webkit`+`ipad-webkit-landscape` projects confirmed `playwright.config.ts:37,44`
> ✓ (3) Perform components (`PerformanceToolbar`, `KeepAwakeToggle`, `SmartScoreViewer`,
> `resolveViewerKind`, `PublicSetlistListing`, `public-setlist-order`) confirmed on disk ✓
> (4) gig-packet print routes confirmed `src/app/api/setlist/print/**` ✓ (5) coder-1
> `perform-public-auth-and-cap` confirmed NOT merged (branch only) → PENDING ✓ (6) admin-test-session
> secret gate confirmed `route.ts:80` + `env.mjs:72/118` ✓

---

## You are cowork-Claude (cycle-10, instance 1)

Single-thread cowork-Claude session, **~75 minutes real wall-clock** (per
`[[feedback_cowork_real_harness]]` — NOT a walk-away; CFC + chrome.debugger DOES NOT WORK). Your
job is a **real-usability, iPad-first sweep** of the deployed consumer surface at
`https://www.centralreform.live`. You are answering Daniel's question: **"how do users ACTUALLY
interact with this; what breaks in real use; iPad 11" 820×1180 WebKit first."**

You are NOT just checking spec pass/fail — you are grading **real-user friction**: tap-target
failures, layout breakage at iPad viewport, confusing affordances, unclear state mid-song. The band
holds **6× standard 11" iPads** Saturday (`[[project_band_ipad_hardware]]`); Perform mode must be
bulletproof there.

**Your two layers (PARENT §0):**
1. **Deterministic iPad load** — drive `npm run stress` (the in-sandbox Playwright `ipad-webkit`
   harness) across the usability categories; triage the emitted REPORT.
2. **Qualitative judgment pass** — your own eyes on the **PUBLIC `/perform` surface** (no auth
   needed — the cleanest target given META-003) + the harness-documented gaps (Cat-G ergonomics,
   Cat-N monitor UI) + the §4 named verification targets.

### Setup

1. **Base URL:** `https://www.centralreform.live`
2. **Auth (PARENT §2):** the **public `/perform` landing needs NO auth** — that's your core
   judgment target. For authed Perform paths: the harness's authed specs read an admin bearer as
   `MCP_BEARER` (Daniel pastes it at start, sourced via `node scripts/supervisor-prod-bearer.mjs`)
   and self-skip without it. A cowork-Claude *authed* pass requires Daniel to have set
   `MCP_ADMIN_TEST_SESSION_SECRET` in prod (the `/api/auth/admin-test-session` escape hatch); if it's
   unset, stay on the public surface and note "authed pass degraded — secret unset" in the HANDOFF.
   **Never write a raw bearer/secret into any file under `sheet-music-app/`** — redact as
   `***redacted***`.
3. **uidPrefix:** `c10i1` for any test account you mint. ★ Create-side param `uidPrefix`,
   cleanup-side param `prefix` (same value). NEVER `cleanup_all_test_data` without `prefix`.
4. **Boot pre-flight (HARD-BLOCK → BLOCKER supervisor + stop):**
   - `npm run stress -- --dry-run` → the plan resolves (`ipad-webkit` + `ipad-webkit-landscape`
     projects, the usability categories).
   - `GET /perform` → 200, paints the `PublicSetlistListing` skeleton then a card list.
   - `cycle-4/harness/out/` is writable.

### Out of scope (hard boundaries)

- ⛔ **No source modification, no worktree, no branch, no commit, no ship.** Observe/report only.
- ⛔ **OBSERVE/REPORT-ONLY pre-service** (PARENT §7.1) — you produce a findings report; you do NOT
  fix. Saturday 2026-05-30 is the B'nei Mitzvah; no risky ships before it.
- ⛔ **No live X32 monitor writes.** Cat-N (monitor UI) is **visual/affordance shape ONLY** — render
  + legibility, never push a fader. Monitors are **wedges**, not IEM (`[[feedback_terminology]]`).
- ⛔ **No destructive writes against real setlists/library.** Any fixture goes through `c10i1`-prefix
  + cleaned up; never `publish_setlist` to real recipients.
- ⛔ **F-002 lyric-search is DROPPED** (feature removed `3155fb2881`). Do not probe it.
- ⛔ **Do not probe** `bridge/**`, repo-root `mcp/`, `SetlistGrid.tsx`.

---

## Part 1 — Deterministic iPad load via the harness (~25 min)

Run the iPad stress matrix and triage the REPORT. This is the spec-pass/fail + FINDING-annotation
layer (PARENT §3).

```bash
# usability-focused categories on both iPad orientations
npm run stress -- \
  --projects=ipad-webkit,ipad-webkit-landscape \
  --categories=A,B,C,D,E,H,J,K,L,S \
  --bearer="<admin bearer if Daniel pasted one; omit to let authed specs self-skip>" \
  --run-id=c10i1-ipad
```

- This drives the existing iPad specs: cold-start (`perform-ipad`), Perform + bonded-render
  (`perform-ipad-deep`, `perform-ipad-real-setlists`, `perform-flow`, `ipad-stuck-spinner-probe`),
  live-director gesture (`live-director-gesture`), library (`library-ipad`, `library-review-flow`),
  setlist-edit + chart-bind + gig-packet (`chart-bind-ipad`, `chart-bind-picker`, `gig-packet-print`,
  `f023-live-rename`), offline (`perform-ipad-offline`, `r1-offline-decisive`,
  `perform-ipad-pwa-fresh-install`), axe (`axe-stress`), QR onboarding (`onboarding-qr-ipad`),
  large-setlist (`stress-ipad`), smoke (`smoke`).
- **Copy `cycle-4/harness/out/REPORT-stress-c10i1-ipad.md`** into your artifacts dir.
- Every failed/timed-out test + every `FINDING`-annotated pass becomes a finding. Fold them into
  your scorecard. A clean pass = a probe executed, not a finding.
- **(If `--categories=F` / authoring is wanted)** it needs a bearer + the `STRESS-TEST-*` scratch
  flow; it's not core to the consumer-usability question — run it only if the bearer is present and
  time allows.

---

## Part 2 — Qualitative judgment pass on the PUBLIC `/perform` surface (~25 min)

This is the layer the harness can't score. Open the real deployed surface at iPad viewport
(820×1180, WebKit) and use it like a band member would. **No auth needed.** For each area below,
grade **PASS / FRICTION / BROKEN** and capture a screenshot for any non-PASS.

1. **Public `/perform` landing** (`src/app/perform/page.tsx` → `PublicSetlistListing`;
   `public-setlist-order.ts` `splitPublicSetlists` orders upcoming soonest-first, then past):
   - Is the **upcoming service obvious and above the fold** on an 820×1180 portrait screen? (e.g.
     tonight's Kabbalat Shabbat above tomorrow's — `splitPublicSetlists` already orders this;
     confirm it *reads* that way, not just that the data is sorted.)
   - **Skeleton → content with NO layout shift (CLS)?** The page is edge-cached and SSRs a
     card-shaped skeleton (intentional, Daniel-ratified 2026-05-18); confirm the hydration swap is
     seamless.
   - **Tap target on each setlist card ≥44×44px?** Easy to tap the right service without mis-hitting
     a neighbor?
   - **Empty-state legible** if no upcoming services?
2. **Perform mode** — tap into a public setlist's perform view (`/perform/setlist/<id>`):
   - Does the **first chart load on first tap** (no stuck spinner — the `ipad-stuck-spinner-probe`
     class of bug)?
   - **Toolbar legibility + state** (`PerformanceToolbar.tsx`: TransposerMenu / MetronomeControl /
     Zoom / Printer / AI): is the transpose state clear enough that a player won't play the wrong
     key? Is the metronome obviously on/off? Zoom controls reachable?
   - **Annotation** (the full toolbar's annotate affordance, `PDFOverlay.tsx:71`): usable with a
     finger? Does it survive a page turn?
   - **Wake-lock** (`KeepAwakeToggle.tsx` + `use-wake-lock.ts`): is the keep-awake toggle
     discoverable? (The band needs the screen to stay on through a service.)
   - **Page-turn / navigation gesture** (`live-director-gesture`): reliable, no accidental triggers?
3. **MusicXML render + transpose** (`SmartScoreViewer.tsx`, `resolveViewerKind.ts`,
   `TransposerMenu`): if a setlist has a MusicXML chart (the STRATEGIC format,
   `[[project_musicxml_goal]]`), does it **render legibly on iPad** and **transpose cleanly** (key
   change reflows, no clipping)? Is there a PDF-only fallback silently masking a broken MusicXML
   render?
4. **Gig-packet print** (`src/app/api/setlist/print/{public,personal,prepare}/route.ts`): from iPad
   Safari, is the print output usable + layout intact?

---

## Part 3 — Gap-coverage rim + named verification targets (~20 min)

### Cat-G — iPad touch-target ergonomics (PARENT §5)
Audit the Perform + landing surfaces for: tap-target sizes (≥44×44px Apple HIG floor), thumb-reach
zones (controls reachable in a two-handed iPad grip), spacing between adjacent controls (mis-tap
risk), and gesture conflicts (page-turn vs annotation vs scroll). Report friction **even where the
harness spec passes** — this is the judgment the spec can't make.

### Cat-N — monitor surface UI-shape (PARENT §5)
**Visual/affordance shape ONLY — no X32 writes.** Open `/monitor`: does the panel render on iPad?
Are fader strips + bus-assignment affordances legible? Is the bus5 master-mute survivor state
visually coherent? (Auth-gated — needs a band member with monitor access; if you can't authenticate,
mark N-A and note it.)

### Sign-in flows (Cat-K)
- **QR scan-with-phone** (`src/components/auth/QRSignIn.tsx`, `/api/auth/qr/route.ts`): walk the QR
  onboarding end-to-end on a touch device — scan, approve, land authed. Friction-free for a band
  member onboarding a fresh iPad?
- **Google sign-in** (`LoginClient.tsx`): completes cleanly on iPad Safari?

### ★ Named target — coder-1 `perform-public-auth-and-cap` `[LANDED at 6e043a4ce5]`
This lane is **LIVE on master** (landed while this PROMPT was authored). `PublicSetlistListing.tsx`
now imports `QRSignIn`, pins a logged-out Sign-In card (QR + Google) to the top, caps the listing at
`MAX_PUBLIC_SERVICES = 5` (`upcoming.slice(0,5)` + past fills remainder, upcoming-first), and gates
on `useAuth()` **client-side** with a `!authLoading` CLS guard. **Exercise it hard on iPad — it's a
PRIMARY target:**
- **logged-out** (`/perform` with no session): the **QR + Sign-In card** is pinned top, obvious, QR
  scannable with a phone; **authed** (signed-in band member): card gone, just the listing.
- **≤5 rows total**, upcoming service(s) first.
- **no CLS**: watch the auth resolve — the card must NOT flash then yank (the `!authLoading` guard).
  Grade this carefully; a flash-yank on a cold iPad load is a HIGH usability finding.
- **edge cache intact**: SSR skeleton paints identically for authed + unauth (page still avoids
  `cookies()`).
(Re-confirm the SHA at run time with `git log -1 origin/master`; note any later delta to the cap/card.)

---

## Cleanup (end-of-run, ~5 min) — MANDATORY before HANDOFF-COMPLETE

If you minted any test account / fixture:
```
1. delete_chart / delete_setlist({force:true}) for any fixture you created
2. cleanup_all_test_data({prefix:"c10i1"})   // ← prefix, NOT uidPrefix
3. Verify zero residual: list_test_accounts() → none matching c10i1; search_library({query:"c10i1"}) → empty
```
(If your run was purely read-only on the public surface, note "read-only, no fixtures" and skip.) If
prefix-scoped cleanup partially fails, list orphans under "Manual cleanup needed"; Daniel sweeps.

---

## Report format

Write to `.paul/research/cycle-10-cowork-instance-1-HANDOFF.md`. **Lead with the usability
scorecard**, then findings.

```markdown
# Cycle-10 Cowork Instance-1 HANDOFF — Real-usability iPad sweep

**Run date:** 2026-05-2?T<hh:mm>Z
**Viewport:** 820×1180 portrait (ipad-webkit) + 1180×820 landscape
**Auth:** public-surface (no auth) [+ authed via admin-test-session if secret set]
**Master SHA at run:** <git log / deployed probe>
**Harness REPORT:** cycle-10-cowork-instance-1-artifacts/REPORT-stress-c10i1-ipad.md
**Cleanup state:** [read-only / clean / partial — list orphans]

## Usability verdict: [CLEAN / N-FRICTION / N-BROKEN]

| Area | Verdict | Evidence (screenshot / spec / repro) |
|------|---------|--------------------------------------|
| Public /perform landing | PASS/FRICTION/BROKEN/N-A | … |
| Perform mode (load + toolbar + annotate + wake-lock + gesture) | … | … |
| Chart bind picker | … | … |
| MusicXML render + transpose | … | … |
| Gig-packet print | … | … |
| Offline behavior | … | … |
| Sign-in (QR + Google) | … | … |
| a11y (axe) | … | … |
| Cat-G touch-target ergonomics | … | … |
| Cat-N monitor UI-shape | … | … |
| perform-public-auth-and-cap [PENDING] | LANDED+verified / N-A | … |

## Summary
- Harness: <p> passed / <f> failed / <s> skipped (categories A,B,C,D,E,H,J,K,L,S)
- Findings: <n> (BLOCKER:<n> / HIGH:<n> / MED:<n> / LOW:<n> / INFO:<n>)
- Screenshots captured: <n>

## Findings   (only FRICTION/BROKEN areas + genuine new issues)
### C10I1-001 — <title>
- **Surface:** <route / component / spec>
- **Severity:** BLOCKER|HIGH|MED|LOW|INFO   (usability calibration — PARENT §6)
- **Viewport:** 820×1180 portrait | landscape
- **Repro:** <exact steps a band member would take>
- **Expected (usable):** <what a friction-free experience looks like>
- **Actual:** <what happened; attach screenshot path>
- **Hypothesis:** <suspected source location, or "unclear">
- **Ship-class:** SAFE-NOW (trivial copy/contrast) | HOLD-POST-SERVICE (touches render/data/auth)

## Repros / screenshots
(reference cycle-10-cowork-instance-1-artifacts/<file>.png per finding)

## Manual cleanup needed   (only if a fixture was created-but-not-deleted)
```

Finally: ACK + HANDOFF-COMPLETE to `.coord/inbox/supervisor.md` signed
`from cycle-10-cowork-instance-1`, citing the usability verdict + findings count + load-bearing IDs.
**Tag each finding's ship-class** so the supervisor knows what can ship safe-now vs what HOLDs until
post-service (PARENT §7.1).

Go.
