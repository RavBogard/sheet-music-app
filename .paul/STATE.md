# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-04-15)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v4.3 complete; v4.4 pending scope

## Current Position

Milestone: v4.4 Deferred Audit Sweep — Architectural Polish
Phase: 3 of 8 (Client async safety) — ✅ Complete
Plan: v44-03 shipped and unified
Status: Loop closed. Ready for Phase 4 planning.
Previous: v4.4 Phase 2 closed (DL-010 rename fan-out)
Last activity: 2026-04-15 — v44-03 UNIFY complete. 6 commits on origin/master: 52a19c2, 01fb601, 54aba81, c0aed9a, 76cd0d8, 20108f6. 1297/1297 tests green (+5). AC-1..AC-6 all satisfied.

Progress:
- v4.2: [██████████] 100% (8 of 8 phases complete)
- Phase 5: [██████████] 100% ✓

## Planned Phase 3 split (4 plans)

1. **03-01 SwapPicker polish** — empty initial query, keyboard bindings (Esc/Enter/arrows), iOS autofocus hardening. *(PLAN ready)*
2. **03-02 PDFOverlay hardening** — ErrorBoundary around PDFOverlay/PDFViewer, Esc-to-close, unify the two `/perform` route wrappers.
3. **03-03 Setlist-updated notification** — fix Firestore-rules-blocked `users` query in `notifySetlistUpdated`; musician-side "Setlist updated" toast on swap.
4. **03-04 Performance view polish** — per-chart transposition override on SetlistTrack, amber cue-note contrast, liturgical header hit area, mobile offline indicator (IDB ground truth).

## Loop Position

Current loop state:
```
PLAN ──▶ APPLY ──▶ UNIFY
  ✓        ✓        ✓     [Phase 3 complete — ready for Phase 4 PLAN]
```

## How to resume

Review `.paul/phases/03-stage-ux/03-01-PLAN.md`, load `/ui-ux-pro-max`, then run `/paul:apply .paul/phases/03-stage-ux/03-01-PLAN.md`.

## Phase order (for context)

1. ✓ Recursive research (complete, 2026-04-13)
2. ✓ Phase 1.1 — Concurrent-edit safety (complete, 2026-04-13)
3. ✓ Phase 1.2 — Offline truthiness (complete, 2026-04-13)
4. ✓ Phase 1.3 — Security hardening (complete, 2026-04-13)
5. ✓ Phase 2 — Weekly workflow polish (complete, 2026-04-13 — 4 plans: save-reliability, wizard polish, dashboard polish, editor polish)
   **▶ Next: Phase 3 — Stage UX for the band (/ui-ux-pro-max required)**
5. Phase 2 — Weekly workflow polish (expanded scope, /ui-ux-pro-max)
6. Phase 3 — Stage UX for the band (expanded, /ui-ux-pro-max)
7. Phase 4 — Editor ergonomics + noise cleanup (expanded, /ui-ux-pro-max)
8. Phase 5 — Navigation + schedule hygiene (expanded, /ui-ux-pro-max)

## Phase 1.3 scope (ready to plan)

Three small independent items from FINDINGS.md:

1. **Commit `storage.rules`** mirroring the Firestore `isMember()` gate for `library/**`; add to `firebase.json`; CI dry-run check. Currently deployed rules exist in the Firebase console only — invisible to version control. Wave 2 confirmed: `match /library/{allPaths=**}` → `read: if request.auth != null`, `write: if false`. Tightening to `isMember()` via custom claim brings Storage in line with Firestore.

2. **Bridge setup-code entropy + rate limit.** `/api/bridge/setup-code` GET returns the raw `FIREBASE_PRIVATE_KEY` to anyone presenting a valid 6-char code (~30 bits). Raise entropy to 10+ chars (50+ bits) and tighten the rate-limit tier specifically for this endpoint.

3. **Rate-limit `/api/nudge-admin` and `/api/scheduling/calendar-feed/[token]`.** Add `checkRateLimit` (pattern already used elsewhere).

Estimated effort: ~4h total.

## Accumulated context (key facts)

### v4.2 theme
Weekly-workflow friction + stage UX + noise cleanup before the band is onboarded. **No per-musician scheduling features** (blockout/availability/auto-assign all dropped). Publish-and-notify emails, MusicianPicker, and the assignment RSVP flow **do** stay.

### Required skill
`/ui-ux-pro-max` mandatory for Phases 2–5. Not needed for 1, 1.1, 1.2, 1.3 (backend / plumbing / security).

### What shipped in Phase 1.1 (Concurrent-edit safety)
- `StaleWriteError` + `updateSetlistWithVersion` helper in `src/lib/setlist-firebase.ts`
- `updateSetlist` + `swapTrack` rewired through `runTransaction` with `expectedUpdatedAt` precondition
- `use-setlist-logic` subscribes to the setlist doc; silent-merges when no pending edits; surfaces banner when stale
- `SetlistChangedBanner` with "Keep my changes" / "Take remote"
- Migration: `scripts/backfill-setlist-rev.ts` stamped 10 legacy docs on prod; idempotent
- 5 new tests
- **Two-tab smoke test still pending human verification**

### What shipped in Phase 1.2 (Offline truthiness)
- New IndexedDB blob store: `src/lib/offline-idb.ts` — putFile / getFile / hasFile / listFileIds / clearAll / totalBytes
- `use-offline.ts` rewritten to actually persist bodies and report honest outcomes (all-success / partial / all-failure toasts)
- `cache-utils` + `offline-manager` + `prefetch` all re-pointed at IDB
- `PDFOverlay` resolves URL to `URL.createObjectURL(blob)` when the file is in IDB
- Added `fake-indexeddb` to devDependencies
- Zero `caches.*` + zero `only-if-cached` callers remain in `src/`
- 13 new tests; full suite 1102/1102
- **Fresh-browser offline smoke test still pending human verification**

### What shipped in v4.1 (prior milestone, 2026-04-13)
- Removed `isPublic` from the whole app (type, schema, service signature, Firestore queries, API routes)
- One-shot migration `scripts/migrate-remove-isPublic.ts` stripped 25/26 setlists on prod; idempotent confirmed
- Regression-guard test "never writes isPublic to Firestore"
- **Production smoke test (create setlist via all 4 paths, verify cross-user visibility) still pending human verification**

### Deferred human smoke tests (running list)
1. **v4.1**: create setlists via wizard / chat / import / transfer on prod; confirm second user sees them.
2. **Phase 1.1**: open same setlist in 2 tabs, make conflicting edits, confirm banner or silent-merge behavior.
3. **Phase 1.2**: fresh incognito; no "offline ready" pills; pre-load a setlist; confirm blobs in IDB; DevTools Offline; charts render.

### Git state
Last commit: `a33af57` (Phase 1.2 summary + state)
Branch: `master` — clean working tree, pushed to `origin/master`.
Vercel auto-deploys `master` to production.

### Key repo locations
- Planning root: `sheet-music-app/.paul/`
- Current phase plans live at `.paul/phases/<NN>-<slug>/<NN>-PP-PLAN.md`
- FINDINGS.md (scope source for Phases 1.3+): `.paul/phases/01-recursive-research/FINDINGS.md`
- Research waves: `.paul/phases/01-recursive-research/WAVE-{1,2}-*.md`
- Migration scripts: `sheet-music-app/scripts/*.ts` (run with `npx tsx`)
- Firebase admin creds: `.env.local` (`FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`)

### User preferences (durable)
- Push to `origin master` (not `master:main`)
- Deploy straight to production on Vercel; no preview branches
- User works from multiple computers — pull before starting
- Must be "bulletproof and easy and intuitive" before onboarding band

## Decisions

| Decision | Phase | Impact |
|----------|-------|--------|
| 2026-04-13: Auth path for /api/setlist/flush — keepalive fetch (Bearer) over sendBeacon (no headers) | Phase 2 P01 | sendBeacon dropped; keepalive fetch sole transport for unload-flush |
| 2026-04-13: /api/setlist/flush rate-limit tier — shared `api` (60/min) | Phase 2 P01 | No new tier; flush shares user's general-api budget |
| 2026-04-14: S02 bridge-cred approach = Option A (audit-log + admin email on redemption) | v4.3 P3-01 | Fast detection over credential wrapping; accepts bridge-machine compromise as out-of-scope; Option C (IAM per-install) deferred until multi-congregation |

## Session Continuity

Last session: 2026-04-15 — Phase 3 UNIFY complete; loop closed
Stopped at: Async-safety sweep shipped — 11 AbortController sites + 3 stale-closure refs + PDFViewer retry cap (3) + 5-test regression suite. 6 commits pushed to origin/master, auto-deploying to Vercel. 1297/1297 tests green.
Next action: `/paul:plan` for Phase 4 (File-size refactor — 5 files >600 LOC).
Resume file: `.paul/phases/v44-03-client-async-safety/v44-03-SUMMARY.md`

Tonight's auth-incident commit chain (for context on resume):
- c7dff08 fix(setlists): gate subscription on authUser.uid — kept (clean fix; eliminates pre-auth false-alarm)
- 945478b hotfix(proxy): relax role-less redirect — kept (patch; supersede via Plan 09-02)
- 2fb2db6 fix(auth): post-popup token+cookie prime + window.location.replace — superseded by d3d0466
- d3d0466 fix(auth): switch to signInWithRedirect — REVERTED in 7446a08 (needs Firebase Hosting auth handler we don't have on Vercel)
- 7446a08 revert: back to signInWithPopup with original simple body — current state on prod, both admin + musician verified working

Net code state: signInWithPopup (vanilla), proxy role-redirect relaxed, setlists subscription gated on authUser.uid. Plan 09-02 will replace the proxy patch with a server-signed companion cookie.

## v4.3 Phase Progress (6 of ~10 P0 closed)
- ✓ Phase 1 (audit — 83 findings)
- 2/3 Phase 2 security triage: S01 ✓ chat prompt injection, S03 ✓ drive file proxy, S02 pending (decision needed)
- 2/3 Phase 4 data integrity: D03 ✓ assign race, D02 ✓ flush strict schemas, D01 pending
- 2/4 Phase 5 bugs+UX: B01 ✓ reportSaveError, B02 ✓ alert-store init guard, U01 pending, U02 pending
- Phases 3, 6–8 not started

## Session scoreboard (this chat session)
- 6 P0 audit findings closed: S01, S03, D03, D02, B01, B02
- 7 new lib modules: chat-prompt, drive-file-auth, scheduling-merge, save-error, flush-schema (+ 2 test-only)
- 47 new regression tests (9 chat + 12 drive + 8 merge + 4 save-error + 11 flush-schema + 3 alert-store)
- 25 commits on origin/master (all pushed; Vercel auto-deploying)
- Zero production regressions
- 1 Vercel build failure caught + hotfixed (route.ts export rule — memory saved in feedback_nextjs_route_exports.md)
Resume context:
- Phase 4 closed: 6 atomic commits (P4-01 through P4-06) + audit note (P4-07)
- Suite 1153 green; tsc clean; 1 pre-existing env-vars test failure unrelated and untouched
- All commits on origin/master, auto-deployed to Vercel prod
- Phase 5 is the only remaining v4.2 milestone phase; band onboarding gate
- Must load /ui-ux-pro-max before any Phase 5 APPLY (per SPECIAL-FLOWS.md)
- Pull before starting (user works from multiple computers)

---
*STATE.md — Updated after every significant action*
