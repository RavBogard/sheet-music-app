# Phase 1: Data Foundation + Critical Stability - Research

**Researched:** 2026-03-01
**Domain:** Data model extension, PDF generation caching, email error surfacing
**Confidence:** HIGH

## Summary

Phase 1 is a well-scoped, low-risk data model extension plus two targeted stability fixes. The `tune` field needs to be threaded through three type hierarchies (`SetlistTrack`, `QueueItem`, `PrintTrack`), their Zod schemas, the mapping utilities between them, the TrackSheet editor UI, the cover page PDF builder, and the content hash function. All integration points already handle similar optional string fields (like `key`, `notes`, `leadMusician`), so the tune field follows established patterns exactly.

The print cache hash fix is straightforward: `computeContentHash` in `print-pipeline.ts` currently only hashes `fileId`, `transposition`, `preferFlats`, `capoFret`, `title`, `date`, and `musicianName`. It omits `key`, `leadMusician`, `notes`, `eventName`, and the new `tune` field, all of which appear on the cover page. Adding these fields to the `significant` object immediately invalidates stale caches. The email error surfacing is partially done: the API returns `emailError` and the `PublishDialog` already displays it inline. What is missing is a prominent warning toast and a resend button.

**Primary recommendation:** Follow the established pattern for optional string fields. Every file that handles `key` or `leadMusician` also needs to handle `tune` in the same way. The hash fix and email error surfacing are surgical changes to existing code.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- `tune` is an optional free-text string field on `SetlistTrack` -- no structured data, no autocomplete, no validation
- Title = liturgical piece name (e.g., "Barchu"). Tune = specific melody/arrangement (e.g., "Friedman"). They are separate concepts.
- Tune only visible on `song` track types -- hide on headers, readings, prayers, transitions, notes
- Blank tune is the default and is normal -- only fill in when multiple versions exist and you need to distinguish
- Field must thread through all 3 type hierarchies: `SetlistTrack` (models.ts), `QueueItem` (store.ts), `PrintTrack` (print-pipeline.ts)
- Zod schema uses `.catch(undefined)` -- no Firestore migration needed for existing documents
- In TrackSheet editor, tune appears after key: Title -> Key -> Tune -> Lead -> Notes
- Simple text input, no special validation or autocomplete (that's v2 scope: OUTL-02)
- `computeContentHash` must include ALL fields that appear on the cover page: per-track `key`, `leadMusician`, `notes`, `tune`, plus request-level `eventName`
- Existing cached PDFs will naturally regenerate on next print (cache miss due to new hash) -- this is acceptable and desired
- No manual cache purge needed
- Since we're already in `buildCoverPage` to add the Tune column, bump all body text from 10px to at least 12pt
- Headers can go larger (14pt+) for readability at arm's length
- Add a "Tune" column between Song and Lead in the cover page table
- This is a readability fix, not the full Phase 3 redesign -- keep the same basic layout structure
- When publish succeeds but email delivery fails, show a **yellow warning toast**: "Published! But email delivery failed for X musicians"
- The publish response currently returns `{ success: true, emailError: "..." }` -- client must check `emailError` field and show warning toast instead of pure green success
- Add a **"Resend emails" button** so users can retry email delivery without re-publishing the whole setlist
- The resend action should be a separate API endpoint that re-sends to the failed recipients only

### Claude's Discretion
- Exact column widths and spacing in the cover page table after adding Tune column
- How to handle long tune names in the cover page (truncation length)
- Implementation details of the resend endpoint (whether it re-sends to all or only failed)
- Toast notification duration and styling details
- Exact Zod schema structure for the tune field

### Deferred Ideas (OUT OF SCOPE)
- **Tune autocomplete from accumulated names (OUTL-02)**: User enters tune as free text now; autocomplete from previously used tune names is v2 scope
- **Full cover page visual redesign**: Phase 3 handles the complete printed outline redesign. Phase 1 only adds the tune column and bumps fonts.
- **Per-musician transposed keys on printed outline (OUTL-03)**: v2 scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| DATA-01 | Setlist track has a `tune` field for arrangement/version name | Add `tune?: string` to `SetlistTrack` interface in `models.ts`. Pattern matches existing `key`, `notes`, `leadMusician` fields. Zod schema in `schemas.ts` uses `z.string().nullish().catch(undefined).transform(v => v \|\| undefined)` -- identical to all other optional string fields. |
| DATA-02 | Tune field threads through all 3 type hierarchies: `SetlistTrack`, `QueueItem`, `PrintTrack` | `QueueItem` in `store.ts` needs `tune?: string`. `PrintTrack` in `print-pipeline.ts` needs `tune?: string`. `queue-utils.ts` `toQueueItem()` must map `tune`. `PrintModal.tsx` `generateForMusician()` must map `tune` in the tracks array sent to the API. |
| DATA-03 | Tune field is editable in the track editor (TrackSheet) with free-text input | `TrackSheet.tsx` manages local state for each field. Add `tune` state, sync in `useEffect`, include in `commitChanges()`. Place after Key, before Lead. Only render when `isSong` is true. |
| DATA-04 | Existing setlists with no tune data display gracefully (no errors, empty field shown as blank) | Zod `.catch(undefined)` guarantees missing `tune` is silently coerced to `undefined`. TrackSheet initializes `tune` state from `track.tune \|\| ""`. Cover page renders blank when `tune` is falsy. |
| STAB-01 | Print cache hash includes all cover page fields to prevent stale PDFs | `computeContentHash` in `print-pipeline.ts:73` must expand `significant.tracks` to include `title`, `key`, `notes`, `leadMusician`, `tune`. Must also add `eventName` at the request level. |
| STAB-02 | Publish route surfaces email delivery failures to user instead of silent swallowing | API already returns `emailError` field. `PublishDialog.tsx` already displays it inline. Need: (1) yellow warning toast via sonner when `emailError` is present, (2) separate resend API endpoint, (3) resend button in the PublishDialog success state. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.1.4 | App framework | Already in use; all code follows App Router conventions |
| React | 19.2.3 | UI framework | Already in use |
| TypeScript | ^5 | Type safety | Already in use; all files are .ts/.tsx |
| Zod | ^4.3.6 | Schema validation | Already in use for all Firestore boundary parsing |
| Zustand | ^5.0.10 | State management | Already in use for `useMusicStore` |
| pdf-lib | ^1.17.1 | PDF generation | Already in use for cover page and print pipeline |
| sonner | ^2.0.7 | Toast notifications | Already in use throughout the app |
| Resend | ^6.9.2 | Email delivery | Already in use for all email sending |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Firebase/Firestore | ^12.9.0 | Database | Already in use; no schema migration needed for optional fields |
| firebase-admin | ^13.6.0 | Server-side DB | Used in API routes (publish, print) |
| vitest | ^3.2.1 | Unit testing | Test hash function changes and type mapping |

### Alternatives Considered

None. Phase 1 uses exclusively existing libraries. No new dependencies needed.

**Installation:**
No new packages required.

## Architecture Patterns

### Recommended Project Structure
No new directories needed. Changes are to existing files:
```
src/
  types/
    models.ts           # Add tune to SetlistTrack
    schemas.ts          # Add tune to setlistTrackSchema
  lib/
    store.ts            # Add tune to QueueItem
    queue-utils.ts      # Map tune in toQueueItem()
    print-pipeline.ts   # Add tune to PrintTrack, hash, cover page
    email.ts            # (no changes needed)
  components/
    setlist/
      v2/TrackSheet.tsx # Add tune input field
      PublishDialog.tsx  # Add warning toast + resend button
  app/
    api/
      setlist/
        publish/route.ts    # (no changes needed -- already returns emailError)
        resend-email/route.ts  # NEW: resend endpoint
```

### Pattern 1: Optional String Field Threading
**What:** Every optional string field on `SetlistTrack` follows the same pattern through all layers.
**When to use:** Adding `tune` -- follow the exact same pattern as `key`, `leadMusician`, `notes`.
**Example (existing pattern from codebase):**

1. **Interface** (`src/types/models.ts`):
```typescript
export interface SetlistTrack {
    // ... existing fields
    tune?: string  // follows same pattern as key?, notes?, leadMusician?
}
```

2. **Zod schema** (`src/types/schemas.ts`):
```typescript
// Inside setlistTrackSchema z.object:
tune: z.string().nullish().catch(undefined).transform(v => v || undefined),
// This is the EXACT same pattern used for key, notes, leadMusician, etc.
```

3. **QueueItem** (`src/lib/store.ts`):
```typescript
export interface QueueItem {
    // ... existing fields
    tune?: string
}
```

4. **queue-utils mapping** (`src/lib/queue-utils.ts`):
```typescript
// Inside toQueueItem return:
tune: track.tune,  // follows same pattern as key: track.key
```

5. **PrintTrack** (`src/lib/print-pipeline.ts`):
```typescript
export interface PrintTrack {
    // ... existing fields
    tune?: string
}
```

6. **PrintModal mapping** (`src/components/setlist/PrintModal.tsx`):
```typescript
// Inside tracks.map in generateForMusician:
tune: t.tune || '',  // follows same pattern as key: t.key || ''
```

### Pattern 2: TrackSheet Field Editing
**What:** Each editable field in TrackSheet has local state, syncs from track data in useEffect, and commits via handleBlur/commitChanges.
**When to use:** Adding the tune text input.
**Example (from existing codebase, TrackSheet.tsx):**

```typescript
// 1. State declaration (alongside existing fields)
const [tune, setTune] = useState("")

// 2. Sync from track data in useEffect
useEffect(() => {
    if (track) {
        // ... existing fields
        setTune(track.tune || "")
    }
}, [track])

// 3. Include in commitChanges
const commitChanges = useCallback(() => {
    if (!track) return
    const data: Partial<SetlistTrack> = { title }
    if (isSong) {
        // ... existing fields
        data.tune = tune || undefined
    }
    onUpdate(track.id, data)
}, [/* ... deps including tune */])

// 4. Render (after Key, before Lead -- inside the isSong block)
// Simple Input with handleBlur, same as leadMusician field
```

### Pattern 3: Cover Page Column Layout
**What:** The cover page uses fixed x-position columns. Adding a new column requires shifting others.
**When to use:** Adding the Tune column.
**Key details from `buildCoverPage()` in `print-pipeline.ts`:**

```typescript
// Current columns (with hasTranspositions = false):
// colNum=50, colTitle=75, colLead=310, colKey=430, colNotes=475

// Adding colTune between colTitle and colLead requires:
// 1. Define colTune position
// 2. Adjust colLead, colKey, colNotes to make room
// 3. Only show tune for non-service-flow tracks (same as key/lead)
// 4. Truncate long tune names (10-15 chars seems reasonable given column width)
```

### Pattern 4: Content Hash Expansion
**What:** `computeContentHash` determines when cached PDFs are stale.
**When to use:** Any time a cover-page-visible field is added or changed.
**Example:**

```typescript
function computeContentHash(req: PrintRequest): string {
    const significant = {
        title: req.title,
        date: req.date,
        musicianName: req.musicianName,
        eventName: req.eventName,  // ADD: was missing
        tracks: req.tracks.map(t => ({
            fileId: t.fileId,
            transposition: t.transposition || 0,
            preferFlats: t.preferFlats || false,
            capoFret: t.capoFret || 0,
            // ADD these cover page fields:
            title: t.title,
            key: t.key || '',
            notes: t.notes || '',
            leadMusician: t.leadMusician || '',
            tune: t.tune || '',
        })),
    }
    return createHash('sha256').update(JSON.stringify(significant)).digest('hex').slice(0, 16)
}
```

### Pattern 5: Toast + Resend for Email Failures
**What:** The PublishDialog currently shows email errors inline but uses a green success toast regardless.
**When to use:** Improving STAB-02.
**Current behavior (from `PublishDialog.tsx:98-101`):**

```typescript
// Currently: always green success toast, emailError appended to description
toast.success(data.wasAlreadyPublic ? 'Re-notified!' : 'Published!', {
    description: `${data.musicianCount} musicians...` + (data.emailError ? ` emailError` : ''),
})

// Should become: conditional warning toast when emailError exists
if (data.emailError) {
    toast.warning('Published! But email delivery failed', {
        description: data.emailError,
        duration: 8000, // longer for error visibility
    })
} else {
    toast.success(data.wasAlreadyPublic ? 'Re-notified!' : 'Published!', {
        description: `...`,
    })
}
```

### Anti-Patterns to Avoid
- **Adding tune to non-song track types:** Tune is ONLY for `song` type tracks. The `isServiceFlow` filter in `buildCoverPage` already distinguishes these. Do not display tune for headers, readings, prayers, transitions, or notes.
- **Requiring tune field:** Tune is optional and usually blank. Do not add any validation or "required" logic. Most songs do not need a tune name.
- **Migrating existing Firestore data:** Zod `.catch(undefined)` handles missing fields automatically. No Firestore migration script needed.
- **Purging the print cache manually:** The hash change means all existing cached PDFs will miss on next request and regenerate automatically.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Toast notifications | Custom notification system | sonner (already installed) | Used throughout app; consistent UX |
| Form field state management | Custom form library | Existing TrackSheet pattern (local useState + handleBlur) | All track fields use this pattern; consistency matters |
| Content hash invalidation | Cache purge mechanism | Expanding the `significant` object in `computeContentHash` | Natural cache miss on hash change; no manual purge needed |
| Email retry mechanism | Complex retry queue | Simple resend endpoint that re-calls `emailAllMembers` | Resend API handles actual delivery; we just need to call it again |

**Key insight:** Phase 1 does not introduce any new architectural patterns. Every change follows an existing pattern in the codebase. The risk is in missing an integration point, not in choosing the wrong approach.

## Common Pitfalls

### Pitfall 1: Missing a Type Hierarchy
**What goes wrong:** Adding `tune` to `SetlistTrack` but forgetting `QueueItem` or `PrintTrack` causes data loss at boundary crossings.
**Why it happens:** Three separate interfaces represent the same track at different layers (editor, store, print). Easy to forget one.
**How to avoid:** Checklist: (1) `SetlistTrack` in models.ts, (2) `setlistTrackSchema` in schemas.ts, (3) `QueueItem` in store.ts, (4) `toQueueItem()` in queue-utils.ts, (5) `PrintTrack` in print-pipeline.ts, (6) `PrintModal.tsx` tracks.map.
**Warning signs:** Tune appears in editor but not on printed cover page, or vice versa.

### Pitfall 2: Content Hash Missing Fields
**What goes wrong:** Adding `tune` to the cover page display but not to the content hash means changing a tune name still serves the old cached PDF.
**Why it happens:** The hash and the display are in different parts of the same file (`print-pipeline.ts`). Easy to update one and forget the other.
**How to avoid:** The hash `significant` object should mirror all fields that appear on the cover page. Update them together.
**Warning signs:** Changing tune name, reprinting, and seeing the old tune on the cover page.

### Pitfall 3: TrackSheet Not Including Tune in commitChanges
**What goes wrong:** User types a tune name, but it doesn't persist because `commitChanges()` doesn't include the tune field in the update payload.
**Why it happens:** `commitChanges` manually builds a `Partial<SetlistTrack>` from local state. Adding state without adding it to the commit payload is a common miss.
**How to avoid:** After adding `tune` state, also add `data.tune = tune || undefined` inside the `if (isSong)` block of `commitChanges`.
**Warning signs:** Tune field appears to work but is blank after page reload.

### Pitfall 4: Cover Page Column Overflow
**What goes wrong:** Adding a Tune column without adjusting other column positions causes text overlap.
**Why it happens:** The cover page uses fixed x-positions (`colNum`, `colTitle`, `colLead`, `colKey`, `colNotes`). Adding a column requires recalculating all positions.
**How to avoid:** Recalculate all column x-positions to accommodate the new column. Reduce `maxTitleLen` and `maxLeadLen` if needed. Add a `maxTuneLen` for truncation (recommend 12-15 characters).
**Warning signs:** Overlapping text on the printed cover page.

### Pitfall 5: Email Resend Endpoint Security
**What goes wrong:** Resend endpoint allows unauthorized users to spam emails.
**Why it happens:** Forgetting to add auth checks and rate limiting to the new endpoint.
**How to avoid:** Use the same `withAuth` + `checkRateLimit` guards as the publish route. Only allow setlist owner, band leader, or admin to trigger resend.
**Warning signs:** Anyone can call the resend endpoint.

## Code Examples

### Existing Optional Field Pattern (all verified from codebase)

**SetlistTrack interface** (src/types/models.ts:34-53):
```typescript
export interface SetlistTrack {
    id: string
    title: string
    key?: string         // <-- tune follows this exact pattern
    notes?: string
    leadMusician?: string
    // ... other fields
}
```

**Zod schema** (src/types/schemas.ts:73):
```typescript
key: z.string().nullish().catch(undefined).transform(v => v || undefined),
// tune uses the identical schema declaration
```

**QueueItem interface** (src/lib/store.ts:7-21):
```typescript
export interface QueueItem {
    name: string
    fileId: string
    type: FileType
    key?: string         // <-- tune follows this pattern
    // ... other fields
}
```

**toQueueItem mapping** (src/lib/queue-utils.ts:7-33):
```typescript
return {
    name: track.title,
    key: track.key,      // <-- tune: track.tune follows this pattern
    // ... other fields
}
```

**PrintTrack interface** (src/lib/print-pipeline.ts:23-37):
```typescript
export interface PrintTrack {
    title: string
    key: string
    notes: string
    leadMusician?: string  // <-- tune?: string follows this pattern
    // ... other fields
}
```

**PrintModal track mapping** (src/components/setlist/PrintModal.tsx:155-169):
```typescript
tracks: tracks.map(t => ({
    title: t.title,
    key: t.key || '',
    notes: t.notes || '',
    leadMusician: t.leadMusician || '',  // <-- tune: t.tune || '' follows this
    // ... other fields
}))
```

### Content Hash (current vs fixed)

**Current** (src/lib/print-pipeline.ts:73-86):
```typescript
const significant = {
    title: req.title,
    date: req.date,
    musicianName: req.musicianName,
    // MISSING: eventName
    tracks: req.tracks.map(t => ({
        fileId: t.fileId,
        transposition: t.transposition || 0,
        preferFlats: t.preferFlats || false,
        capoFret: t.capoFret || 0,
        // MISSING: title, key, notes, leadMusician, tune
    })),
}
```

### Cover Page Font Sizes (current)

**Current** (src/lib/print-pipeline.ts:275-340):
All body text (header labels, row data) uses `size: 10`. Notes use `size: 9`.
The user decision says: bump to at least 12pt body, 14pt+ for headers.

### Toast Patterns (existing in codebase)

**Success toast** (src/components/setlist/PublishDialog.tsx:98):
```typescript
toast.success('Published!', { description: '...' })
```

**Warning toast** (src/components/setlist/PrintModal.tsx:225):
```typescript
toast.warning(`${result.failed} emails failed to send`)
```

**Error toast** (src/components/setlist/PublishDialog.tsx:104):
```typescript
toast.error('Failed to publish', { description: err.message })
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Print hash only includes fileId + transposition | Should include all cover page fields | This phase | Prevents stale PDFs |
| Email errors silently appended to success toast | Should show distinct warning toast + resend button | This phase | Users actually notice failures |
| Cover page body text at 10px | Bump to 12pt+ body, 14pt+ headers | This phase | Readable at arm's length |

**No deprecated APIs or libraries involved.** All tools in use are current and actively maintained.

## Open Questions

1. **Resend endpoint: re-send to ALL or only FAILED?**
   - What we know: User decision says "re-sends to the failed recipients only"
   - What's unclear: How to track which recipients failed (the publish response includes error strings like "email@example.com: reason" but doesn't store this persistently)
   - Recommendation: The simplest approach is to re-send to ALL email recipients (not just failed ones), since: (a) Resend handles deduplication at the ESP level, (b) tracking individual failures across requests adds complexity, (c) musicians getting a duplicate email is low-impact. Alternatively, store failed email addresses in the response and pass them back to the resend endpoint. Claude's discretion per CONTEXT.md.

2. **Cover page column widths with Tune column**
   - What we know: Current columns use positions 50-475 across a 612pt page. Adding Tune requires redistributing space.
   - What's unclear: Optimal width allocation when both Tune and transposition columns are present (6 columns is tight).
   - Recommendation: In the common case (no transposition), allocate: # (50), Song (75-195), Tune (200-280), Lead (285-365), Key (370-420), Notes (425-562). When transposition is present, compress Tune and Notes further. Max tune display length: 12-15 characters.

## Sources

### Primary (HIGH confidence)
- **Codebase direct inspection** -- all findings verified by reading actual source files:
  - `src/types/models.ts` -- SetlistTrack interface (line 34-53)
  - `src/types/schemas.ts` -- Zod schemas with `.catch(undefined)` pattern (line 57-85)
  - `src/lib/store.ts` -- QueueItem interface (line 7-21)
  - `src/lib/queue-utils.ts` -- toQueueItem mapping function (line 7-33)
  - `src/lib/print-pipeline.ts` -- PrintTrack, computeContentHash, buildCoverPage (full file)
  - `src/components/setlist/v2/TrackSheet.tsx` -- Editor field pattern (full file)
  - `src/components/setlist/PublishDialog.tsx` -- Email error handling (full file)
  - `src/components/setlist/PrintModal.tsx` -- PrintTrack mapping (line 149-171)
  - `src/lib/email.ts` -- emailAllMembers function (line 79-126)
  - `src/app/api/setlist/publish/route.ts` -- Publish API with emailError response (full file)
  - `src/lib/setlist-firebase.ts` -- Firestore operations, setlistConverter usage (full file)

### Secondary (MEDIUM confidence)
- **sonner toast API** -- Verified from existing usage in codebase (39 files import from sonner). `toast.warning()` is used in PrintModal.tsx:225.
- **pdf-lib API** -- Verified from existing cover page code. `drawText` with `size`, `font`, `color` parameters.

### Tertiary (LOW confidence)
- None. All findings are from direct codebase inspection.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- All libraries already in use, no new dependencies
- Architecture: HIGH -- All patterns directly observed in existing codebase
- Pitfalls: HIGH -- Every pitfall identified from actual code structure and known integration points

**Research date:** 2026-03-01
**Valid until:** 2026-04-01 (stable; no external dependency changes expected)
