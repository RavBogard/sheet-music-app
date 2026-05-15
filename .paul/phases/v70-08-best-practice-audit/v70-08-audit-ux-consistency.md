# v70-08 Best-Practice Audit — UX Consistency

Scope: UX consistency of the v7.0 UI surface only — ImporterModal (doc-import flow), SetlistMetaEditSheet, RecordingBindPopover / RecordingCell / MobileRowCard recording affordances, ImageScoreViewer, and the SetlistGridTopBar pencil edit button. Read-only audit.

**P0: 0 · P1: 3 · P2: 5 · P3: 4**

---

## P0

None.

---

## P1

### [P1] Doc-import "processing" step shows spreadsheet-only copy

**Location:** src/components/setlist/importer/ImporterModal.tsx:426-434 (processing step) and :313-321 (header descriptions)
**Description:** When a user uploads a `.docx/.pdf/.txt` document, `handleDocSubmit` sets `step = 'processing'`, which renders a screen titled **"Analyzing Rows"** with body copy "Passing data to Gemini to map dynamic columns, extract performer names, and verify Google Drive linkage permissions...". None of that describes the document path — there are no rows, no columns, no Drive-link verification in the doc pipeline (it does extract-document → extract-structure → resolve). The header `DialogDescription` for `processing` is generic ("Our AI is reading your file automatically...") but the body panel directly contradicts it. On an iPad this is the only thing the user sees for up to ~3 minutes of three chained 60s-timeout calls, and it tells them the wrong story.
**Recommended fix:** Branch the processing-panel copy on whether `docFile`/`isProcessingDoc` is set vs `csvFile`/`url`/`isParsing`, or genericize it ("Reading your file and building the setlist..."). At minimum the "Analyzing Rows" title and the column/Drive-link sentence must not show for the document path.

### [P1] Interview "Back" button silently discards the entire AI pipeline result

**Location:** src/components/setlist/importer/ImporterModal.tsx:623-625
**Description:** On the `interview` step, the "Back" button does `setStep('input')`. It does not clear `resolved`, but returning to `input` and pressing "Next" again re-runs `handleDocSubmit` from scratch — three more API calls, another ~1-3 min wait, and any edits the user typed into the interview form are wiped (the form re-seeds from the doc on the next `interview` entry). The user has no way to know "Back" means "throw away the AI analysis." The preview→interview Back (:735) is correct (cheap, in-memory), but interview→input is a destructive step transition disguised as ordinary back-navigation.
**Recommended fix:** Either (a) remove the Back button from the interview step (the flow is input→processing→interview→preview; there is nothing meaningful to go "back" to without redoing work), or (b) keep it but label/confirm it as "Start over" and reset doc state explicitly so the intent is honest.

### [P1] "Lead" used instead of house term "Vocal Lead" in MobileRowCard

**Location:** src/components/setlist/grid/MobileRowCard.tsx:292 (badge label "Lead") and :418 (inline-editor field label "Lead")
**Description:** Project memory's terminology rule is "Vocal Lead" — not "Lead" / "Leader". The v70-03 recording affordances live in this same card and the v70 ImporterModal correctly says "Vocal Lead" (ImporterModal.tsx:445, :486), so the app is now internally inconsistent: the import preview/review calls it "Vocal Lead" and the setlist row card that the band reads on stage calls it "Lead". This is a house-rule violation on the most-seen surface.
**Recommended fix:** Rename both the badge label and the inline-editor field label to "Vocal Lead" (the badge is tight on space — "Vocal" over "Lead" stacked, or just accept the wider label, matches the existing "Key" badge styling).

---

## P2

### [P2] ImporterModal buttons hardcode `bg-blue-600`, breaking the brand-color language

**Location:** src/components/setlist/importer/ImporterModal.tsx:413, :546, :629, :741 (and accent icons :329 `text-blue-500`, :428, etc.)
**Description:** Every primary action button in the modal is `bg-blue-600 hover:bg-blue-500`. The rest of the v7.0 surface uses the theme token — SetlistMetaEditSheet's Save is `bg-brand hover:bg-brand/90`, RecordingBindPopover's upload uses `bg-brand/10 text-brand`, MobileRowCard uses `brand` throughout. The app is a dark-first OKLCH indigo palette; a raw Tailwind `blue-600` is a different hue and reads as a foreign element. The per-option accent icons (blue/violet/emerald) are arguably intentional differentiation, but the primary CTA should be the brand color.
**Recommended fix:** Replace `bg-blue-600 hover:bg-blue-500` with `bg-brand hover:bg-brand/90` (or the default `Button` variant) on all four primary buttons for consistency with SetlistMetaEditSheet and the rest of the app.

### [P2] Preview header band shows a raw ISO date string

**Location:** src/components/setlist/importer/ImporterModal.tsx:645-650
**Description:** The preview step's header band renders `{interviewDate}` directly — i.e. `2026-05-15`. SetlistMetaEditSheet formats the same kind of value with `format(eventDate, 'PPP')` → "May 15th, 2026". Showing a bare `yyyy-mm-dd` in a confirmation summary is inconsistent with the app's date presentation and looks unfinished right before the user commits.
**Recommended fix:** Format `interviewDate` for display (parse and `format(..., 'PPP')`, matching SetlistMetaEditSheet) in the preview header band.

### [P2] "Create Setlist" stays enabled when the preview has zero tracks

**Location:** src/components/setlist/importer/ImporterModal.tsx:665-668 (empty state) and :738-745 (commit button)
**Description:** When `previewGroups.length === 0` the preview correctly shows "The document produced no tracks." — but the "Create Setlist" button remains enabled and `handleCommitDocument` only guards on `resolved && interviewDate`, not on track count. The user can create a completely empty setlist from a failed extraction. The empty state tells them something went wrong but the primary action still invites them to proceed.
**Recommended fix:** Disable "Create Setlist" when `resolved.tracks.length === 0` (and ideally point the user back to re-upload), so the empty state and the action affordance agree.

### [P2] RecordingBindPopover shows a false "No recordings yet" empty state while the subscription is still loading

**Location:** src/components/setlist/grid/RecordingBindPopover.tsx:48-60, :109-114
**Description:** `recordings` initializes to `[]` and the Firestore subscription only attaches on popover open. Between open and the first `onSnapshot` callback, `recordings.length === 0` so the popover immediately renders "No recordings yet" — a definitive empty state that may be wrong. On a slow tablet connection the band member sees "no recordings" flash before the list populates. None of the other async surfaces in v7.0 do this (ImageScoreViewer has an explicit `loading` status, ImporterModal has a processing step).
**Recommended fix:** Track a `loaded` flag set in the subscription callback; show a small loading row (Loader2, matching the app's spinner usage) until the first snapshot arrives, then branch to the list or the empty state.

### [P2] ImageScoreViewer error copy points to a "refresh" with no affordance

**Location:** src/components/music/ImageScoreViewer.tsx:33-38
**Description:** The error state says "Image failed to load — try refreshing" but there is no retry/refresh control in the viewer; the user is told to do something the UI doesn't offer (full page reload is the implied action, which on a performance device mid-service is heavy-handed). The PDF path elsewhere in the app generally offers a retry affordance.
**Recommended fix:** Add a "Retry" button that re-triggers the load (e.g. bump a cache-busting query param / reset `status` to `loading`), or reword to not promise an action the component can't perform.

---

## P3

### [P3] Input step has three full-size drop zones — heavy scroll on iPad portrait

**Location:** src/components/setlist/importer/ImporterModal.tsx:324-423
**Description:** The `input` step stacks Google Sheets URL + a `p-8` dashed CSV drop zone + a `p-8` dashed document drop zone with `space-y-8` and two "OR" dividers, inside a 900px dialog capped at `90vh`. On an iPad in portrait this requires scrolling to reach the third option and the "Next" button. Tablet-first guidance favors getting the primary action in view.
**Recommended fix:** Tighten vertical rhythm (smaller drop-zone padding, `space-y-6`) or make the three options a more compact selector so the CTA is reachable without scrolling on iPad portrait.

### [P3] Three import options are mutually exclusive but give no visual "selected/locked" feedback to the deselected ones

**Location:** src/components/setlist/importer/ImporterModal.tsx:79-93, :335 (URL onChange clears the others)
**Description:** Selecting any one option clears the other two in state, but the URL `Input` and the two drop zones give no indication that they've been superseded — only the chosen one gets its colored border. A user who typed a URL, then clicked the document zone, still sees their URL text sitting in the field (it's been cleared from state but not from the input? — actually it is cleared via `setUrl("")` only on doc/csv select handlers' siblings; the URL input is controlled so it does clear). The mutual exclusivity works, but it's silent — there's no "you can only pick one" cue until you notice the others reset.
**Recommended fix:** Dim/disable the non-selected options once one is chosen, or add a single helper line ("Pick one source") so the exclusivity is communicated rather than just enforced.

### [P3] Processing step has no cancel affordance for a multi-minute operation

**Location:** src/components/setlist/importer/ImporterModal.tsx:426-434
**Description:** The doc path chains three calls with 60s timeouts each (`handleDocSubmit`). The processing screen is a bare spinner with no cancel/abort. If the user picked the wrong file they're stuck watching it (or must close the whole modal, which is at least possible via the Dialog's overlay/X). Not blocking, but a long uncancellable wait is a rough edge on a tablet.
**Recommended fix:** Add a "Cancel" button on the processing step that aborts and returns to `input` (an `AbortController` passed to `apiFetch`, or at minimum a button that just `setStep('input')`).

### [P3] Inline-editor "Bind Chart" and delete buttons are hand-rolled, not the shared `Button`

**Location:** src/components/setlist/grid/MobileRowCard.tsx:448-464
**Description:** The inline editor's "Bind Chart" and trash buttons are raw `<button>` elements with bespoke `h-9 px-3 rounded-lg ...` styling, while the rest of v7.0 (SetlistMetaEditSheet, ImporterModal) uses the shared `Button` component. They look close but not identical (height, focus ring, hover transition timing). The delete button is also icon-only with no `aria-label`, unlike every other icon control in these v70 files.
**Recommended fix:** Migrate to the shared `Button` component (`variant="outline"` / `variant="destructive"`) for consistent sizing, focus states, and transitions; add an `aria-label` to the icon-only delete button.

---

## Notes (not findings)

- ImporterModal's review/interview/preview/processing footers consistently use the `shadow-[0_-10px_30px_#00000033]` lift and `border-t` — internally coherent.
- Loading states on the three primary async actions (handleParse, handleDocSubmit, handleCommitDocument) all use `Loader2` spinners with disabled buttons and changed labels — consistent within the modal and with SetlistMetaEditSheet / RecordingBindPopover.
- Error handling on the doc path is consistent: every failed step throws a server-message Error, toasts it, and reverts to `input` — a coherent recovery model.
- The preview honors the "no cover art / max-density text rows" house rule well (ImporterModal.tsx:663-727): single-line rows, tabular-nums index, no thumbnails, section headers as sticky bars — matches the Logic-Pro track-list intent.
- SetlistGridTopBar's pencil button and SetlistMetaEditSheet are well-aligned with the app's glass/brand language and 44px touch targets.
