# Project State

## Project Reference

See: .paul/PROJECT.md (updated 2026-04-04)

**Core value:** Musicians can instantly access setlists, transpose charts, and control monitor mixes — live on any device, no paper or prep needed.
**Current focus:** v4.2 — UX polish + band-onboarding hardening (band onboards ~1 month out)

## Current Position

Milestone: v4.3 Deep Audit Remediation
Phase: 2 of 8 (P0 Security Triage) — In progress
Phase: 4 of 8 (P0 Data Integrity) — In progress
Plan: 04-02 complete (D02 shipped — strict flush write-boundary schemas)
Status: Open: Phase 2 S02, Phase 4 D01, Phase 5 B02+U01+U02, Phases 3/6/7/8
Last activity: 2026-04-14 — Unified 04-02 (flush schemas .strict; 11 new tests)

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
  ✓        ✓        ✓     [05-01 closed; B01 shipped]
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

## Session Continuity

Last session: 2026-04-14 (05-01 complete)
Stopped at: B01 shipped; 1186 tests green; 3 commits pushed
Next action: `/paul:plan` for B02 (alert-store listener) or D01 (cascade delete) or U01/U02 (touch/keyboard) — user pick
Resume file: `.paul/phases/v43-05-bugs-ux/05-01-SUMMARY.md`

## v4.3 Phase Progress
- ✓ Phase 1 (audit)
- 2/3 Phase 2 security triage: S01 ✓, S03 ✓, S02 deferred (decision plan needed)
- 2/3 Phase 4 data integrity: D03 ✓, D02 ✓, D01 pending
- 1/4 Phase 5 bugs+UX: B01 ✓, B02 pending, U01 pending, U02 pending
- Phases 3, 6–8 not started

## Session scoreboard (this chat session)
- 4 P0 audit findings closed: S01, S03, D03, B01
- 6 new lib modules: chat-prompt, drive-file-auth, scheduling-merge, save-error (+ 2 helper exports)
- 33 new regression tests (9 chat + 12 drive + 8 merge + 4 save-error)
- 19 commits on origin/master (all pushed; Vercel auto-deploying)
- Zero production regressions
- 1 Vercel build failure caught + hotfixed (route.ts export rule — memory saved)
Resume context:
- Phase 4 closed: 6 atomic commits (P4-01 through P4-06) + audit note (P4-07)
- Suite 1153 green; tsc clean; 1 pre-existing env-vars test failure unrelated and untouched
- All commits on origin/master, auto-deployed to Vercel prod
- Phase 5 is the only remaining v4.2 milestone phase; band onboarding gate
- Must load /ui-ux-pro-max before any Phase 5 APPLY (per SPECIAL-FLOWS.md)
- Pull before starting (user works from multiple computers)

---
*STATE.md — Updated after every significant action*
