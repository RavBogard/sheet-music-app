# Phase 4: Setlist Editor - Research

**Researched:** 2026-03-07
**Domain:** Setlist editor UX, liturgical templates, AI-assisted editing, phone-first editing patterns
**Confidence:** HIGH

## Summary

Phase 4 builds on a substantial existing editor (SetlistEditorV2) that already has drag-drop via dnd-kit, AI chat via Gemini, Fuse.js template matching, auto-save with debounced Firestore writes, undo/redo, batch operations, and a creation wizard. The primary work is UX transformation (modal-based editing to inline accordion editing), template completion (2 of 16 templates exist), enhancing the duplicate workflow (date auto-advance already implemented via `cloneForNextWeek`), converting from explicit publish to auto-publish, and building a search-first song-adding overlay to replace the folder-browsing AddSongsModal.

The codebase is well-structured with clear separation: `use-setlist-logic.ts` manages all editor state, `setlist-firebase.ts` handles persistence, `chat-store.ts` + `ChatPanel.tsx` handle AI, and `liturgical-templates.ts` handles template definitions and Fuse.js matching. The legacy `setlist-store.ts` (localStorage staging buffer) is marked for removal in this phase.

**Primary recommendation:** Extend existing components -- add accordion expand behavior to SongRow/FlowRow, replace AddSongsModal with a search-first overlay, complete 14 missing templates in liturgical-templates.ts, and simplify the publish flow to auto-publish on save.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Phone-first editing -- not keyboard-friendly, touch-friendly
- Tap a song row to expand inline (accordion pattern) -- shows editable key, tempo, lead, notes fields
- No modal for common edits -- TrackSheet modal may remain for advanced/rare fields but primary editing is inline
- Collapsed song row shows: Title + Key + Lead musician (tempo visible only when expanded)
- Non-song items (readings, prayers, transitions) also expand inline for title/description editing
- Search-first overlay: tap '+' opens a search bar immediately. Type a few letters, see matching songs from library. Tap to add
- No folder browsing by default -- search is the primary path. Library browser available as fallback
- Song replacement: Tap song row to expand -> 'Replace' button -> same search-first overlay -> new song inherits slot position
- Build all 7 regular templates with full liturgical slot structures (Daniel/Karen Friday Night, Randy Friday Night, Shir Shabbat, Daniel/Karen Saturday Morning, Randy Saturday Morning, Bnei Mitzvah Saturday, Havdalah/Afternoon Bnei Mitzvah)
- Stub 9 holiday templates with basic structures
- Rabbi variants use conditional slots (onlyFor/skipFor) -- mostly same structure, minor tweaks per rabbi
- Currently 2 templates exist (Friday Night: 19 slots, Shabbat Morning: 24 slots) -- extend, don't rebuild
- One-tap auto-fill: pick a template -> instantly get a pre-filled setlist with matched songs from library
- AI fills templates automatically: "Create a Daniel Friday for March 14" -> AI picks template + fills songs
- Template picker + AI chat are complementary: both can trigger the same auto-fill pipeline
- Smart duplicate with date advance: one tap "Duplicate for next week" -> copies setlist, auto-advances date by 7 days, auto-generates name, opens editor immediately
- "Duplicate for next week" should be prominent and accessible from the dashboard
- No drafts -- every setlist is always live and visible to assigned musicians immediately
- Auto-publish on save: once a setlist exists, any edit is immediately visible to musicians
- No separate publish step or publish dialog for routine use
- Notification to musicians when setlist is created or significantly changed (EDIT-07)

### Claude's Discretion
- Non-song item adding UX (type picker design, placement)
- Creation wizard simplification approach
- Exact expanded row field layout and interaction design
- How auto-save/auto-publish works technically (debounced Firestore writes, optimistic UI)
- Notification trigger logic (what counts as "significant change" for EDIT-07)
- Legacy setlist-store.ts removal timing and migration

### Deferred Ideas (OUT OF SCOPE)
- Template builder/editor tool for creating custom templates in-app -- future enhancement
- AI-powered duplicate ("duplicate last week but swap X for Y" in one sentence) -- could be added to AI chat later
- Rotation matrix view (SetlistMatrixView.tsx exists but is cut from v2 scope)
- Real-time collaborative editing -- out of scope (one person builds setlists)
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| EDIT-01 | Band leader can create a new setlist from a service template (16 templates: 7 regular, 9 holiday) | Template engine exists with 2 templates; extend TEMPLATES registry in liturgical-templates.ts with 14 more; rabbi variants via onlyFor/skipFor slots |
| EDIT-02 | Band leader can duplicate a previous setlist and modify it | `cloneForNextWeek()` already exists in setlist-firebase.ts with date advance and liturgical name generation; enhance dashboard prominence |
| EDIT-03 | Band leader can add songs from the library, set key/tempo/lead/notes inline | Replace AddSongsModal with search-first overlay using Fuse.js; add accordion expand to SongRow with inline key/tempo/lead/notes fields |
| EDIT-04 | Band leader can add, reorder, and edit non-song items | AddBar already supports header/reading/prayer/transition/note; add accordion expand to FlowRow for inline editing |
| EDIT-05 | Band leader can drag-drop to reorder all items | Already fully implemented via dnd-kit in SetlistEditorV2 with mouse/touch/keyboard sensors |
| EDIT-06 | Band leader can publish a setlist, making it visible to all assigned musicians | Convert to auto-publish: remove PublishDialog from routine flow; setlists are always live after first save |
| EDIT-07 | Band leader can edit a published setlist (changes propagate to musicians) | Auto-save already writes to Firestore with 1s debounce; add notification trigger via notification-store.ts for significant changes |
| EDIT-08 | Setlist creation is faster than a spreadsheet -- minimal clicks, keyboard-friendly, tab-through fields | Phone-first inline editing, search-first add, one-tap duplicate, template auto-fill pipeline |
| EDIT-09 | AI can auto-fill a setlist from a template with reasonable defaults via natural language command | ChatPanel + API route already handle CREATE_SETLIST; connect template engine's buildSetlistFromTemplate to AI pipeline |
| EDIT-10 | AI accepts chat commands for setlist modifications | Already implemented: ADD_TO_SETLIST, REMOVE_FROM_SETLIST, reorder via ChatEditAction system; enhance with key/tempo setting |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| @dnd-kit/core | ^6.3.1 | Drag-and-drop framework | Already in use; closestCenter collision, vertical list strategy |
| @dnd-kit/sortable | ^10.0.0 | Sortable list abstraction | Already in use; SortableContext wraps track list |
| fuse.js | ^7.1.0 | Fuzzy search for library and templates | Already in use; powers template matching and will power search overlay |
| zustand | ^5.0.10 | Client state management | Already in use; chat-store, library-store |
| firebase | ^12.9.0 | Backend persistence via Firestore | Already in use; setlist-firebase.ts handles all CRUD |
| @google/generative-ai | ^0.24.1 | AI chat via Gemini | Already in use; ChatPanel + /api/chat route |
| @radix-ui/react-dialog | ^1.1.15 | Sheet/Dialog primitives | Already in use; TrackSheet uses Sheet for mobile, Dialog for desktop |
| sonner | ^2.0.7 | Toast notifications | Already in use throughout editor |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| date-fns | ^4.1.0 | Date formatting/manipulation | Duplicate date advance, template date display |
| lucide-react | ^0.563.0 | Icons | Already used in all row components |
| @radix-ui/react-popover | ^1.1.15 | Popover for search overlay | Search-first song adding overlay |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Fuse.js for search overlay | Algolia/MeiliSearch | Fuse.js already in use, client-side, zero infra -- no reason to change for ~500 file library |
| New accordion component | Radix Accordion | Custom expand state is simpler -- just toggle a boolean per row, no need for accordion primitive |

**Installation:**
```bash
# No new packages needed -- all dependencies already installed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── components/setlist/v2/       # Editor components (extend existing)
│   ├── SetlistEditorV2.tsx      # Main editor -- add expandedTrackId state
│   ├── SongRow.tsx              # Add accordion expand with inline fields
│   ├── FlowRow.tsx              # Add accordion expand with inline fields
│   ├── AddBar.tsx               # Modify to open search overlay instead of modal
│   ├── SearchOverlay.tsx        # NEW: search-first song adding
│   └── InlineFields.tsx         # NEW: shared inline field layout for expanded rows
├── components/setlist/wizard/   # Simplified creation flow
│   └── CreationWizard.tsx       # Simplify (Claude's discretion)
├── lib/
│   ├── liturgical-templates.ts  # Add 14 templates to TEMPLATES registry
│   └── setlist-firebase.ts      # cloneForNextWeek already exists; minor tweaks
└── hooks/
    └── use-setlist-logic.ts     # Extend with inline editing state
```

### Pattern 1: Accordion Expand on Row Tap
**What:** Single expandedTrackId state in SetlistEditorV2; tapping a row expands it inline showing editable fields. Tapping another row collapses the first and expands the new one.
**When to use:** All song and flow item rows.
**Example:**
```typescript
// In SetlistEditorV2.tsx
const [expandedTrackId, setExpandedTrackId] = useState<string | null>(null)

const handleRowTap = (track: SetlistTrack) => {
    setExpandedTrackId(prev => prev === track.id ? null : track.id)
}

// In SongRow.tsx -- accept isExpanded prop
interface SongRowProps {
    track: SetlistTrack
    canEdit: boolean
    isExpanded: boolean
    onTap: (track: SetlistTrack) => void
    onUpdate: (id: string, data: Partial<SetlistTrack>) => void
    onReplace: (track: SetlistTrack) => void
    onPlayFile?: (fileId: string, fileName: string) => void
}

// Expanded section renders below the collapsed row info
{isExpanded && (
    <div className="px-3 pb-3 space-y-3">
        <div className="grid grid-cols-2 gap-3">
            <KeyPicker value={track.key} onChange={...} />
            <Input value={track.leadMusician} placeholder="Lead" onChange={...} />
        </div>
        <Input type="number" value={track.bpm} placeholder="BPM" />
        <Textarea value={track.notes} placeholder="Notes..." />
        <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => onReplace(track)}>Replace</Button>
            <Button size="sm" variant="ghost" className="text-red-500" onClick={() => onDelete(track.id)}>Delete</Button>
        </div>
    </div>
)}
```

### Pattern 2: Search-First Song Adding
**What:** Overlay with immediate search bar focus. Fuse.js searches library files. Tap result to add to setlist at bottom (or at specific position for replace flow).
**When to use:** Adding new songs and replacing existing songs.
**Example:**
```typescript
// SearchOverlay.tsx -- uses Fuse.js on allFiles from useLibraryStore
const fuse = useMemo(() => new Fuse(allFiles, {
    keys: ['name'],
    threshold: 0.4,
    distance: 150,
}), [allFiles])

const results = useMemo(() => {
    if (!query.trim()) return suggestedFiles  // show suggestions when empty
    return fuse.search(query).map(r => r.item)
}, [query, fuse, suggestedFiles])
```

### Pattern 3: Auto-Publish via Existing Auto-Save
**What:** The existing auto-save in use-setlist-logic.ts already writes to Firestore with 1s debounce. For auto-publish, simply ensure new setlists are created as isPublic=true (or remove the public/private distinction for the standard flow). Musicians subscribed to the setlist see updates via Firestore onSnapshot.
**When to use:** Every save operation.
**Example:**
```typescript
// In use-setlist-logic.ts performSave -- setlists are always "live"
// The existing 1s debounce auto-save already handles this
// Remove the PublishDialog from the routine flow
// Keep togglePublic for the edge case of hiding a setlist
```

### Pattern 4: Template Extension with Rabbi Variants
**What:** Use existing onlyFor/skipFor slot fields to create rabbi-specific template variants. Templates share 90%+ of slots; rabbi variants add/remove 1-3 slots.
**When to use:** Building the 7 regular templates that vary by rabbi.
**Example:**
```typescript
// In liturgical-templates.ts
export const DANIEL_FRIDAY_TEMPLATE: TemplateSlot[] = [
    ...FRIDAY_NIGHT_TEMPLATE.slice(0, 5),
    // Daniel-specific: adds a meditation moment
    { label: 'Meditation', type: 'transition', queries: [], estimatedMinutes: 2,
      onlyFor: ['daniel_karen'] },
    ...FRIDAY_NIGHT_TEMPLATE.slice(5),
]

// Better approach: single template with conditional slots
export const FRIDAY_NIGHT_TEMPLATE_V2: TemplateSlot[] = [
    // ... shared slots ...
    { label: 'Meditation', type: 'transition', queries: [],
      onlyFor: ['daniel_karen', 'daniel_karen_friday'] },
    // ... more shared slots ...
]
```

### Anti-Patterns to Avoid
- **Building a new editor component:** SetlistEditorV2 is mature and well-tested. Extend it, don't replace it.
- **Separate expand/collapse state per row:** Use a single expandedTrackId in the parent. Only one row should be expanded at a time for phone UX.
- **Modal for every edit:** The whole point of Phase 4 is inline editing. TrackSheet stays only for advanced fields (reference links, audio file linking, native key override).
- **Rebuilding the AI pipeline:** ChatPanel and the /api/chat route already handle all needed command types. Extend, don't rebuild.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fuzzy search | Custom string matching | Fuse.js (already in use) | Handles typos, transliterations, partial matches |
| Drag-drop reordering | Custom touch event handlers | dnd-kit (already in use) | Touch/mouse/keyboard sensors, collision detection, accessibility |
| Debounced auto-save | Custom setTimeout chains | Existing use-setlist-logic.ts pattern | Already handles visibility change flush, beforeunload, ref-based latest values |
| Liturgical date math | Manual date calculations | liturgical-calendar.ts + date-fns (already in use) | Parasha lookup, Hebrew date, holiday detection |
| Toast notifications | Custom notification UI | sonner (already in use) | Consistent with rest of app |

**Key insight:** This phase is primarily UX work on an already-solid foundation. The temptation to rebuild is strong but wrong -- every piece of infrastructure needed (auto-save, AI chat, drag-drop, template engine, notification system) already exists and works.

## Common Pitfalls

### Pitfall 1: Breaking Drag-Drop with Inline Expand
**What goes wrong:** Expanded accordion rows interfere with drag handle detection because the expanded content creates a larger hit target.
**Why it happens:** dnd-kit touch sensors need clear drag handle isolation from tappable content.
**How to avoid:** Keep drag handle {...listeners} {...attributes} on a dedicated GripVertical icon div. Stop propagation on the drag handle click. The expanded content area should not receive drag events.
**Warning signs:** Rows start dragging when user tries to tap an inline field on mobile.

### Pitfall 2: Auto-Save Race Conditions During Inline Editing
**What goes wrong:** User edits key in expanded SongRow, auto-save fires with stale tracks state, overwriting the edit.
**Why it happens:** The updateTrack callback in use-setlist-logic.ts creates a new tracks array, but the 1s debounce timer may still have the old reference.
**How to avoid:** The existing latestRef pattern in use-setlist-logic.ts already handles this correctly -- performSave reads from latestRef.current, not stale closure values. Just ensure inline field onChange calls updateTrack promptly (not on blur only).
**Warning signs:** Edits disappearing after 1-2 seconds.

### Pitfall 3: Inline Keyboard Pushing Content Off Screen on Mobile
**What goes wrong:** When a user taps an input field in the expanded row, the mobile keyboard pushes the field above the viewport.
**Why it happens:** iOS/Android virtual keyboards resize the viewport and scroll behavior varies.
**How to avoid:** Use `scrollIntoView({ behavior: 'smooth', block: 'nearest' })` on the expanded row when it opens. Consider `visualViewport` API for keyboard detection.
**Warning signs:** Users can't see what they're typing on phone.

### Pitfall 4: Template Explosion
**What goes wrong:** 16 templates with copy-paste slot arrays become impossible to maintain.
**Why it happens:** Each template repeats most of the same liturgical structure.
**How to avoid:** Use a base template + variant overlay pattern. FRIDAY_NIGHT_TEMPLATE is the base; Daniel/Karen/Randy variants extend it with onlyFor/skipFor conditionals. Holiday templates stub with a minimal shared skeleton.
**Warning signs:** More than 500 lines of template definitions.

### Pitfall 5: Removing PublishDialog Breaks Existing Setlists
**What goes wrong:** Existing setlists created with isPublic=false become invisible to musicians.
**Why it happens:** Current Firestore security rules and queries may filter on isPublic.
**How to avoid:** Check the existing query in setlist-firebase.ts. Currently `subscribeToPublicSetlists` filters on `isPublic === true`. Need a migration path: either auto-set isPublic=true on all band-leader setlists, or change the musician view query to show setlists where they are in the musicians array regardless of isPublic flag.
**Warning signs:** Musicians can't see setlists after the publish dialog is removed.

### Pitfall 6: Notification Spam on Auto-Save
**What goes wrong:** Every auto-save (1s debounce) triggers a notification to all musicians.
**Why it happens:** If notification logic is tied directly to Firestore writes.
**How to avoid:** Track "significant changes" client-side: notification fires only when tracks are added/removed/reordered, not when metadata (key, tempo, notes) changes. Use a throttle (max 1 notification per 5 minutes) and batch changes.
**Warning signs:** Musicians getting 20+ notifications while Daniel is editing a setlist.

## Code Examples

Verified patterns from existing codebase:

### Existing Auto-Save Pattern (use-setlist-logic.ts)
```typescript
// Source: src/hooks/use-setlist-logic.ts lines 221-312
// Debounced auto-save with ref-based latest values
const latestRef = useRef({ setlistId, name, tracks, isPublic, ... })
useEffect(() => {
    latestRef.current = { setlistId, name, tracks, ... }
}, [setlistId, name, tracks, ...])

const performSave = useCallback(async () => {
    const { setlistId: id, name: n, tracks: t, ... } = latestRef.current
    // ... save to Firestore
}, [canEdit, setlistService, onSave])

useEffect(() => {
    if (!name || !canEdit) return
    hasPendingSave.current = true
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
        hasPendingSave.current = false
        performSave()
    }, 1000)
    // ... cleanup
}, [name, tracks, isPublic, ...])
```

### Existing Template Engine (liturgical-templates.ts)
```typescript
// Source: src/lib/liturgical-templates.ts
// Template slot definition supports all needed fields
export interface TemplateSlot {
    label: string
    type?: TrackType
    queries: string[]
    topics?: string[]
    onlyFor?: string[]     // Rabbi-specific conditional inclusion
    skipOnHoliday?: boolean
    defaultPerformer?: string
    estimatedMinutes?: number
    description?: string
}

// Template engine with Fuse.js matching
export function buildSetlistFromTemplate(
    template: TemplateSlot[],
    library: DriveFile[],
    context: ServiceContext
): SetlistTrack[]
```

### Existing Clone for Next Week (setlist-firebase.ts)
```typescript
// Source: src/lib/setlist-firebase.ts lines 191-221
async cloneForNextWeek(source: Setlist): Promise<string> {
    const sourceDate = toDate(source.eventDate || source.date) || new Date()
    const targetDate = new Date(sourceDate)
    targetDate.setDate(targetDate.getDate() + 7)
    const context = await getFullServiceContext(targetDate)
    const name = generateSetlistName(context)
    // ... creates new Firestore document with clonedFrom reference
}
```

### Existing Chat Edit Action System (chat-store.ts + use-setlist-logic.ts)
```typescript
// Source: src/lib/chat-store.ts
export interface ChatEditAction {
    action: 'add' | 'remove' | 'reorder'
    index?: number
    fromIndex?: number
    toIndex?: number
    title?: string
    fileId?: string
    type?: string
    performer?: string
    estimatedMinutes?: number
}

// Applied in use-setlist-logic.ts handleApplyEdits
// Supports batch edits on mutable copy with undo history
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Modal for every edit (TrackSheet) | Inline accordion expand | Phase 4 (now) | Faster phone editing, fewer taps |
| Explicit publish dialog | Auto-publish on save | Phase 4 (now) | Setlists always live, no "is this current?" confusion |
| Folder browsing (AddSongsModal) | Search-first overlay with Fuse.js | Phase 4 (now) | Faster song finding, fewer taps |
| 3-step creation wizard | Simplified flow (Claude's discretion) | Phase 4 (now) | Faster creation, less friction |
| Legacy setlist-store.ts staging | Direct library-to-editor flow | Phase 4 (now) | Remove localStorage dependency |

**Deprecated/outdated:**
- `setlist-store.ts`: Legacy localStorage buffer for library-to-setlist staging. Remove in this phase.
- `PublishDialog.tsx`: No longer needed for routine use. May keep for edge cases or remove entirely.
- `AddSongsModal.tsx`: Replace with search-first overlay. The folder-browser pattern is too slow for phone-first use.

## Open Questions

1. **Musician visibility query change**
   - What we know: Current subscribeToPublicSetlists filters on isPublic===true. Auto-publish means setlists should be visible to assigned musicians regardless.
   - What's unclear: Whether to change the query to filter on musicians array membership, or to just auto-set isPublic=true for all band-leader setlists.
   - Recommendation: Add a query for "setlists where I am in the musicians array" for the musician view. Keep isPublic for the separate public (no-auth) access feature. These are orthogonal concepts.

2. **Notification trigger definition**
   - What we know: notification-store.ts has `setlist_published` and `setlist_updated` types. These write to `users/{uid}/notifications/`.
   - What's unclear: What counts as "significant change" for EDIT-07 notifications.
   - Recommendation: Trigger on: (a) setlist first created with musicians assigned, (b) tracks added or removed (count change), (c) setlist date changed. Do NOT trigger on: key/tempo/notes edits, reordering. Throttle to max 1 notification per setlist per 5 minutes.

3. **Template data source for rabbi preferences**
   - What we know: Context says rabbi variants use onlyFor/skipFor. Currently only 2 templates exist without rabbi-specific slots.
   - What's unclear: The exact liturgical differences between Daniel/Karen Friday Night vs Randy Friday Night.
   - Recommendation: Build templates with placeholder differences initially. Daniel can refine slot differences in-app over time. The AI chat can learn rabbi preferences from historical setlist data (already implemented in system prompt).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest ^3.2.1 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| EDIT-01 | Template builds setlist with 16 templates | unit | `npx vitest run src/lib/liturgical-templates.test.ts -x` | Yes (extend) |
| EDIT-02 | Duplicate with date advance | unit | `npx vitest run src/lib/setlist-firebase.test.ts -x` | Yes (extend) |
| EDIT-03 | Add songs from search, inline edit key/tempo/lead | unit + integration | `npx vitest run src/components/setlist/__tests__/inline-editing.test.tsx -x` | No -- Wave 0 |
| EDIT-04 | Add/edit non-song items inline | unit | `npx vitest run src/components/setlist/__tests__/flow-item-editing.test.tsx -x` | No -- Wave 0 |
| EDIT-05 | Drag-drop reorder | manual-only | N/A -- dnd-kit behavior requires browser; existing implementation verified | N/A |
| EDIT-06 | Auto-publish on save | unit | `npx vitest run src/lib/setlist-firebase.test.ts -x` | Yes (extend) |
| EDIT-07 | Edit propagation + notifications | unit | `npx vitest run src/lib/notification-store.test.ts -x` | Yes (extend) |
| EDIT-08 | Fast creation workflow | manual-only | N/A -- UX speed test requires real interaction | N/A |
| EDIT-09 | AI auto-fill from template | unit | `npx vitest run src/lib/liturgical-templates.test.ts -x` | Yes (extend) |
| EDIT-10 | AI chat commands for setlist mods | unit | `npx vitest run src/lib/chat-store.test.ts -x` | Yes (extend) |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/components/setlist/__tests__/inline-editing.test.tsx` -- covers EDIT-03 (inline field rendering and update callback)
- [ ] `src/components/setlist/__tests__/flow-item-editing.test.tsx` -- covers EDIT-04 (non-song item inline expand)
- [ ] Extend `src/lib/liturgical-templates.test.ts` -- add tests for new templates (EDIT-01)
- [ ] Extend `src/lib/setlist-firebase.test.ts` -- add tests for auto-publish behavior (EDIT-06)
- [ ] Extend `src/lib/notification-store.test.ts` -- add tests for significant change detection (EDIT-07)

## Sources

### Primary (HIGH confidence)
- Codebase analysis: `src/components/setlist/v2/SetlistEditorV2.tsx` -- full editor with dnd-kit, batch ops, AI integration
- Codebase analysis: `src/hooks/use-setlist-logic.ts` -- state management, auto-save, undo/redo
- Codebase analysis: `src/lib/liturgical-templates.ts` -- template engine with Fuse.js matching
- Codebase analysis: `src/lib/setlist-firebase.ts` -- CRUD with cloneForNextWeek
- Codebase analysis: `src/lib/chat-store.ts` + `src/components/setlist/ChatPanel.tsx` -- AI chat integration
- Codebase analysis: `src/lib/notification-store.ts` -- notification types and Firestore write
- Codebase analysis: `src/components/setlist/v2/SongRow.tsx` -- current collapsed row layout
- Codebase analysis: `src/components/setlist/v2/TrackSheet.tsx` -- current modal editing fields
- Codebase analysis: `package.json` -- all dependencies verified present

### Secondary (MEDIUM confidence)
- dnd-kit documentation: touch sensor activation constraint (delay: 250, tolerance: 5) pattern for distinguishing tap from drag

### Tertiary (LOW confidence)
- None -- all findings are from direct codebase analysis

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use and verified in package.json
- Architecture: HIGH - extending existing components with clear patterns from codebase
- Pitfalls: HIGH - identified from direct code analysis of existing patterns and their edge cases

**Research date:** 2026-03-07
**Valid until:** 2026-04-07 (stable -- all core libraries already in use)
