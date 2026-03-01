# Phase 1: Data Foundation + Critical Stability - Context

**Gathered:** 2026-03-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Add the `tune` field to the data model across all three type hierarchies (SetlistTrack, QueueItem, PrintTrack), make it editable in TrackSheet, display it on the print cover page, fix the print cache hash to include all cover page fields, bump cover page fonts to readable sizes, and surface email delivery failures during publish with a retry mechanism.

Requirements: DATA-01, DATA-02, DATA-03, DATA-04, STAB-01, STAB-02

</domain>

<decisions>
## Implementation Decisions

### Tune field data model
- `tune` is an optional free-text string field on `SetlistTrack` — no structured data, no autocomplete, no validation
- Title = liturgical piece name (e.g., "Barchu"). Tune = specific melody/arrangement (e.g., "Friedman"). They are separate concepts.
- Tune only visible on `song` track types — hide on headers, readings, prayers, transitions, notes
- Blank tune is the default and is normal — only fill in when multiple versions exist and you need to distinguish
- Field must thread through all 3 type hierarchies: `SetlistTrack` (models.ts), `QueueItem` (store.ts), `PrintTrack` (print-pipeline.ts)
- Zod schema uses `.catch(undefined)` — no Firestore migration needed for existing documents

### Tune field editor placement
- In TrackSheet editor, tune appears after key: Title -> Key -> Tune -> Lead -> Notes
- Simple text input, no special validation or autocomplete (that's v2 scope: OUTL-02)

### Print cache hash fix
- `computeContentHash` must include ALL fields that appear on the cover page: per-track `key`, `leadMusician`, `notes`, `tune`, plus request-level `eventName`
- Existing cached PDFs will naturally regenerate on next print (cache miss due to new hash) — this is acceptable and desired
- No manual cache purge needed

### Cover page font size bump
- Since we're already in `buildCoverPage` to add the Tune column, bump all body text from 10px to at least 12pt
- Headers can go larger (14pt+) for readability at arm's length
- Add a "Tune" column between Song and Lead in the cover page table
- This is a readability fix, not the full Phase 3 redesign — keep the same basic layout structure

### Email error surfacing
- When publish succeeds but email delivery fails, show a **yellow warning toast**: "Published! But email delivery failed for X musicians"
- The publish response currently returns `{ success: true, emailError: "..." }` — client must check `emailError` field and show warning toast instead of pure green success
- Add a **"Resend emails" button** so users can retry email delivery without re-publishing the whole setlist
- The resend action should be a separate API endpoint that re-sends to the failed recipients only

### Claude's Discretion
- Exact column widths and spacing in the cover page table after adding Tune column
- How to handle long tune names in the cover page (truncation length)
- Implementation details of the resend endpoint (whether it re-sends to all or only failed)
- Toast notification duration and styling details
- Exact Zod schema structure for the tune field

</decisions>

<specifics>
## Specific Ideas

- Tune names vary in length: sometimes one word ("Friedman"), sometimes a phrase ("Traditional Ashkenazi"). Free text, no constraints.
- The Excel outline has columns: Song/Prayer, Tune, Key, Lead — this is the musician's mental model for the cover page column order
- "Daniel guitar?" column from the Excel is obsolete — don't replicate it
- Cache regeneration on next print is fine — existing cached PDFs may already be stale

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SetlistTrack` interface (src/types/models.ts:34): Add `tune?: string` alongside existing `key`, `notes`, `leadMusician`
- `PrintTrack` interface (src/lib/print-pipeline.ts:23): Add `tune?: string` alongside existing fields
- `QueueItem` interface (src/lib/store.ts:7): Add `tune?: string` — follows same pattern as `key`, `performer`
- `TrackSheet.tsx`: Existing track editor component where the tune input field goes
- `emailAllMembers()` (src/lib/email.ts): Already extracted email function used by publish route

### Established Patterns
- **Zod `.catch(undefined)`**: Used for all optional fields — new tune field follows this pattern, no migration needed
- **TrackType filtering**: `isServiceFlow` pattern in buildCoverPage already distinguishes song vs non-song tracks — tune column follows same conditional
- **Column layout in buildCoverPage**: Uses fixed x-positions (colNum, colTitle, colLead, colKey, colNotes) — needs a colTune added
- **Print hash pattern**: `computeContentHash` in print-pipeline.ts:73 — needs expanded significant object

### Integration Points
- `SetlistEditorV2.tsx` → `TrackSheet.tsx`: Track data flows from editor to sheet — tune field must be included in the track update handlers
- `queue-utils.ts`: Maps SetlistTrack to QueueItem — must map tune field
- `print-pipeline.ts buildCoverPage()`: Renders cover page tracks — must read and display tune
- `publish/route.ts`: Response JSON already has `emailError` — client component that calls publish must read and display it
- `SetlistEditorV2.tsx` or wherever publish is triggered: Must handle the warning toast and show resend button

</code_context>

<deferred>
## Deferred Ideas

- **Tune autocomplete from accumulated names (OUTL-02)**: User enters tune as free text now; autocomplete from previously used tune names is v2 scope
- **Full cover page visual redesign**: Phase 3 handles the complete printed outline redesign. Phase 1 only adds the tune column and bumps fonts.
- **Per-musician transposed keys on printed outline (OUTL-03)**: v2 scope

</deferred>

---

*Phase: 01-data-foundation*
*Context gathered: 2026-03-01*
