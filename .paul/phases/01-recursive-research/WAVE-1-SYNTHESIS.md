# Wave 1 Synthesis

**Date:** 2026-04-13
**Inputs:** WAVE-1-bugs.md, WAVE-1-missing-ui.md, WAVE-1-errors.md, WAVE-1-pain-points.md, WAVE-1-inconsistencies.md, WAVE-1-security.md

## Headline P0s (band-onboarding blockers)

Three P0s surfaced:

1. **Last-write-wins on `setlists/{id}`** (bugs FIND-001 / FIND-002).
   `updateSetlist`, `swapTrack`, and `performSave` each overwrite the entire `tracks` array. The editor hook (`use-setlist-logic`) does not subscribe to incoming Firestore changes. If two band leaders edit a setlist at the same time — or if one leader edits on laptop while their edits on iPad are still in-flight — one set of edits silently destroys the other. Onboarding a band multiplies the concurrency risk.

2. **`useOffline.downloadSetlist` counts failed fetches as "saved"** (errors P0 in WAVE-1-errors.md, cites `src/hooks/use-offline.ts:100-116`). The UI reports success and shows the "offline-ready" badge when downloads silently failed, so musicians arrive at a low-Wi-Fi sanctuary thinking they have charts cached and they don't. Directly conflicts with Phase 3's goal of stage confidence.

3. **No `storage.rules` file committed** (security SEC-001). `firebase.json` only references Firestore. Whatever's deployed in the Firebase console governs PDF + audio file access — and it's invisible to version control. Needs verification that *something* is deployed and that it's correct. If it's the default (authenticated read), OK-ish. If it's `allow read, write: if true`, we have a public upload bucket. Either way, needs to come under git.

## Cross-agent themes

- **Silent write paths are the dominant risk pattern.** Bugs agent flagged `.catch(() => {})` on Firestore writes; errors agent found ~20 silent catch blocks; `notifySetlistUpdated` swallows a Firestore rules failure silently so musicians never get "setlist updated" in-app (bugs FIND-006).

- **Keyboard/accessibility is systematically thin.** Pain-points agent noted: no Enter/Esc on SwapPicker, no Esc on PDFOverlay, no global undo/redo hotkey, iOS autoFocus missing `setTimeout(100)` hack except in one place. Missing-UI agent found ~15 icon-only buttons with `title` but no `aria-label`.

- **Hand-rolled dialogs exist alongside `AlertDialog`.** `TransferSetlistDialog` and `SetlistHistoryPanel` use `window.confirm` or custom overlays instead of the shadcn primitive, with inconsistent close / Esc / backdrop behavior. (Already partly captured by v4.2 Phase 4 "modal consolidation.")

- **"Gig Packet" / "Print" / "Share" copy drift** — shows up in both pain-points and inconsistencies reports. One label, four places.

- **Hardcoded lists that should be data-driven**: rabbi names (already captured in Phase 2), instruments (`DashboardClient.tsx:30`), band-required instruments duplicated across two files (`musician-suggestions.ts:40` and `api/scheduling/suggest-band/route.ts:103`).

- **Duplicate/overlapping code**: three `formatEventDate` implementations; four different "can edit setlist" predicates (no shared helper); `SetlistDrawer` vs `SetlistView` potential overlap; two `/perform` routes mount `PDFOverlay` with different wrapping (double `fixed inset-0 z-50`).

- **Abandoned routes**: `/settings/users` and `/settings/sound` exist on disk, linked from nothing, duplicate UI that now lives in `ManageClient.tsx`. Planning doc already marks them for deletion.

## P1s worth routing

- **Editor doesn't subscribe to Firestore for incoming edits** (bugs FIND-001 consequence) → in the short term a Phase 2 item; long-term solved with real-time collab.
- **`beforeunload` promise dropped** (bugs FIND-003) → Phase 2 (autosave trust family).
- **`useUpcomingPrep` stuck loading forever on empty result** (bugs FIND-005) → Phase 4 cleanup.
- **`notifySetlistUpdated` swallowed rules failure** (bugs FIND-006) → Phase 3 (part of "Setlist updated" toast family).
- **Orphan routes** `/settings/users` + `/settings/sound` (missing-UI P1) → Phase 5 (nav + hygiene).
- **Hand-rolled TransferSetlistDialog, SetlistHistoryPanel's `window.confirm`** → Phase 4 (modal consolidation scope expanded).
- **Hardcoded INSTRUMENTS in DashboardClient.tsx:30 + duplicated REQUIRED band list** → Phase 4 (inconsistency cleanup).
- **Three `formatEventDate` copies → one shared helper** → Phase 4.
- **Four "can edit setlist" predicates → one `canEditSetlist()` helper** → Phase 4.
- **"Gig Packet" copy unification** → Phase 2 (it lives in the weekly workflow UI).
- **Two `/perform` routes double-wrapping PDFOverlay** → Phase 3 (stage UX).
- **Missing ErrorBoundary around PDFOverlay/PDFViewer** → Phase 3.
- **Bridge setup code returns raw private key** (SEC-002) → needs its own mini-phase (see P0 routing below); consider hardening TTL + entropy.
- **`/api/nudge-admin` + `/api/scheduling/calendar-feed/[token]` missing rate-limit** → Phase 4 cleanup or a dedicated hardening sub-phase.
- **`useOffline.downloadSetlist` (P0 above) trailing fixes** — even after we fix the "counted failure as success" bug, there are related gaps in offline feedback (no offline-write indicator on autosave, no toast when user swaps offline) → Phase 3.

## Uncertainties worth Wave 2

High-leverage drill-downs:

1. **Deployed Firebase `storage.rules`.** Biggest unknown. Must be confirmed before we know whether SEC-001 is P0 or P1. Needs a Firebase CLI call.

2. **Reproducibility of the last-write-wins race.** Confirm the bug with a minimal scenario, understand what fields survive vs what gets overwritten (esp. `musicians`, `rabbi`, `serviceNotes`), and propose a fix shape (Firestore transaction? Optimistic concurrency via a `rev` field? Subscribe-to-doc in the hook?). This feeds a P0 insert phase.

3. **Offline truthiness bug in `use-offline.ts`.** Trace end-to-end: what does "downloaded" mean; where does the badge come from; does the service worker actually have these PDFs; what happens when the bundled version changes?

Lower-priority but noted:
- Bridge setup code entropy / distributed-attack viability (SEC-002).
- `calendarFeedToken` entropy.
- `config/admins` seeding + unify with `SUPER_ADMIN_UID` env bypass.
- Inngest signing verification (SEC-008).
- `monitor-live/commands/pending` collection path — is it used? legacy?
- `sync-engine.ts` / `offline-manager.ts` behavior under version mismatch (relates to the offline P0).

## Proposed Wave 2 dispatch

Three parallel drill-down agents:

- **W2-A** — Deployed storage rules: fetch or confirm, document, flag gap.
- **W2-B** — Last-write-wins: confirm reproducibility, identify every call site that overwrites `tracks`, enumerate fix options + recommendation.
- **W2-C** — Offline truthiness: trace `use-offline.ts:100-116` end-to-end, validate the P0, identify the fan-out of "thinks it's offline but isn't" paths across the app.

No security deep-dives in Wave 2 beyond storage rules — the rest is already P1 and lands naturally in later phases or a dedicated hardening sub-phase.
