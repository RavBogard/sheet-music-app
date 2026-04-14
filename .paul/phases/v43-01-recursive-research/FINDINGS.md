# v4.3 Recursive Audit — FINDINGS

**Date:** 2026-04-14
**Method:** 6 parallel deep-audit agents (bugs, security, UX, data integrity, performance, dead code)
**Raw:** 83 findings total; this file synthesizes + deduplicates into prioritized action list.
**Goal:** Harden the app before live band onboarding; close gaps not caught by v4.2.

---

## P0 — Fix before onboarding

### S01. Chat API leaks admin user PII to LLM (prompt injection surface)
`src/app/api/chat/route.ts:203-214, 316-332`
When caller is admin/band_leader, the route fetches up to 50 users (email, UID, role) and interpolates them + the user's raw message into the Gemini prompt. Raw user text has no escape / delimiter separating user intent from system instructions. A crafted message can extract the admin context or steer ADMIN_ACTION outputs.

### S02. Bridge setup-code GET returns full FIREBASE_PRIVATE_KEY
`src/app/api/bridge/setup-code/route.ts:109-121`
Valid 10-char code redemption returns the raw service-account JSON (including `private_key`) in the response body. v4.2 P1.3 tightened entropy + rate limit but did not reduce the credential blast radius. At minimum: minted short-lived credential, credential rotation-on-use, or explicit one-time-view policy.

### S03. Drive file proxy auth bypass via browser headers
`src/app/api/drive/file/[fileId]/route.ts:68-116`
`isTrustedBrowserRequest(req)` accepts requests that present `Sec-Fetch-*` / `Referer` / `Accept` headers matching a browser. Those headers are client-controlled. An attacker with a guessed/leaked file ID can curl it with forged headers and bypass the Bearer check. Require Bearer unconditionally, or gate on a signed cookie.

### D01. Orphan data on setlist delete (assignments, notifications, history)
`src/lib/setlist-firebase.ts:156-182`
Delete path is client-side and only touches tasks. `scheduling_assignments`, notifications, and scheduling history pointing at the deleted setlist remain forever. Move delete to an Admin-SDK route that cascades; or add a Firestore scheduled cleanup.

### D02. `.passthrough()` schema bypass on track + musician writes
`src/app/api/setlist/flush/route.ts:23-30`, `src/types/schemas.ts:52,85,93,112,135,153`
Zod schemas use `.passthrough()`, letting clients inject arbitrary fields that land in Firestore. Combined with rules that only check known fields, this is schema drift by design. Switch to `.strict()` (or whitelist extras) at all API boundaries.

### D03. Denormalization race on `scheduling/assign`
`src/app/api/scheduling/assign/route.ts:192-220`
`setlist.musicians` + `assignedUids` updated via read-then-write outside a transaction. Two concurrent assignments can both read the old array, merge independently, and one write loses data. Wrap in `runTransaction` with a precondition.

### B01. Silent catch blocks on user-visible failure paths (~15 sites)
`src/hooks/use-upcoming-prep.ts:61-62` + ~14 peers
Preference saves, notification writes, transposition saves all `.catch(() => {})`. On Firestore quota/permission/network failure, users see no indication anything is wrong. Replace with `toast.error(...)` or route to logger + telemetry. Align with v4.2 P4 philosophy ("user-initiated writes must surface failure").

### B02. Alert-store Firestore listener can leak / double-subscribe
`src/lib/alert-store.ts:30-38`
Zustand singleton `init()` subscribes but never exposes unsubscribe. Second `init()` call stacks listeners. Use a module-level guard or a React-side mount owner.

### U01. Touch targets < 44px on primary perform-view actions
`src/components/performance/SetlistRow.tsx:35-50`, `src/components/nav/MobileTabBar.tsx:138`
Icon buttons render as `h-4 w-4` (play, swap) with tight padding; MobileTabBar tab row is 64/80px tall but effective target is ~36px. Musicians operating on-stage / holding an instrument need reliable WCAG-sized targets.

### U02. Mobile soft-keyboard collision on AddBar search sheet
`src/components/setlist/v2/AddBar.tsx`
Sticky `bottom-[72px]` element doesn't react to visualViewport like MobileTabBar does; on iPhone/iPad portrait the keyboard obscures the input. Reuse the `visualViewport` hide pattern.

---

## P1 — Ship this milestone

### Security
- **S04** QR session PUT lets any signed-in user mint a custom token for the session — no role check (`src/app/api/auth/qr/route.ts:176-189`). 6-char code + 5-min TTL mitigates, but the design is weak.
- **S05** Monitor-live `commands/pending` Firestore rule only validates `uid` and `createdAt`; any authenticated user can write arbitrary `command`/`parameters` shapes (`firestore.rules:253-259`). Add a schema check via rule functions.
- **S06** Library `search-content` returns results across all users' libraries with no per-user filtering (`src/app/api/library/search-content/route.ts:16-33`).

### Bugs
- **B03** Monitor-client debounce race: snapshot + disconnect can interleave so `forwardSnapshot(null)` fires after teardown (`src/lib/firestore-monitor-client.ts:122-132`, retry timer gap at `:179-181`).
- **B04** `use-setlist-logic` `loadLibraryMeta` closes over `file.id` in an async loop; tracks array may have shifted by resolution time, stamping the key onto the wrong row (`:586-594`).
- **B05** `DashboardClient` subscription unsub is gated on `setlistService` truthiness; if auth flips to null before the effect runs, no unsubscribe (`:110-122`).
- **B06** `swapTrack` transaction doesn't assert `remote.tracks` is an array — corrupted doc raises an uncaught error that aborts silently without `StaleWriteError` (`src/lib/setlist-firebase.ts:288-316`).

### Data integrity
- **D04** Missing composite index: `where('eventDate','>=',d).orderBy('eventDate','asc')` — used in `server-setlists.ts:19-24` and `scheduling-firebase.ts:103-107`, not in `firestore.indexes.json`. Firestore may serve from a slow fallback or 400 on first cold query.
- **D05** `eventDate` is handled as three different shapes across readers (ISO string, `{seconds}`, Timestamp). Unassign route (`:65-70`) misses the native Timestamp case.
- **D06** Notifications/emails use denormalized `musicianName` without re-reading the user profile — stale name after rename (`src/app/api/scheduling/unassign/route.ts:76`).
- **D07** Admin delete-user updates Firestore atomically but clears custom claims separately — TOCTOU on token refresh (`src/app/api/admin/delete-user/route.ts:30`).

### UX
- **U03** `AudioFilePicker` empty state is text-only — no CTA to open library or upload (`:90-100`).
- **U04** `SwapPicker` hard-caps at 20 items with no "show more" (`:34`). Libraries > 20 charts get silently truncated.
- **U05** `NewTrack` button renders identically regardless of `canEdit` — no disabled state (`src/components/setlist/v2/SongRow.tsx`).
- **U06** PDFOverlay Escape-to-close not bound — to re-verify vs v4.2 P3-02 summary (the agent flagged it, but P3-02 claimed it shipped; possible per-variant regression).
- **U07** Schedule page "Mine" filter button has weak focus ring on its active brand-tinted background (`src/app/(main)/schedule/page.tsx:147-158`).
- **U08** Admin icon-only buttons use `title=""` instead of `aria-label` in several rows (`PeopleSection.tsx`, `UserRow.tsx`).

### Performance
- **P01** `SongChartsLibrary` re-fetches usage on every render because its effect deps array is `[combinedItems.map(i=>i.id).join(','), user]` — a new string every render (`:182`).
- **P02** `useSafeFirestoreSync` compares `ref` by identity; callers passing inline refs cause listener re-subscribe churn (`:38-135`).
- **P03** `SetlistEditorV2`/`use-setlist-logic` runs three `.filter(...)` passes on every render for status dots (`:132-135`); pre-compute in a `useMemo`.
- **P04** `NotificationBell` recomputes `unreadCount` every render (`:36`).
- **P05** `LibraryDataSection` does two Firestore queries sequentially in one effect instead of `Promise.all` (`:76-96`).

### Dead code / consistency
- **C01** 15+ API routes use `console.error` directly; `logger` exists but is unenforced. Add an ESLint rule.
- **C02** `config/admins` vs custom-claim `role==admin` drift risk — if claim update fails silently, admin loses access until fallback kicks in (`firestore.rules:16-22`). Auditable via a simple consistency check cron.
- **C03** Role labels hard-coded in `src/app/(main)/settings/page.tsx:165` duplicate the `UserRole` type in `src/lib/roles.ts`. Promote `ROLE_LABELS` to shared constant.
- **C04** Backfill scripts (`backfill-setlist-rev.ts`, `migrate-remove-isPublic.ts`, `migrate-leader-role.js`) have all run in prod; archive to `scripts/.archive/` to avoid accidental re-runs.

---

## P2 — Polish / deferred

### Security
- **S07** `getAllowedOrigin` allows `localhost` and `*.vercel.app` in prod (`src/app/api/drive/file/[fileId]/route.ts`).
- **S08** Chat admin-context fetch (50 user docs per call) is unbounded at concurrency; cache / paginate.
- **S09** Rate-limit bucket degrades to IP on JWT decode failure; office-network users share the bucket.

### Bugs
- **B07** `useUpcomingPrep` 60s interval has no cleanup on parent remount (`:45-48`).
- **B08** `AbortController` timeout path in `syncSessionCookie` not cleared on abort (`src/lib/auth-context.tsx:20-29`).
- **B09** `useMonitorConnection` config listener leaks if `ensureConnected` races with the prior teardown (`:69`).
- **B10** `DashboardClient` `filterUpcoming` assumes `eventDate` is Timestamp; legacy string docs silently drop (`:91-96`).

### Data integrity
- **D08** `stripUndefinedDeep` doesn't validate shape — strips undefined but passes arbitrary structure to addDoc/updateDoc.
- **D09** Assignment status transitions not validated server-side (no guard against `confirmed → pending`).
- **D10** `musician_availability` rule + reads still exist even though v4.2 P5-01 dropped the indexes (rule cleanup deferred).
- **D11** Timestamp precondition comparison drops nanoseconds (millis only); sub-ms double-write risk on flush (`src/app/api/setlist/flush/route.ts:84-90`).

### UX / perf
- **U09-U15**, **P06-P12** — listed in raw per-axis outputs; deferred to a later sweep unless surfaced by band usage.

---

## Raw per-axis artifacts (for reference)

Full agent outputs preserved as:
- `axis-bugs.md` (17 findings)
- `axis-security.md` (13)
- `axis-ux.md` (15)
- `axis-data-integrity.md` (15)
- `axis-performance.md` (12)
- `axis-dead-code.md` (11)

*(Only the synthesized list above is considered canonical — raw per-axis files mirror the source notifications verbatim.)*

---

## Suggested phase split for v4.3

| Phase | Scope | Plans | Why |
|---|---|---|---|
| 1 | This audit (research) | 1 | ✓ produces FINDINGS.md |
| 2 | P0 security triage | 2-3 | S01-S03 — block before any external band sees the app |
| 3 | P0 data integrity | 2 | D01-D03 — silent data loss vectors |
| 4 | P0 bugs + UX | 2 | B01-B02, U01-U02 — perceptible onboarding friction |
| 5 | P1 security/bugs | 2-3 | S04-S06, B03-B06 |
| 6 | P1 data + UX | 2 | D04-D07, U03-U08 |
| 7 | P1 performance | 1-2 | P01-P05 — ship as one bundle |
| 8 | Dead-code / consistency sweep | 1 | C01-C04 — single low-risk PR |

Total: ~13-16 plans. Aim ~1-2 weeks of focused work before band onboarding.

---

## Gaps / known unknowns

- **iPad/iOS real-device testing** — many findings are code-level; confirm P0 UX and B03 monitor reconnection on an actual iPad with live Firestore.
- **Prod Firebase `musician_availability` indexes** — still present remotely; delete during next `firebase deploy --only firestore:indexes`.
- **Penetration test** — S01-S03 warrant at least a manual red-team on the chat + bridge + drive-file surface.

---
*Audit complete 2026-04-14. Recommend `/paul:plan` v4.3 Phase 2 (security triage) as the next action.*
