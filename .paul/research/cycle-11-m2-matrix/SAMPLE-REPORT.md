# Cycle-11 M2 Matrix — SAMPLE REPORT (fictional finished run)

> This is what a finished M2 cowork run's HANDOFF would look like. ~1 page, illustrative — every cell verdict + finding here is invented for the purpose of letting Daniel evaluate the methodology shape.

**Run date:** 2026-05-30T09:14Z (fictional)
**Master SHA at run:** `<sha>` (re-confirmed against `git log -1 origin/master`)
**Viewport:** 820×1180 portrait (`ipad-webkit`) + 1180×820 landscape
**Identities minted:** band_leader `c11m2-bl-…`, musician-A `c11m2-mA-…`, musician-B `c11m2-mB-…`, member `c11m2-mb-…`, admin (via admin-test-session, secret was set)
**Fixture setlist:** `c11m2-matrix-fixture` — 6 tracks
**Cleanup state:** ✅ verified empty (`cleanup_all_test_data({prefix:"c11m2"})` zero residual)
**Cells traversed:** 67 / 70 core; 3 deferred (M.S.A9.D2/D3/D5 — board off, monitor writes skipped per Tier-2 rule)

## Matrix verdict at a glance

| Class | Cells | ✓ pass | △ partial | ✗ divergence | ⊘ skip |
|-------|-------|--------|-----------|----------------|--------|
| S (Stickiness) | 27 (of 30 core; 3 skipped monitor) | 16 | 4 | 7 | 0 |
| FT (Fresh-tablet) | 20 | 14 | 2 | 4 | 0 |
| AD (Auth-divergence) | 20 | 15 | 2 | 3 | 0 |
| **Total** | **67** | **45** | **8** | **14** | **3** |

## Colored matrix (excerpt, full table in `cells.jsonl`)

```
Class S — Stickiness (27 cells; ✗ = persistence broken)

Action ↓ \ Persistence →     D.1   D.2   D.3   D.4   D.5   D.6   D.7
A.1 transpose                  ✓    ✗    ✗    ✗    ✗    ✗    n/a
A.2 swap_chart                 ✓    ✓    ✓    ✓    ✓    ✓    ✓
A.3 reorder                    ✓    ✓    ✓    ✓    △    ✓    n/a
A.4 annotate                   ✓    ✗    ✗    n/a   ✗    ✗    n/a
A.5 update_track key           ✓    ✓    ✓    ✓    ✓    ✓    n/a
A.6 add_track                  ✓    ✓    ✓    ✓    ✓    ✓    ✓
A.8 update_setlist             ✓    ✓    ✓    ✓    △    ✓    n/a

Class FT — Fresh-tablet (20 cells; ✗ = surface broken in cold state)

Surface ↓ \ Identity →        C.1   C.6   C.7   C.8
B.1 /perform/setlist/<id>      ✓    n/a   ✗    ✗     (sw not registered → no offline fallback)
B.2 /perform landing           ✓    ✓    △    △     (sign-in card flashes momentarily)
B.5 gig-packet print (public)  ✓    ✓    ✓    ✓
B.6 /monitor                   ✓    n/a   n/a   per-leader  (visual-shape only — render OK)

Class AD — Auth-divergence (20 cells; ✗ = wrong access level)

Surface ↓ \ Identity →                              C.6   C.3   C.4   C.2   C.5
B.1 /perform/setlist/<published>                     ✓    ✓    ✓    ✓    ✓
B.1 /perform/setlist/<unpublished>                   △    ✗    ✗    ✓    ✓     (200 instead of 404 for C.6/C.3/C.4)
B.2 /perform landing                                 ✓    ✓    ✓    ✓    ✓
B.3 /dashboard editor                                ✓    ✓    ✗    ✓    ✓     (member sees edit affordances they can't use)
B.4 list_setlists                                    ✓    ✓    ✓    ✓    ✓
B.5 gig-packet print                                 ✓    ✓    ✓    ✓    ✓
B.6 /monitor                                         ✓    △    ✓    ✓    ✓     (musician sees panel but cannot interact — expected? unclear affordance)
```

## Findings (load-bearing only — divergences with clear repro)

### F-M2-001 — Transpose snaps back to bound key on ANY reload (HIGH, A2/A3)
- **Cells affected:** M.S.A1.D2, D3, D4, D5, D6 (the entire transpose × non-trivial-persistence row)
- **User-terms expected:** "I changed the key. It stays."
- **User-terms observed:** "I changed the key. As soon as I reload, the chart is back in the bound-track's catalog key."
- **Repro:** mintSession musician → /perform/setlist/<fid> → TransposerMenu +1 → reload → current-key reads catalog value
- **Hypothesis:** transpose offset held in `useMusicStore` (zustand, in-memory only); no Firestore persistence per (user, track).
- **Ship-class:** HOLD-POST-SERVICE (Firestore schema addition).
- **Severity:** HIGH. This is the structural sibling of the annotate finding below — same root.

### F-M2-002 — Annotations are ephemeral (HIGH, A2)
- **Cells affected:** M.S.A4.D2, D3, D5, D6
- **User-terms expected:** "I drew a fingering mark on the chart. It's there when I come back to this song later in the set."
- **User-terms observed:** "I drew a fingering mark. I navigated to the next chart and back. The mark is gone."
- **Repro:** mintSession musician → open PDFOverlay annotation → draw stroke → navigate to next track → navigate back → annotation absent
- **Hypothesis:** PDFOverlay annotation layer is component-local state; never persisted. (Confirmed by code-scan post-divergence: no `localStorage.setItem('annotation…')` or Firestore writes from PDFOverlay.)
- **Ship-class:** HOLD-POST-SERVICE (needs annotation-persistence design — per-user? per-chart? per-(user,chart)?).
- **Severity:** HIGH if annotations are intended to be useful between songs; MED if they're intended to be one-shot. The PROMPT-design phase doesn't decide intent — TRIAGE will.

### F-M2-008 — Unpublished setlist accessible to unauth + low-role identities (HIGH, A1/A4, AUTH-DIVERGENCE)
- **Cells affected:** M.AD.B1unpub.C6, C.3, C.4 (3 cells)
- **User-terms expected:** "An unpublished setlist 404s for anyone who isn't the leader or admin."
- **User-terms observed:** "An unpublished setlist returns 200 with full track data for unauth, musician, and member identities — only band_leader/admin should see it pre-publish."
- **Repro:** `curl -s https://www.centralreform.live/perform/setlist/<fid-unpublished>` → 200 + tracks visible in DOM
- **Hypothesis:** the public listing's `MAX_PUBLIC_SERVICES=5` cap filters the *landing*, but `/perform/setlist/<id>` direct URLs do not gate on `publishedAt`. The `splitPublicSetlists` order only hides; it doesn't authz.
- **Ship-class:** SAFE-NOW if a server-component gate exists and just isn't applied to deep links — verify. Else HOLD-POST-SERVICE for a deeper authz pass.
- **Severity:** HIGH if any draft/unpublished setlist contains sensitive notes; MED otherwise. (`[[feedback_setlist_public_policy]]` says setlist contents are public-by-design — but that's "published"; "unpublished" needs to be checked.)

### F-M2-011 — Fresh-tablet B.1 has no offline fallback (HIGH, A4, FRESH-TABLET)
- **Cells affected:** M.FT.B1.C7, M.FT.B1.C8
- **User-terms expected:** "I open the iPad for the first time this week, /perform/setlist/<id> renders the chart even with spotty wifi."
- **User-terms observed:** "Fresh-incognito + SW blocked → /perform/setlist/<id> first-paint is the skeleton; chart never loads (PDF fetch fails silently). With SW unblocked, the chart loads — but first-visit-of-week iPad has no SW yet."
- **Repro:** `browser.newContext({storageState:undefined, serviceWorkers:'block', ...devices['iPad Pro 11']})` → page.goto perform-url → wait 10s → chart slot empty
- **Hypothesis:** PWA service-worker handles offline fallback; without SW, no fallback — `perform-ipad-pwa-fresh-install.spec.ts` may already cover this; the fix is to ensure SW pre-installs on first visit + Page provides a non-SW degraded path.
- **Ship-class:** HOLD-POST-SERVICE — touches PWA/SW config. ★ Coordinate with the offline-perform-fix lane history (5/22 outage).
- **Severity:** HIGH — directly breaks A4 sanctuary-edge moment.

### F-M2-013 — `/perform` landing flash-yanks sign-in card on fresh-incognito (MED, A1/A4, FRESH-TABLET + AUTH-DIVERGENCE)
- **Cells affected:** M.FT.B2.C7, M.FT.B2.C8, M.AD.B2.C6 (overlap)
- **User-terms expected:** "First page-paint shows sign-in card right away (CLS guard intact)."
- **User-terms observed:** "On cold incognito, sign-in card renders ~150ms AFTER the listing skeleton — visible flash."
- **Repro:** new context no-storage → goto /perform → record first 500ms of paint → card appears at ~150ms
- **Hypothesis:** `!authLoading` guard in `PublicSetlistListing.tsx:35` waits for useAuth to resolve. On a cold tablet, useAuth resolves slower than the listing paint — guard correctly prevents flash-then-yank but introduces flash-then-appear.
- **Ship-class:** SAFE-NOW (CSS hint or skeleton reservation).
- **Severity:** MED — confusing but not breaking.

## WHAT-WE-LEARNED

1. **Client-state actions in Perform mode are not persistent.** Transpose (F-M2-001) and Annotate (F-M2-002) share a root: both are held in-memory only. This is a single structural class affecting ≥2 affordances, likely more (zoom level, metronome BPM, AI chord toggle — not all probed). The fix is one design decision: which Perform-mode client state should persist, at what scope (per-user-per-track), to what surface (Firestore). One ticket beats five.

2. **The matrix found a likely authz seam between LISTING and DEEP-LINK.** F-M2-008 says the cap-at-5 listing filter doesn't equal an authz gate; the direct URL still serves. This is a class-of-bug we wouldn't have seen without an unauth probe at the deep-link surface — a single-state probe can't surface it because Daniel's signed-in browser would see the same 200 and not flag it.

3. **Fresh-tablet probes confirmed offline gap remains (post-5/22).** F-M2-011 isn't novel — Daniel's 5/22 evening service had the same class of failure. The matrix's role here is **regression confirmation**: the cells re-test the property the offline-perform-fix lane was supposed to close. (Verify if `webkit-first-tap` `575bc47ae` or `offline-perform-fix` actually fixed first-visit-of-week, or only the "open chart survives drop" subset.)

4. **MCP-mediated writes are durably persistent across all reload modes.** Class S cells for A.2 (swap_chart), A.5 (update_track), A.6 (add_track), A.8 (update_setlist) all passed across D.2-D.6. This is good news: the data plane is sound. The bug class is concentrated in the **client UI state layer**, not the Firestore layer.

5. **Cross-identity stickiness is mostly clean — except for sibling-iPad reorder.** A.3 (reorder) cell M.S.A3.D5 was `△` partial — musician A reorders, musician B sees the OLD order until D.4 cross-session fires. Suspected: missing real-time onSnapshot listener on the order field, or a missing `wait_for_setlist_change` propagation. Worth a focused look.

## Recommendation for the fix wave

If Daniel picks M2 (or M2-as-hybrid), the fix wave splits cleanly into ~5 lanes:

| Lane | Findings rolled in | Tier | Pre/post Saturday |
|------|----------------------|------|-------------------|
| **perform-client-state-persistence** | F-M2-001, F-M2-002 (and probe the zoom/metronome siblings) | Tier-2 (Firestore schema change) | POST |
| **unpublished-setlist-authz** | F-M2-008 | Tier-2 (authz seam) | POST (verify SAFE-NOW first) |
| **pwa-first-visit-offline** | F-M2-011 | Tier-2 (PWA config) | POST |
| **landing-cls-skeleton** | F-M2-013 | Tier-0 (CSS) | SAFE-NOW |
| **cross-identity-reorder-propagation** | M.S.A3.D5 △ | Tier-1 (listener tightening) | POST |

(The matrix itself is the lane-decomposition tool — the rows of the table cluster naturally into structural fix scopes.)

---

*from cycle-11-m2-matrix (sample — fictional findings illustrating M2's report shape)*
