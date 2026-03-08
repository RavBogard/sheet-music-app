# Phase 4: Setlist Editor - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Daniel can build a complete service — songs, readings, prayers, keys, tempos, leads — faster than a spreadsheet, using templates, duplication, and AI assistance. Phone-first editing (not keyboard-first). Requirements: EDIT-01 through EDIT-10.

**Key context:** SetlistEditorV2 already exists with drag-drop (dnd-kit), AI chat (Gemini), 2 of 16 liturgical templates, library search, publish dialog, and a creation wizard. Phase 4 is about completing and polishing the editor to hit the "faster than a spreadsheet" bar.

</domain>

<decisions>
## Implementation Decisions

### Inline editing UX
- Phone-first editing — not keyboard-friendly, touch-friendly
- Tap a song row to expand inline (accordion pattern) — shows editable key, tempo, lead, notes fields
- No modal for common edits — TrackSheet modal may remain for advanced/rare fields but primary editing is inline
- Collapsed song row shows: Title + Key + Lead musician (tempo visible only when expanded)
- Non-song items (readings, prayers, transitions) also expand inline for title/description editing

### Adding songs
- Search-first overlay: tap '+' opens a search bar immediately. Type a few letters, see matching songs from library. Tap to add
- No folder browsing by default — search is the primary path. Library browser available as fallback
- Smart song suggestions (existing song-suggestions.ts) can inform search results

### Song replacement (swap flow)
- Tap song row to expand → 'Replace' button available in expanded view
- Replace opens the same search-first overlay
- New song inherits the slot position in the setlist
- Single flow for swapping: expand → replace → search → tap new song

### Adding non-song items
- Claude's Discretion: best approach for adding readings/prayers/transitions based on existing AddBar component and mobile UX

### Template completion
- Build all 7 regular templates with full liturgical slot structures:
  1. Daniel/Karen Friday Night
  2. Randy Friday Night
  3. Shir Shabbat
  4. Daniel/Karen Saturday Morning
  5. Randy Saturday Morning
  6. Bnei Mitzvah Saturday
  7. Havdalah/Afternoon Bnei Mitzvah
- Stub 9 holiday templates with basic structures (can be refined later)
- Rabbi variants use conditional slots (onlyFor/skipFor) — mostly same structure, minor tweaks per rabbi
- Currently 2 templates exist (Friday Night: 19 slots, Shabbat Morning: 24 slots) — extend, don't rebuild

### Template auto-fill
- One-tap auto-fill: pick a template → instantly get a pre-filled setlist with matched songs from library
- Fuse.js fuzzy matching (existing) powers the library-to-slot matching
- Unmatched slots show as placeholders — user fills manually or via AI
- AI fills templates automatically: "Create a Daniel Friday for March 14" → AI picks template + fills songs using library + usage history + rabbi preferences
- Template picker + AI chat are complementary: both can trigger the same auto-fill pipeline

### Duplicate-and-tweak workflow
- Smart duplicate with date advance: one tap "Duplicate for next week" → copies setlist, auto-advances date by 7 days, auto-generates name (e.g., "Friday Night - March 14"), opens editor immediately
- Duplicated setlist opens at top, ready to scan — no auto-scroll or highlight magic
- No rotation suggestions in the UI — if Daniel wants rotation advice, he asks the AI chat (usage history context already available)
- "Duplicate for next week" should be prominent and accessible from the dashboard

### Creation flow
- Claude's Discretion: whether to keep the 3-step wizard, simplify to 2-step, or go single-page. Phone-first UX is the constraint.
- Dashboard stays as-is — no redesign needed. Just ensure "Duplicate for next week" is prominent

### Publishing and draft state
- No drafts — every setlist is always live and visible to assigned musicians immediately
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

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `SetlistEditorV2.tsx`: Full editor with DndContext, SortableContext, track CRUD — extend, don't replace
- `SongRow.tsx`, `FlowRow.tsx`, `DividerRow.tsx`: Existing row components — add accordion expand behavior
- `TrackSheet.tsx`: Modal editor with all fields — may become fallback for advanced editing
- `AddSongsModal.tsx`: Library file picker — replace with search-first overlay or adapt
- `DuplicateSetlistDialog.tsx`: Existing duplicate — enhance with date auto-advance
- `ChatPanel.tsx`: AI chat with Gemini — already handles CREATE_SETLIST, ADD_TO_SETLIST commands
- `liturgical-templates.ts`: Template engine with Fuse.js matching — extend with 14 more templates
- `song-suggestions.ts` + `song-usage.ts`: Usage tracking and rotation — feed into AI chat context
- `PublishDialog.tsx`: Current publish flow — simplify per auto-publish decision
- `CreationWizard.tsx`: 3-step wizard — may be simplified or replaced
- `SwipeToDelete.tsx`: Mobile swipe-to-delete with dnd-kit integration — keep
- `use-setlist-logic.ts`: Main editor state management — extend with inline editing
- `use-creation-wizard.ts`: Wizard state — may be simplified
- `use-setlist-dashboard.ts`: Dashboard state with duplicate/transfer — enhance duplicate

### Established Patterns
- dnd-kit for drag-and-drop (closestCenter collision, vertical list strategy, mouse/touch/keyboard sensors)
- Zustand stores for client state, Firestore subscriptions for real-time data
- Tailwind CSS v4 + shadcn/ui (Radix primitives) for all UI
- Gemini 3 Flash for AI chat — streaming SSE responses with structured JSON commands
- Fuse.js for fuzzy search (template matching and library search)
- Zod schemas for Firestore data validation
- Dynamic imports for heavy components (next/dynamic, SSR: false)

### Integration Points
- `/setlists/[id]` route: Editor page — primary surface for Phase 4 changes
- `/setlists` route: Dashboard page — add prominent "Duplicate for next week" action
- `/api/chat/route.ts`: AI endpoint — enhance template auto-fill commands
- `setlist-firebase.ts`: CRUD operations — add auto-publish behavior
- `SetlistTrack` type: Already supports all needed fields (title, key, bpm, leadMusician, type, fileId, transposition, description, performer, estimatedMinutes)
- `setlist-store.ts`: Legacy localStorage buffer — marked for removal (Phase 1 code audit)

</code_context>

<specifics>
## Specific Ideas

- Phone-first: Daniel often creates setlists on his phone, not at a computer. Every interaction should be optimized for thumb-tapping, not keyboard shortcuts
- "Faster than a spreadsheet" means: duplicate last week → swap 2-3 songs → done in under 2 minutes
- Templates should feel like a starting point that AI fills intelligently, not a blank form to fill manually
- The AI chat is the power-user path — Daniel can say "create a Daniel Friday for March 14" and get a fully populated setlist
- Always live means musicians never wonder "is this the latest version?" — what they see is always current

</specifics>

<deferred>
## Deferred Ideas

- Template builder/editor tool for creating custom templates in-app — future enhancement
- AI-powered duplicate ("duplicate last week but swap X for Y" in one sentence) — could be added to AI chat later
- Rotation matrix view (SetlistMatrixView.tsx exists but is cut from v2 scope)
- Real-time collaborative editing — out of scope (one person builds setlists)

</deferred>

---

*Phase: 04-setlist-editor*
*Context gathered: 2026-03-07*
