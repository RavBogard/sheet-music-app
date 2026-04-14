# Wave 1 — Inconsistencies & Duplication

## Summary

Codebase is coherent at the lib/ layer (shared `roles.ts`, `firestore-helpers.ts`) but drifts at the UI and copy layer. Strongest signals: (1) two parallel `formatEventDate` implementations plus a third `formatEventDateForEmail`, all formatting the same field differently; (2) a hardcoded `INSTRUMENTS` list in `DashboardClient.tsx` diverging from the musician-profile registry in `lib/musician-profile.ts`; (3) the "required band" instrument set is duplicated verbatim in two files; (4) role-gating for the same action ("can edit / can print a setlist") uses three different predicate shapes across server page, hook, and perform page; (5) "Gig Packet" copy is inconsistent ("Print Gig Packet" vs "Gig Packet" vs "Generate Gig Packet"); (6) two `/perform/*` routes render overlapping PDF UX through the same component but one wraps in an extra `fixed inset-0 z-50` shell. No P0 security-grade role mismatch found — `isAdmin`/`isBandLeader` consistently derive from `lib/roles.ts` — but several P1 copy/type drifts will surface as weekly-workflow paper-cuts once the band onboards.

## Findings

### FIND-001 Duplicate event-date formatters (P1)
- **Category**: inconsistency (duplicated logic, drifting output)
- **Files**: `src/lib/firestore-helpers.ts:36` (`formatEventDate`), `src/components/scheduling/ScheduleCard.tsx:181` (private `formatEventDate`), `src/app/api/scheduling/remind/route.ts:137` (`formatEventDateForEmail`)
- **What's inconsistent**: Three separate formatters, each accepting `unknown`/Firestore-timestamp-ish input and returning a human string. Canonical helper exists and is tested; the other two reimplement the same Timestamp→Date normalization inline. ScheduleCard even shadows the canonical name, which blocks drop-in unification.
- **Why it matters**: The same event date is shown as "Friday, February 14" in one view and potentially different casing/format in the reminder email/schedule card. User will see the service date formatted two ways on the same day.
- **Suspected fix**: Delete both local helpers; import `formatEventDate` from `firestore-helpers`. Add an `includeTime`/`forEmail` option if the email variant truly needs a different shape.

### FIND-002 `INSTRUMENTS` list hardcoded in DashboardClient diverges from profile registry (P1)
- **Category**: hardcoded list that should be data-driven
- **Files**: `src/app/(main)/DashboardClient.tsx:30` (local `const INSTRUMENTS = [...]`, referenced twice at 312, 384), `src/lib/musician-profile.ts:70` (authoritative registry with labels + transposition), `src/hooks/__tests__/use-musician-transposition.test.ts:43` (`EXPECTED_INSTRUMENTS` — third copy)
- **What's inconsistent**: DashboardClient picks its own subset/order/labels for the instrument dropdown instead of deriving from the musician-profile registry. When someone adds `ukulele` or a B♭ instrument to the profile registry, the dashboard picker silently omits it.
- **Why it matters**: Musicians picking an instrument from the dashboard may not see instruments the backend supports, or see a stale label ("Piano" vs "Piano / Keys"). Breaks the onboarding flow invisibly.
- **Suspected fix**: Export an `ALL_INSTRUMENT_OPTIONS` array from `lib/musician-profile.ts` and consume it in DashboardClient plus tests.

### FIND-003 `REQUIRED` band instruments duplicated (P1)
- **Category**: duplicated constant
- **Files**: `src/lib/musician-suggestions.ts:40` (`REQUIRED_INSTRUMENTS`), `src/app/api/scheduling/suggest-band/route.ts:103` (`const REQUIRED = ['acoustic_guitar', 'electric_bass', 'hand_drums', 'piano', 'voice']`)
- **What's inconsistent**: The exact same 5-instrument set lives in two files. If the band composition changes (e.g., adds 'drums_full_kit'), one file will update and the other won't.
- **Why it matters**: Silent drift in "band coverage" suggestions vs scheduling API completeness check. Dashboard could say "band complete" while API says "missing voice."
- **Suspected fix**: Export `REQUIRED_INSTRUMENTS` from `musician-suggestions.ts`; import in suggest-band route.

### FIND-004 Role-gated "can edit setlist / can print" predicate shape drifts (P1)
- **Category**: role-check inconsistency
- **Files**: `src/app/(main)/setlists/[id]/page.tsx:37` (`isOwner || user.isAdmin || user.isBandLeader` — server, with `user.*` shape), `src/hooks/use-setlist-dashboard.ts:116` (`setlist.ownerId !== user?.uid && !isAdmin && !isBandLeader`), `src/app/perform/setlist/[id]/page.tsx:56` (`canPrint = isMusician || isBandLeader || isAdmin`), `src/hooks/use-setlist-performance.ts:33` (`isLeader = isAdmin || isBandLeader`)
- **What's inconsistent**: Four different ad-hoc predicates for "who can do X to a setlist." Server page destructures from `user.isAdmin` (flat ServerUser); client paths destructure from `useAuth()` top-level. No shared `canEditSetlist(user, setlist)` helper. `canPrint` in the perform page also lets `isMusician` print — but the perform route is gated elsewhere, so this is harmless today; still, the inconsistency means a policy change requires N edits.
- **Why it matters**: Not a P0 leak today (all four paths still end up at `admin | band_leader` for edit), but the next policy change (e.g., "guests can print their own parts") will be implemented in one place and forgotten in others.
- **Suspected fix**: Add `canEditSetlist(user, setlist)` / `canPrintSetlist(user, setlist)` to `lib/roles.ts` and consume everywhere. Normalize on `useAuth()`'s flat booleans.

### FIND-005 "Gig Packet" copy drift (P2)
- **Category**: copy drift
- **Files**: `src/app/perform/setlist/[id]/page.tsx:154` ("Gig Packet"), `src/components/setlist/PrintModal.tsx:367` ("Print Gig Packet"), `src/components/setlist/v2/SetlistTopBar.tsx:123,126` ("Generate Gig Packet" / "Gig Packet"), `src/components/setlist/v2/OverflowMenu.tsx:134` ("Print Gig Packet")
- **What's inconsistent**: Same action labeled 4 ways. Button text in the top bar says "Gig Packet", the overflow menu says "Print Gig Packet", the modal title says "Print Gig Packet", the tooltip says "Generate Gig Packet".
- **Why it matters**: Users can't build a verbal vocabulary ("tap Print" vs "tap Gig Packet"). Minor but violates the "bulletproof and intuitive" goal.
- **Suspected fix**: Pick one verb. Recommend "Gig Packet" as the noun label on buttons and "Print Gig Packet" only as the modal title/verbed menu item.

### FIND-006 "Setlist" vs "Service" copy & schema drift (P2)
- **Category**: copy drift (domain vocabulary)
- **Files**: domain collection is `setlists` (`src/lib/server-setlists.ts:20` et al, ~25 refs); user-facing text uses "Service" (`NextServiceCard.tsx`, `ServiceFlowCard.tsx`, `serviceNotes` field in `types/models.ts:78`), plus `templateType: 'shabbat_morning' | 'friday_night' | ...` but no corresponding label table.
- **What's inconsistent**: The data model calls it a setlist; the home screen calls it "Next Service"; the notes field is `serviceNotes`; the picker chooses a `templateType` of `shabbat_morning`. Three concepts (setlist, service, template) for one thing.
- **Why it matters**: Makes documentation and onboarding confusing ("where do I edit the service?" → "click Setlists"). Data model is fine; UI naming needs a policy.
- **Suspected fix**: UI vocabulary doc. Keep `setlists` collection for backward compat; decide whether users see "Setlist" or "Service" and sweep. Add a `TEMPLATE_LABELS` map in `lib/liturgical-templates.ts` so `shabbat_morning` → "Shabbat Morning" is single-sourced.

### FIND-007 Two `/perform` routes mount `PDFOverlay` differently (P2)
- **Category**: route/component duplication
- **Files**: `src/app/perform/[fileId]/page.tsx:52` (wraps in `<div className="fixed inset-0 z-50 bg-background">`), `src/app/perform/setlist/[id]/page.tsx:208` (renders `PDFOverlay` directly; PDFOverlay itself already does `fixed inset-0 z-50 bg-background` at `PDFOverlay.tsx:185`)
- **What's inconsistent**: `/perform/[fileId]` double-wraps the overlay (parent div + overlay's own fixed layer). Means z-stacking differs by one layer between the two routes, and any future `z-[60]` sibling (see PDFOverlay:206) may render correctly in one route and be occluded in the other.
- **Why it matters**: Subtle visual-layering bugs that only surface in one of the two perform entrypoints.
- **Suspected fix**: Drop the outer wrapper in `[fileId]/page.tsx`; let `PDFOverlay` own its stacking.

### FIND-008 Z-index soup — no shared scale (P2)
- **Category**: hardcoded values / inconsistent tokens
- **Files**: `src/components/ui/dialog.tsx:24` (`z-50`), `src/components/ui/sheet.tsx:24,34` (`z-50`), `src/components/performance/PDFOverlay.tsx:185,206` (`z-50`, `z-[60]`), `src/components/nav/MobileTabBar.tsx:135` (`z-50`), `src/components/nav/DesktopHeader.tsx:97,156` (`z-50`), `src/components/setlist/ChatPanel.tsx:417,423` (`z-40`, `z-50`), `src/components/performance/RehearsalToolbar.tsx:220` (`z-40`), `src/components/music/SmartTransposer.tsx:159` (uses `var(--z-popover)` / `var(--z-splash)` — the only one using tokens).
- **What's inconsistent**: 95% of the app uses raw `z-50`; one file uses CSS custom-property tokens. Modals, the mobile nav, the desktop header, the PDFOverlay, and the chat panel all share `z-50` so none of them reliably stack over each other.
- **Why it matters**: Open a dialog while the mobile tab bar is up → undefined which wins. Rehearsal toolbar at `z-40` sits behind `z-50` backdrop — likely intentional but not documented.
- **Suspected fix**: Promote the `--z-*` tokens used in `SmartTransposer` to a real scale (`--z-nav`, `--z-modal`, `--z-overlay`, `--z-toast`) in `globals.css` and sweep call sites.

### FIND-009 Hex colors scattered in email + login + icon files (P2)
- **Category**: hardcoded values vs design tokens
- **Files**: `src/lib/email.ts` (41 occurrences), `src/lib/email-scheduling.ts` (28), `src/app/login/page.tsx` (4), `src/app/opengraph-image.tsx` (11), `src/app/globals.css` (6 — may be tokens)
- **What's inconsistent**: Email templates and OG images use raw hex. Acceptable for email (no CSS vars), but `login/page.tsx` and `congregation-store.ts:1` are inside the React app where OKLCH tokens exist.
- **Why it matters**: Dark mode / theme tweaks won't propagate to login and congregation store fallbacks.
- **Suspected fix**: For email: define a `THEME_HEX` table in `lib/email.ts` and stop inlining. For login page: switch to Tailwind theme colors.

### FIND-010 `SetlistDrawer` and `SetlistView` both render setlist rows (P2)
- **Category**: near-duplicate component
- **Files**: `src/components/performance/SetlistDrawer.tsx`, `src/components/performance/SetlistView.tsx`, plus `src/components/performance/SetlistRow.tsx` (shared row), `src/components/setlist/SetlistCards.tsx`, `src/components/setlist/SetlistDashboard.tsx`
- **What's inconsistent**: SetlistDrawer and SetlistView appear to render overlapping sets of rows/flows. Unclear which is canonical during performance. Comment at `perform/setlist/[id]/page.tsx:10` says "PDFOverlay renders on top when a song is tapped — setlist stays mounted" implying SetlistView is canonical; but SetlistDrawer still exists.
- **Why it matters**: Bug fixes to row rendering need to be applied twice or drift.
- **Suspected fix**: Confirm SetlistDrawer is dead / legacy; delete or document role split.

### FIND-011 `user.isAdmin` (flat) vs `ctx.auth.isAdmin` (nested) (P2)
- **Category**: mismatched types across layers
- **Files**: `src/app/(main)/setlists/[id]/page.tsx:37` (`user.isAdmin`), `src/app/api/chat/route.ts:203` (`ctx.auth!.isAdmin`), `src/app/api/library/upload/route.ts:49` (`ctx.auth.isAdmin`), `src/hooks/use-setlist-performance.ts:31` (`const { isAdmin } = useAuth()`)
- **What's inconsistent**: Server components get a flat `ServerUser` with `.isAdmin`; API routes get a `ctx.auth` wrapper; client hooks get flat `useAuth()`. Three shapes for the same boolean.
- **Why it matters**: Makes shared helpers (see FIND-004) harder to write; contributor has to remember which shape applies.
- **Suspected fix**: Standardize on a `RoleClaims` interface and have `ServerUser`, `ctx.auth`, and `useAuth()` each expose it at the same key.

## Uncertainties (for Wave 2)

- Whether `SetlistDrawer` is actively routed to anywhere or is dead code (grep shows imports but not the mount path).
- Whether `PrintModal` and `PublishDialog` overlap in purpose (both live in `components/setlist/`).
- Whether `components/setlist/modals/NamePrompt.tsx` duplicates a flow handled inside `CreationWizard.tsx` (both touch setlist naming + date).
- Whether `liturgical-templates.ts` already exports a template-label map that the UI is ignoring — worth a read to confirm FIND-006's suggested fix isn't already half-done.
- Whether `SetlistMatrixView` (v2) and `SetlistDashboard` are two views of the same data — both reference the `setlists` collection; could be unified under a view-mode prop.
- Toast styling (`toast.error`/`toast.success` vs inline `SwapChangeToast`) — did not deep-dive; Wave 2 candidate for UX consistency audit.
