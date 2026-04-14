# Wave 1 — Pain Points (Taps / Scroll / Gesture)

## Summary

The app already does well on a few basics: autofocus on the wizard name input, autofocus in SwapPicker and AddSongsModal, 44-px minimums on most icon buttons, a "Undo" toast on delete, and debounced autosave in the editor. But several core weekly flows (clone → tweak, swap a song, add songs, open setlist from nav) still cost more taps than they should, and there are meaningful gesture / keyboard gaps. The biggest issues are (1) missing Enter/Escape semantics throughout pickers and dialogs, (2) Creation Wizard always forces a 2-step flow even for the 90%-case "Shabbat morning on next Saturday," (3) no direct swipe / keyboard shortcut on the performance SetlistRow that band leaders use live, and (4) a handful of backdrop/gesture mismatches (swap picker backdrop tap works but Esc doesn't, print modal mounts inside PDF overlay). Details below.

## Findings

### PP-001 Creation Wizard always takes 2 steps + 3 taps for the 90% case (P1)
- **Category**: pain point
- **File**: `src/components/setlist/wizard/CreationWizard.tsx:25-119`, `src/hooks/use-creation-wizard.ts:108-116`
- **Flow / tap count**: Clone-free creation of "Shabbat Morning next Saturday" = open wizard (1) + tap template card (2) + tap Next (3) + tap Create (4). With a keyboard Enter would shortcut this but `handleNext` is not wired to any `onKeyDown` on the dialog. Selecting a template does not auto-advance.
- **What's wrong**: There are only two steps (`template`, `details`) and the template tap already auto-fills name + date (`handleTemplateSelect`). A single-screen form with the template grid on top and a name/date row below would be the same data in 2 taps (template + Create). The Next button is disabled-then-enabled rather than replaced by Create.
- **Why it matters**: Rabbi Daniel clones weekly; even creating from scratch is a common migration task. Extra taps + no Enter key hit cadence friction on iPad.
- **Suspected fix**: Auto-advance on template select; add global `onKeyDown` for Enter → handleNext / Create when `canGoNext`. Or collapse to one step.

### PP-002 Swap picker has no Enter-to-select and no Esc-to-close (P1)
- **Category**: pain point
- **File**: `src/components/performance/SwapPicker.tsx:16-117`
- **Flow / tap count**: Swap a song live = tap swap icon (1) → type partial name → must lift hand from keyboard, tap result (2) = 2 taps + mouse trip. Escape key does nothing; only backdrop tap or the X button close.
- **What's wrong**: Search input autofocuses but `onKeyDown` is not wired; pressing Enter in the input should pick the top result. No `document.addEventListener('keydown', Esc)`. Arrow-key navigation through results is absent.
- **Why it matters**: This runs mid-service. Keyboard users (music director with laptop) and iPad-with-keyboard users lose a second each time.
- **Suspected fix**: Add `onKeyDown` handling Enter (select `results[0]`), Escape (close), ArrowDown/Up to move a highlighted-row index.

### PP-003 SetlistRow swap button is a 44x44 target glued to tap-to-open-PDF row (P1)
- **Category**: pain point / gesture conflict
- **File**: `src/components/performance/SetlistRow.tsx:130-161`
- **Flow / tap count**: The whole row is a button that opens the PDF. The swap icon sits inside the row with `e.stopPropagation()`. On iPad portrait the swap button is visually a muted 4-px icon inside an 11x11-rem container, making it easy to miss and tap the row instead → opens wrong PDF.
- **What's wrong**: `ArrowLeftRight` icon is `h-4 w-4 text-muted-foreground/50` — it reads as decorative. No hover affordance on touch. No swipe-left gesture binding, even though that's the expected iOS pattern for row actions.
- **Why it matters**: Swap is a live-performance action. Mis-tapping it opens the PDF viewer, which then requires 2 more taps (close, return to setlist) — a 3-tap mistake recovery.
- **Suspected fix**: Make the swap icon higher contrast + labeled OR move to a trailing context menu; alternatively add `onPointerDown` swipe-left to expose action (already done on LibraryFileRow via long-press — be consistent).

### PP-004 LibraryFileRow long-press (500 ms) collides with text selection / scroll (P2)
- **Category**: gesture conflict
- **File**: `src/components/library/LibraryFileRow.tsx:67-80`
- **What's wrong**: `handleTouchStart` sets a 500 ms long-press timer without suppressing iOS text-selection or checking pointer move. `handleTouchEndOrMove` cancels, but fast scrollers still see selection handles flash on iOS Safari because `-webkit-touch-callout` / `user-select` are not suppressed on the row.
- **Why it matters**: Hurts scroll feel in the library; causes the callout menu to appear on real devices.
- **Suspected fix**: Add `style={{ WebkitTouchCallout: 'none', userSelect: 'none' }}` to the row, and cancel the timer on `touchmove` with a small threshold.

### PP-005 Mobile bottom tab bar + fixed header cover content on iOS Safari (P1)
- **Category**: fixed element obstructs UI
- **File**: `src/components/nav/MobileTabBar.tsx:134-140`, `src/components/nav/MobileHeader.tsx:17`
- **What's wrong**: Both are `fixed` with `pb-safe`/top-14 but pages in `src/app/(main)/**` set `pb-24` in several places (e.g. `SetlistView.tsx:38`) rather than a global layout offset. Some screens (setlist dashboard, library) don't apply matching top/bottom padding, so the last row sits under the 64-80 px nav when the page is keyboard-height-reduced. `keyboardOpen` hides the tab bar but then the last-row detection (pb-24) over-pads when the nav is gone.
- **Why it matters**: The last setlist / last library file can be invisible on iPad Mini portrait.
- **Suspected fix**: Centralize safe-area padding in the `(main)/layout.tsx` rather than per-page, and make the keyboard-hide conditional collapse the reserved bottom space.

### PP-006 PrintModal mounts *inside* the fixed PDFOverlay with `absolute inset-0` (P1)
- **Category**: gesture / focus trap
- **File**: `src/components/performance/PDFOverlay.tsx:205-214`
- **What's wrong**: The print modal is nested inside `<div className="absolute inset-0 z-[60]">` within the overlay's own `fixed inset-0 z-50` container. It cannot be dismissed by overlay-level Escape handling, and `overflow: hidden` is set on body by the PDF overlay, meaning any scrollable PrintModal content must scroll inside itself — classic scroll-inside-scroll on mobile. iOS Safari will intermittently trap touchmove.
- **Why it matters**: Printing a gig packet for the band is a weekly task.
- **Suspected fix**: Render PrintModal at document root via portal with its own backdrop + Escape handler; restore body overflow only when BOTH overlay and print modal close.

### PP-007 AddSongsModal re-renders filter on every keystroke via store `setFilter` (P2)
- **Category**: pain point (perceived latency)
- **File**: `src/components/setlist/modals/AddSongsModal.tsx:57-62,85-94`
- **What's wrong**: `searchQuery` is pushed into the global `useLibraryStore().setFilter` in a `useEffect` on every change, then results are re-filtered inline with `useMemo`. No debounce. On a 300-song library, iPad typing drops frames.
- **Why it matters**: Adding songs is the core authoring flow.
- **Suspected fix**: Debounce `setFilter` by 120-150 ms; keep local state for the input.

### PP-008 CreationWizard dialog: backdrop/Esc disabled while `creating`, but no toast or progress announce (P2)
- **Category**: pain point
- **File**: `src/components/setlist/wizard/CreationWizard.tsx:50`
- **What's wrong**: `onOpenChange={(v) => !wizard.creating && onOpenChange(v)}` silently ignores Esc / backdrop clicks during the ~1-3 s create step. User taps again thinking it missed.
- **Suspected fix**: Add a small loading announcement and keep Escape enabled after a 5s timeout.

### PP-009 SwapPicker initial `query` = `currentTrack.title` forces user to clear before typing (P2)
- **Category**: pain point
- **File**: `src/components/performance/SwapPicker.tsx:17`
- **What's wrong**: `useState(currentTrack.title)` pre-fills with the track to *replace*. Autofocus puts caret at end; to search for a different song user must select-all + delete (extra 1 gesture on iPad). The intent seems to be "show closest matches on open," but results are computed from query.
- **Suspected fix**: Use empty query, but precompute fuse results seeded with title internally for the default view; or select-all on focus.

### PP-010 MobileTabBar search popover: no Enter to pick top result, closes on every focus-out (P2)
- **Category**: pain point / keyboard
- **File**: `src/components/nav/MobileTabBar.tsx:173-197`
- **What's wrong**: Input has no `onKeyDown`. Pressing Enter with one strong result doesn't navigate. iOS Safari keyboard-dismiss on scroll inside the popover closes the popover because Radix Popover treats blur as dismiss unless a press-bubble happens first.
- **Suspected fix**: `onKeyDown={Enter → handleSearchSelect(searchResults[0])}`; pin popover `onInteractOutside` to ignore the input's virtual-keyboard blur.

### PP-011 SetlistView scroll area inside a flex parent + PDFOverlay body-lock = stacked scroll traps (P2)
- **Category**: scroll-inside-scroll
- **File**: `src/components/performance/SetlistView.tsx:37-38`, `src/components/performance/PDFOverlay.tsx:122-128`
- **What's wrong**: SetlistView uses `flex-1 overflow-y-auto` with `pb-24`. When PDFOverlay is open, it sets `document.body.style.overflow = 'hidden'`, but SetlistView is still mounted (fixed, hidden behind overlay per Pitfall 3). iOS Safari momentum scrolls will bleed through to the hidden list on rubber-band.
- **Suspected fix**: Also freeze the setlist list (`pointer-events-none` + `overscroll-behavior: none`) while the overlay is active.

### PP-012 Dialogs (Delete/Duplicate) rely on shadcn default Escape but TransferDialog is hand-rolled, no Esc (P2)
- **Category**: keyboard
- **File**: `src/components/setlist/SetlistDialogs.tsx:84-113`
- **What's wrong**: `TransferSetlistDialog` renders a plain `<div className="fixed inset-0 …">` instead of using AlertDialog. Backdrop click does not close (no onClick on the backdrop div). No Esc key handler. Email input doesn't submit on Enter.
- **Suspected fix**: Port to shadcn Dialog; `<form onSubmit>`; Esc handled by Radix.

### PP-013 SetlistRow "go to song" interaction requires a real click on the title, not the row chrome (P2)
- **Category**: tap target
- **File**: `src/components/performance/SetlistRow.tsx:130-147`
- **What's wrong**: The row is a button (good) but the swap icon sits on the right 44 px and the BPM label floats between. On landscape iPad with a track whose title is short, the natural tap is dead center where only the flex spacer lives — it works because the whole row is role=button, but users often aim at the title text which doesn't give visual feedback on hover (no `hover:` style on the text itself, only on the row).
- **Suspected fix**: Add explicit `hover:bg-muted/50` feedback on the entire clickable area is present — but remove the decorative BPM label from the click path on mobile (make BPM a small pill at far right, not interleaved).

### PP-014 useSetlistLogic deletes track with toast undo but no keyboard undo (Ctrl+Z) binding (P2)
- **Category**: missing shortcut
- **File**: `src/hooks/use-setlist-logic.ts:440-451`, `:133-149`
- **What's wrong**: `undo()` / `redo()` exist with 20-deep history, but they're only bound to toolbar buttons (where exposed). No global `Ctrl/Cmd+Z`, `Cmd+Shift+Z` binding. Desktop users expect it.
- **Suspected fix**: Add a `useEffect` keydown listener when editor is mounted and focus is not in an `<input>`.

### PP-015 AddSongsModal "Add All Visible" is undoable only via the selection panel — no tap to unselect group (P2)
- **Category**: pain point
- **File**: `src/components/setlist/modals/AddSongsModal.tsx:106-110`
- **What's wrong**: "Add All Visible" *adds* to selection but there's no "Clear" or toggle. If you click it twice, nothing happens. To undo you must scroll and tap each song.
- **Suspected fix**: Button toggles: when all visible already selected → "Clear visible."

### PP-016 CreationWizard & AddSongsModal both rely on `autoFocus` which iOS Safari can drop when inside a sheet/dialog mount animation (P2)
- **Category**: keyboard-dismiss bug
- **File**: `src/components/setlist/wizard/CreationWizard.tsx:246`, `src/components/setlist/modals/AddSongsModal.tsx:135`
- **What's wrong**: `autoFocus` attribute is applied before Radix completes its focus trap setup; on iOS Safari the keyboard does not open. SwapPicker got this right with `setTimeout(..., 100)` (line 41).
- **Suspected fix**: Same pattern — `useEffect(() => setTimeout(() => ref.current?.focus(), 100), [])`.

### PP-017 SetlistCards UpcomingCard — Download + MoreVertical are `<div>` with `cursor-pointer` inside an outer `role=button` row (P1 a11y, P2 pain)
- **Category**: gesture conflict / a11y
- **File**: `src/components/setlist/SetlistCards.tsx:46-100`
- **What's wrong**: Nested pseudo-buttons (`<div onClick>`) stopPropagation to prevent the outer role=button. But keyboard users tabbing hit the outer button first; nested divs aren't focusable. "Clone for Next Week" is inside DropdownMenu → requires 3 taps (card … menu → item). That's the 90% weekly workflow.
- **Why it matters**: Clone-for-next-week is THE weekly primary action; burying it in a hover-revealed MoreVertical menu that only shows on touch always visible (line 80: `md:opacity-0 md:group-hover:opacity-100`) is reasonable, but it's 3 taps vs 1 for the card tap.
- **Suspected fix**: Promote "Clone for Next Week" to a primary secondary-button on the card (next to Download). Current: 3 taps. After: 1 tap.

### PP-018 No global Esc to close PDFOverlay; only onClose via toolbar "Home" (P1)
- **Category**: keyboard
- **File**: `src/components/performance/PDFOverlay.tsx:184-216`
- **What's wrong**: No `document.addEventListener('keydown', e => e.key === 'Escape' && onClose())`. Desktop rehearsal leaders with laptop expect Esc.
- **Suspected fix**: Add once-registered listener in the `useEffect` that locks body overflow.

## Uncertainties (for Wave 2)

- **Drag-to-reorder behavior**: `useSetlistLogic.moveTrack` uses `@dnd-kit/sortable.arrayMove` but I did not read the actual DnD wiring (SetlistEditor, v2/). Need to verify iPad long-press threshold vs. scroll, and whether there's a drag handle or the whole row is draggable (which conflicts with tap-to-open).
- **Chat panel keyboard behavior**: ChatPanel autofocus / Enter-to-send not inspected.
- **PerformanceToolbar popover stacking**: transposer has separate mobile/desktop popover state — does toggling mid-song cause lost input on iPad Split View? Untested.
- **Library breadcrumbs + filter**: are filters preserved when you back out of a folder? Possible "form data lost on re-open" pattern.
- **SelectionActionBar** on mobile: does it overlap the MobileTabBar on small viewports?
- **PublishDialog / PrintModal full audit**: not read; likely candidates for keyboard/backdrop gaps.
- **Wake-lock and metronome gestures**: may conflict with browser autoplay-policy tap; needs device testing.
- **SetlistDrawer virtualizer**: re-measure after animation works, but tap targets inside virtualized rows on iPad under heavy scroll — unverified.
