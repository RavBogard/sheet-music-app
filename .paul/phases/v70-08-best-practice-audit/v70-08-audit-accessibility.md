# v70-08 Best-Practice Audit — Accessibility (a11y)

Scope: the v7.0 UI surface only — ImporterModal doc-import flow, SetlistMetaEditSheet, RecordingBindPopover / RecordingCell / their MobileRowCard wiring, ImageScoreViewer, and the SetlistGridTopBar pencil button. Read-only audit, tablet-first context.

**P0: 0 · P1: 3 · P2: 5 · P3: 2**

---

## P0 — Flow completely unusable by keyboard/SR, in production

None.

---

## P1 — Real accessibility failure that blocks or significantly hinders a user

### [P1] Importer file-dropzones are unreachable by keyboard

**Location:** `src/components/setlist/importer/ImporterModal.tsx:355-373` (CSV dropzone) and `:388-406` (Document dropzone)

**Description:** Both upload affordances are plain `<div onClick={...}>` elements with no `tabIndex`, no `role="button"`, and no `onKeyDown` handler. The actual `<input type="file">` inside each is `className="hidden"` (`display:none`), which removes it from the tab order entirely. A keyboard-only user therefore cannot reach the CSV upload or the new "Upload Document" input at all — and "Upload Document" is the headline v7.0 feature. The URL field and the final "Next" button are reachable, but neither file-upload path is. This is the entry point to the whole doc-driven flow.

**Recommended fix:** Make each dropzone a real button: add `role="button"`, `tabIndex={0}`, an `aria-label` ("Upload a CSV file" / "Upload a service-outline document"), and an `onKeyDown` that triggers the input on Enter/Space. Alternatively use `sr-only` instead of `hidden` on the `<input type="file">` and associate it with a `<label htmlFor>` so the native input stays focusable (the pattern RecordingBindPopover already uses correctly at `:144-154`).

### [P1] CSV upload dropzone has no accessible name and no programmatic state

**Location:** `src/components/setlist/importer/ImporterModal.tsx:355-374`

**Description:** Even setting aside keyboard-reachability, the CSV dropzone exposes nothing to a screen reader: no `aria-label`, no role, and the selected-file state (border/background color swap to violet) is communicated by color alone with no `aria-pressed`/`aria-describedby` or live region. A SR user who somehow activates it gets no confirmation a file was chosen. The Document dropzone has the same defect (`:388-407`).

**Recommended fix:** Once converted to a button (see finding above), add `aria-label`, and surface the selected filename via the accessible name or an `aria-live="polite"` region so file-selection success is announced. Do not rely on the border-color change alone.

### [P1] `<select>` and `<audio>` elements rely on color-only / unlabeled affordances; native date input on the interview form is the one keyboard path that works — but the surrounding flow can't be reached

**Location:** `src/components/setlist/importer/ImporterModal.tsx:592-601` (raw `<select>`), and the dependency chain from the P1 dropzone finding

**Description:** The interview-form `<select id="interview-service-type">` is correctly labelled (`<Label htmlFor>` at `:588`) and the name/date/rabbi inputs are correctly associated — that part is good. The real failure is that the interview step is only reachable *after* a document is uploaded, and per the first P1 finding the document upload cannot be triggered by keyboard. So the entire interview FORM + preview step — every correctly-labelled input in it — is dead-code from a keyboard user's perspective. The labels are right; the flow gate upstream is broken. Fixing the dropzone reachability finding unblocks this; flagging it separately because the interview form is a required-input form (service date is mandatory) and "you built the form accessibly but nobody can get to it" is itself a P1-level outcome.

**Recommended fix:** Resolve the dropzone keyboard-reachability finding. No change needed to the interview form's own label wiring.

---

## P2 — a11y gap worth fixing, not blocking

### [P2] Interview-form `<select>` is a raw element with inconsistent focus styling

**Location:** `src/components/setlist/importer/ImporterModal.tsx:592-601`

**Description:** Unlike the `Input` component (which has a defined `focus-visible:ring` treatment) and unlike SetlistMetaEditSheet's shadcn `Select`, this is a bare `<select>` with `className="w-full h-10 rounded-md bg-muted/50 border border-border px-3 text-sm cursor-pointer"` — no `focus-visible` ring class. It will fall back to the UA default outline, which on a dark glass background may be low-contrast or, in some browsers/themes, barely visible. It's labelled and keyboard-operable, so not P1, but the focus indicator is inconsistent with the rest of the form.

**Recommended fix:** Add `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand` to match `MobileRowCard`'s `inputBase` and the `Input` component, or swap to the shadcn `Select` used in SetlistMetaEditSheet.

### [P2] `<audio>` elements in RecordingBindPopover have no accessible name

**Location:** `src/components/setlist/grid/RecordingBindPopover.tsx:130-135`

**Description:** Each recording renders `<audio controls preload="none" src={...} />` with no `aria-label` or `title`. A screen reader announces it generically ("audio") with no indication of which recording it plays. The recording title is in an adjacent `<span>` (`:122-124`) but is not programmatically associated with the player.

**Recommended fix:** Add `aria-label={`Play recording: ${rec.title}`}` (and ideally the notes) to the `<audio>` element, or wrap each `<li>` in a `<figure>` with `aria-labelledby` pointing at the title span.

### [P2] ImageScoreViewer alt text is a generic fallback

**Location:** `src/components/music/ImageScoreViewer.tsx:41-51`

**Description:** The `<img>` uses `alt={alt ?? "Chart"}`. The `alt` prop is optional and, if callers don't pass it, every image chart is announced simply as "Chart" — not useful when a setlist has several. The `ImageScoreViewerProps` interface makes `alt` optional, so it's likely unset on at least some call paths.

**Recommended fix:** Have the PDFOverlay/viewer call sites pass a meaningful `alt` (the song/track title, e.g. `alt={`${track.title} chart`}`). Consider making `alt` required in the props interface so the omission is caught at compile time.

### [P2] ImageScoreViewer error/loading states are not announced

**Location:** `src/components/music/ImageScoreViewer.tsx:28-38`

**Description:** The loading spinner and the "Image failed to load — try refreshing" error message render without `role="status"`/`role="alert"` or an `aria-live` region. A screen-reader user who triggers an image-chart load gets no announcement that it's loading or that it failed — the chart simply never appears for them with no feedback.

**Recommended fix:** Wrap the error block in `role="alert"` and the loading block in `role="status"` (or an `aria-live="polite"` container) so state transitions are announced.

### [P2] Importer "missing chart" amber status indicator may fail contrast on the glass background

**Location:** `src/components/setlist/importer/ImporterModal.tsx:707-712` (`text-amber-500` "Missing chart"), also `:651-660` muted-foreground header band, `:680` `text-muted-foreground` row numbers

**Description:** The preview step uses `text-amber-500` on a `bg-muted/10` row that itself sits on the dark dialog. `amber-500` (~#f59e0b) on a dark background is typically borderline for the WCAG AA 4.5:1 small-text threshold and the surrounding `text-muted-foreground` at `text-xs` is also at risk. This is a status signal ("this track has no chart") so legibility matters. Could not measure exact ratios from source alone — flagging for a contrast check against the actual rendered tokens.

**Recommended fix:** Verify the amber status text against AA (4.5:1) on the rendered background; if it fails, use `amber-400` or add a non-color cue (the `FileWarning` icon is present, which helps, but the text should still pass). Same check for the `text-muted-foreground` xs text in the preview.

---

## P3 — Polish

### [P3] RecordingCell touch target is 44px only on coarse pointers; 40px otherwise

**Location:** `src/components/setlist/grid/cells/RecordingCell.tsx:40-42` (and the matching chart-link `<a>` in `src/components/setlist/grid/MobileRowCard.tsx:319-320`)

**Description:** Both affordances are `h-10 w-10` (40px) by default and only bump to `h-11 w-11` (44px) under `[@media(pointer:coarse)]`. This is a reasonable design and on the band's iPads it resolves to 44px, so it's not a real failure for the primary device. But a touch-capable laptop, or a device that doesn't report `pointer:coarse` correctly, would get the 40px target — under the 44×44 guideline. Minor.

**Recommended fix:** Consider making 44px the unconditional baseline for these two primary row affordances, since the app is tablet-first anyway. Low priority.

### [P3] MobileRowCard "No chart bound" / chart icons — `<span aria-label>` on a non-interactive element

**Location:** `src/components/setlist/grid/MobileRowCard.tsx:329-338`

**Description:** The unbound-chart state is a `<span aria-label="No chart bound">` wrapping an `aria-hidden` icon. `aria-label` on a non-interactive, non-landmark `<span>` is inconsistently surfaced by screen readers (it's valid but not reliably announced). The bound case uses an `<a aria-label>` which is correct; the unbound case is the weak one. Minor since it's purely informational.

**Recommended fix:** Either give the span a `role="img"` so the `aria-label` is reliably treated as the accessible name, or use visually-hidden text (`<span className="sr-only">No chart bound</span>`) instead of `aria-label`.

---

## Notes on what is correctly done (not findings)

- SetlistMetaEditSheet: every input/select has proper `<Label htmlFor>` association; Cancel/Save buttons have explicit `min-h-[44px]`; shadcn `Sheet`/`Popover`/`Select` provide dialog roles, focus trapping, and Escape handling.
- SetlistGridTopBar pencil button: has `aria-label="Edit setlist details"`, `min-h-[44px] min-w-[44px]`, and a visible `focus-visible:ring`. The Back button is likewise labelled.
- RecordingCell: has a context-aware `aria-label` and a `focus-visible:ring`.
- RecordingBindPopover: the upload control uses the correct `sr-only` input + `<label htmlFor>` pattern, and the error message has `role="alert"`.
- ImporterModal interview form: name/date/service-type/rabbi inputs are all correctly `htmlFor`/`id`-associated; the required date is marked with a visible asterisk.
- Dialog/Sheet/Popover roles and focus management come from the shadcn/Radix primitives and are sound.
