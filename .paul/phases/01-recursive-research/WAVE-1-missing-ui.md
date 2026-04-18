# Wave 1 — Missing UI & Dead Ends

## Summary

The app is in surprisingly good shape for "missing-UI" hygiene: no `TODO`/`FIXME`/`coming soon`/`not implemented` markers in shipping code, no empty `onClick={() => {}}` handlers, no empty `aria-label=""`/`title=""` strings, no `@deprecated` props that are still rendered with live effect, and all listed route paths resolve. The biggest real risks are (a) **two orphan settings routes** (`/settings/users`, `/settings/sound`) that still exist on disk but are no longer linked anywhere in the UI, (b) a handful of **deprecated-but-still-wired props** (SetlistToolbar, NamePrompt) whose removal is being deferred, (c) a **few transfer/restore dialogs that use `window.confirm` or loose `div` modals** rather than the app's AlertDialog system, and (d) minor polish issues (a stray unbalanced `grid-cols-2` in NamePrompt, a `Rabbi` hard-coded list in OverflowMenu). Severity-P0 dead ends were not found.

## Findings

### DEAD-ROUTE-01 — Orphan `/settings/users` route (Severity: P1)
- **Category**: missing UI / unreachable route
- **File**: `src/app/(main)/settings/users/page.tsx`
- **What's wrong**: Route exists but is linked from nowhere in `src/`. The only references to `/settings/users` are in `docs/` and `.paul/`/`.planning/` archives where it is explicitly marked "REMOVE — folded into /admin". User Management now lives in `ManageClient.tsx` → People tab.
- **Why it matters**: Leaves a ghost admin surface with parallel implementation that can drift (RBAC bugs, role-change toasts, pending-invite flow can diverge from PeopleSection). A user who bookmarks the old URL still lands somewhere.
- **Suspected fix**: Delete the route, or replace it with a `redirect('/manage?tab=people')`.

### DEAD-ROUTE-02 — Orphan `/settings/sound` route (Severity: P1)
- **Category**: missing UI / unreachable route
- **File**: `src/app/(main)/settings/sound/page.tsx`
- **What's wrong**: Back button says "Back to manage" and the page renders `SoundSystemSection`, but `SoundSystemSection` is ALSO rendered inside `ManageClient.tsx` under the "Sound" tab. No outgoing link to `/settings/sound` exists in the UI (only in planning docs).
- **Why it matters**: Two screens display the same config; one of them (the orphan) has no entry point. Admin changes made on the hidden page are indistinguishable but unreachable via the nav.
- **Suspected fix**: Delete the page or replace with a `redirect('/manage?tab=sound')`.

### DEPRECATED-PROP-01 — `SetlistToolbar` keeps three deprecated props in its public API (Severity: P2)
- **Category**: @deprecated props still rendered
- **File**: `src/components/setlist/SetlistToolbar.tsx:9-16`
- **What's wrong**: `activeTab`, `onTabChange`, `showPersonalTab` are JSDoc-`@deprecated` but still in the type. Any new caller can accidentally pass them and get silent no-ops.
- **Why it matters**: Low-risk footgun; makes the component's surface confusing.
- **Suspected fix**: Remove the props and bump callers.

### DEPRECATED-PROP-02 — `NamePrompt.isBandLeader` is deprecated-but-accepted (Severity: P2)
- **Category**: @deprecated prop
- **File**: `src/components/setlist/modals/NamePrompt.tsx:22-24`
- **What's wrong**: `isBandLeader` marked `@deprecated No longer used`, still declared in `NamePromptProps`.
- **Why it matters**: Same as above — dead API.
- **Suspected fix**: Remove the prop.

### DEPRECATED-PROP-03 — `use-setlist-dashboard` has two deprecated props (Severity: P2)
- **Category**: @deprecated prop
- **File**: `src/hooks/use-setlist-dashboard.ts:20-22`
- **What's wrong**: Two hook options flagged deprecated in favor of `initialSetlists`.
- **Why it matters**: Callers could still pass them; silent no-op.
- **Suspected fix**: Remove or alias.

### EMPTY-GRID-CELL-01 — NamePrompt has `grid-cols-2` wrapping a single child (Severity: P2)
- **Category**: layout / visual dead space
- **File**: `src/components/setlist/modals/NamePrompt.tsx:60`
- **What's wrong**: The `<div className="grid grid-cols-2 gap-4">` contains only the Date picker column; the second column is permanently empty, so the picker renders at 50% width with unexplained blank space on the right.
- **Why it matters**: Looks unfinished — suggests a second field (time? rabbi?) was planned but never added.
- **Suspected fix**: Either drop `grid-cols-2` or fill the second cell (e.g., Rabbi select now that OverflowMenu hard-codes rabbis).

### DEAD-END-DIALOG-01 — `handleRestore` in SetlistHistoryPanel uses native `window.confirm` (Severity: P1)
- **Category**: half-built flow / inconsistent UX
- **File**: `src/components/setlist/SetlistHistoryPanel.tsx:68`
- **What's wrong**: Restore confirmation uses `window.confirm()` instead of the app-wide `AlertDialog` component. On iPad/PWA contexts this renders a native OS prompt that can be styled inconsistently or blocked.
- **Why it matters**: Version-restore is a destructive action; native `confirm()` on some mobile browsers is suppressible ("Don't show again") which can silently break the flow.
- **Suspected fix**: Replace with an `AlertDialog`, matching `DeleteSetlistDialog`.

### DEAD-END-DIALOG-02 — `TransferSetlistDialog` renders a hand-rolled overlay (Severity: P2)
- **Category**: inconsistent UX / cancel path
- **File**: `src/components/setlist/SetlistDialogs.tsx:84-113`
- **What's wrong**: Unlike its siblings (Delete, Duplicate) that use `AlertDialog`, TransferSetlistDialog renders a raw `<div className="fixed inset-0 bg-black/80…">`. Escape key, backdrop click, and focus-trap are not handled, and input state (`email`) is held by the parent — cancel only closes but does not clear.
- **Why it matters**: User cancels, reopens the transfer dialog later, sees previously typed email still there; risk of accidental transfer to the wrong address.
- **Suspected fix**: Port to `AlertDialog`/`Dialog`, reset `email` on close via `onOpenChange`.

### HARDCODED-MENU-01 — Rabbi list hard-coded in OverflowMenu (Severity: P1)
- **Category**: feature referenced but dataless
- **File**: `src/components/setlist/v2/OverflowMenu.tsx:114`
- **What's wrong**: Rabbi picker shows `["Daniel", "Karen", "Randy"]` as a literal. If a new rabbi is onboarded, the only way to assign them is to edit code.
- **Why it matters**: The app markets itself as multi-congregation-ready (`congregation-store`), but this list silently excludes anyone else. The "Clear" option works but users cannot add.
- **Suspected fix**: Source from `useCongregation()` or from a Firestore `rabbis` collection; fall back to these three.

### EMPTY-STATE-01 — `AudioFilePicker` empty state has no upload CTA (Severity: P2)
- **Category**: empty state gives no next action
- **File**: `src/components/setlist/AudioFilePicker.tsx:57-63`
- **What's wrong**: When no audio files exist, the empty state says "Make sure you have MP3 or WAV files uploaded…" but offers no button/link to open the Library uploader or Google Drive folder.
- **Why it matters**: The user is stuck in a modal telling them to do a thing elsewhere with no way to get there. Classic dead-end message.
- **Suspected fix**: Add a secondary button "Open Library" linking to `/library?tab=audio`.

### EMPTY-STATE-02 — `Setlist Empty` label in SongNavigation has no action (Severity: P2)
- **Category**: empty state gives no next action
- **File**: `src/components/performance/SongNavigation.tsx:43`
- **What's wrong**: When the playback queue is empty, the toolbar says `"Setlist Empty"` with prev/next buttons still rendered (likely disabled via context, but no message tells the user "Add tracks").
- **Why it matters**: During a live performance, a misloaded setlist leaves the musician on a dead toolbar with no recovery path.
- **Suspected fix**: Swap in an "Add tracks" link to `/setlists/{id}` when queue is 0.

### ACCESSIBILITY-01 — Some icon-only buttons rely on `title` (hover) instead of `aria-label` (Severity: P2)
- **Category**: icons without accessible labels
- **File**: Multiple — `SetlistToolbar.tsx:43,55,63,73`; `DuplicateScanner.tsx:104`; `PDFHealthScanner.tsx:123`; `AudioFilePicker.tsx:34`; `setlist/v2/TrackSheet.tsx:292,304`; `setlist/v2/BatchActionBar.tsx:66`; `setlist/v2/SetlistTopBar.tsx:51,92,104`; `setlist/v2/OverflowMenu.tsx:63`; `monitor/MonitorTabs.tsx:209`; `performance/RehearsalToolbar.tsx:218`; `performance/SongNavigation.tsx:29,49`.
- **What's wrong**: Icon-only `Button size="icon"` renders no visible text; `title=` is not read by most mobile screen readers. A number of these omit `aria-label` entirely (most of the above). Contrast with good examples: `calendar/CalendarHeader.tsx`, `audio/AudioPlayer.tsx`, `nav/MobileHeader.tsx` where `aria-label` is present.
- **Why it matters**: Screen-reader and voice-control users (including Rabbi Daniel on iPad with Voice Control) cannot trigger these actions by name.
- **Suspected fix**: Add `aria-label` equal to the `title` for every icon-only button; lint rule to enforce.

### CONFIRM-NATIVE-01 — Multiple destructive actions use `window.confirm` (Severity: P2)
- **Category**: inconsistent confirm UX
- **Files**: `src/components/setlist/SetlistHistoryPanel.tsx:68` (restore); spot-check other destructive paths (archive, delete) already use `AlertDialog`.
- **What's wrong**: Same as DEAD-END-DIALOG-01 but logged separately because the pattern may recur — worth a grep pass in Wave 2.
- **Suspected fix**: Project-wide lint rule against `window.confirm`.

### LINK-BROKEN-01 — `Footer.tsx` links to `/changelog` which is rendered but unlinked from main nav (Severity: P2)
- **Category**: minor dead-end / polish
- **File**: `src/components/Footer.tsx:16`; route at `src/app/(main)/changelog/page.tsx`
- **What's wrong**: Changelog is reachable via footer + MobileMenuDrawer tertiary list. Not actually broken, but Footer is rarely mounted on mobile — so on mobile the only path is the hamburger menu. Low severity.
- **Suspected fix**: None required; note for Wave 2 if Footer mount logic changes.

## Uncertainties (for Wave 2)

- **Whether `/settings/users` and `/settings/sound` are "parked" or intended** — both are fully implemented; confirm with user whether to delete or re-link. Planning docs explicitly say delete, but the files are still there.
- **Deprecated props on `SetlistToolbar` / `NamePrompt` / `use-setlist-dashboard`** — may be kept intentionally for an in-flight migration; a `grep` for callers still passing them would confirm.
- **`matrix` view in `SetlistToolbar`** — the view is wired through to `use-setlist-dashboard.ts:60` but I did not verify the matrix renderer is actually mounted for that view; worth confirming there isn't a blank screen when clicking the Grid3X3 icon.
- **`ImporterModal` Google Sheets flow** — placeholder text implies end-to-end import; did not verify the column-mapping step (`placeholder="Key"`, `placeholder="Lead"`) produces a valid setlist or silently drops rows.
- **`handleRestore` / SetlistHistoryPanel** — the `setRestoring(null)` is called synchronously after `onRestore(tracks)`; if `onRestore` is async and throws, the button never resets. Wave 2 should confirm.
- **`PushNotificationSettings` disabled states** — I saw `disabled` usage but did not read the full flow; confirm that the disabled "Subscribe" button always has a tooltip explaining why (e.g., permission denied).
- **`NudgeAdminButton`** — found in list of files with disabled states; unverified whether the disabled state has an explanation.
- **`QRSignIn` polling loop** — `createSession` is wired to two buttons (line 198, 231), worth verifying both paths are live and not a leftover duplicate.
- **`OfflineIndicator`** disabled state — check the retry affordance is present.
- **Hard-coded rabbi list** — intentional for v1.0 (per memory: Rabbi Daniel + Randy) but worth flagging for onboarding.
- **`/audio` redirect → `/library`** — intentional (confirmed), not a dead end.
