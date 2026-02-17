# Setlist Builder Redesign — Analysis & Plan

**Date:** February 17, 2026
**Scope:** Complete UX overhaul of `/setlists/[id]` and all editor components
**Goal:** From "feature-packed but unusable" to "a musician can build a setlist in 30 seconds"

---

## Part 1: What's Wrong (Full Audit)

### 🔴 Critical: Footer in the Middle of Setlists

**Root cause:** `SetlistEditor` declares `h-screen flex flex-col` but lives inside `(main)/layout.tsx` which wraps it with:
- `<AppNavigation />` (64px desktop header + mobile tab bar)
- `<main className="flex-1 pb-24 md:pb-0 md:pt-20">` (padding for nav)
- `<Footer />` (desktop only)

The editor tries to be a full-screen experience inside a layout that adds a header, padding, and footer around it. The `h-screen` div is 100vh tall, but it starts 80px down (the `md:pt-20`), so it overflows. The Footer renders *below* the overflowed content — appearing mid-page on long setlists because the scroll isn't properly contained.

**Fix:** The setlist editor page needs to opt out of the standard layout, or the layout needs to detect it and suppress the footer + adjust padding. The editor should own its own viewport.

---

### 🔴 Critical: The Header Has 14 Buttons

For a leader in edit mode on desktop, the 80px header bar contains:

| # | Element | Always? | Notes |
|---|---------|---------|-------|
| 1 | ← Back | Yes | |
| 2 | Setlist name (input or h1) | Yes | |
| 3 | Presence avatars | Conditional | When others are viewing |
| 4 | "Go Live" / "LIVE" toggle | Leaders only | Red pulsing button |
| 5 | 🖨 Print | Desktop only | |
| 6 | 🕐 History | Desktop, leaders | |
| 7 | ↶ Undo | Edit mode | Grouped pill |
| 8 | ↷ Redo | Edit mode | Grouped pill |
| 9 | Edit / Done toggle | Editors | Blue button |
| 10 | ✨ AI toggle | Always | |
| 11 | 🌐 Public/Private badge | Desktop, editors | With confirmation dialog |
| 12 | 🔔 Publish & Notify | Desktop, leaders | Blue CTA |
| 13 | ▶ Perform | Desktop, has setlist | Green button |
| 14 | ⬇ Download/Sync | Desktop, edit mode | |
| 15 | "Saved" text | Desktop, edit mode | |

That's **15 items** fighting for space in a single row. Even with `hidden sm:flex` hiding 10 of them on mobile, the desktop toolbar is a wall of competing buttons. On mobile, you still see: Back, Name, Edit, AI — plus presence avatars and Live toggle if applicable.

**The cognitive cost:** A user landing on this page has to visually parse 10+ icons to find what they need. The primary action (adding songs, reordering) isn't even in the header — it's at the bottom of the scroll area.

---

### 🟡 Major: Edit Mode Toggle Is Confusing

The Edit/Done button creates a two-state UI where:
- **View mode:** Tracks are tappable (plays the song). No drag handles. No inline inputs. No delete buttons.
- **Edit mode:** Drag handles appear. Inline inputs for key/BPM/lead show. Delete buttons show. The title becomes an input. Undo/Redo appear. Download appears. AI auto-opens on desktop.

This means the owner of a setlist has to *toggle a mode* before they can do basic things like reorder songs or change a key. It's a pattern borrowed from iOS's table editing, but it doesn't translate well here because:

1. Most users landing on their own setlist want to edit it
2. The visual difference between modes is dramatic — the whole UI reshuffles
3. The "Done" button doesn't save (auto-save does) — it just hides the editing UI, which is misleading

---

### 🟡 Major: Inline Editing + Modal Editing = Duplicate UI

Each song track in edit mode shows inline inputs for Key, BPM, and Lead. But right-clicking (or long-pressing) opens a context menu with "Edit Details" which opens `TrackDetailsModal` — a full modal with Title, Key, BPM, Lead, Notes, Transpose, and file management.

The inline inputs and the modal edit the same data. A user might:
1. Type a key inline → auto-saves
2. Right-click → Edit Details → see the same key field → change it → hit Save
3. Wonder which one "won"

The inline fields are tiny (56px wide for Key, 56px for BPM) and hard to tap on mobile. The modal is comprehensive but hidden behind a context menu that most users won't discover.

---

### 🟡 Major: Service Flow Items Add Visual Noise

The v5 work added 5 non-song track types: header, reading, prayer, transition, note. Each has:
- A different background color (amber for readings, blue for prayers, gray for transitions/notes)
- A different icon
- Different edit fields (performer, estimated minutes, description)
- A different border color

Mixed into a song list, this creates a quilt of competing visual treatments. A setlist with 12 songs and 8 service flow items has 20 rows in 6 different visual styles. The signal-to-noise ratio is low.

---

### 🟠 Moderate: RunSheetTimeline Is Always Visible

The "Est. 45 min · 12 songs, 5 other items" bar takes up space between the header and the track list on every visit. It's useful when reviewing a complete service but not when building or performing. It's one more thing pushing the actual content down.

---

### 🟠 Moderate: ChatPanel Is a Heavy Sidebar

The AI chat slides in as a 400px fixed sidebar from the right. On mobile it's full-screen. This:
- Covers part of the setlist you're editing
- Has its own header, message list, and input — duplicating the page's chrome
- Auto-opens in edit mode on desktop (per the code: `if (window.matchMedia('(min-width: 768px)').matches) { open() }`)
- Has no awareness of what you're looking at (it sends the full track list but not which track you're focused on)

---

### 🟠 Moderate: 7 Modal Interactions

A full workflow can involve: NamePrompt → AddSongsModal → MatchFileModal → TrackDetailsModal → PrintModal → PublishDialog → SetlistHistoryPanel. Each is a separate overlay. The user bounces between the main list and modal after modal.

---

### 🟢 Minor: Dead Component Still in Tree

`SetlistTimeline.tsx` (the "Set Flow" view we just removed from the JSX) still exists as a file. The `SetlistTimeline` import was removed but the component file remains.

---

## Part 2: The Redesign

### Design Principles

1. **Always editable** — No edit/view mode toggle. If you have permission, everything is directly manipulable. If you don't, everything is read-only. Like Google Docs.

2. **Three rows max above the content** — The header should be: (a) back + title + overflow menu, (b) nothing else. The run sheet time goes *inside* the overflow or the track list footer.

3. **Tap to open, long-press to drag** — Tapping a track opens a bottom sheet with all its details. Long-pressing initiates drag-to-reorder. No tiny inline inputs.

4. **Actions flow from context** — Print, Publish, History, AI, Perform, Live — these live in a single "⋯" overflow menu. The most important one (Perform ▶) gets a floating action button.

5. **Service flow items are lightweight** — Headers are simple divider lines. Readings/prayers/transitions are single-line items with a type badge, not colored cards.

6. **The editor owns its viewport** — No parent footer, no parent padding conflicts.

---

### New Component Architecture

```
SetlistPage (route)
├── SetlistShell (full-viewport container, suppresses layout footer)
│   ├── SetlistTopBar (slim: back + title + status + ⋯ menu)
│   ├── TrackList (scrollable, always-editable)
│   │   ├── SongRow (tap → sheet, long-press → drag)
│   │   ├── DividerRow (headers — just a labeled line)
│   │   └── FlowRow (reading/prayer/transition/note — single line)
│   ├── AddButton (sticky bottom — "+ Add song or item")
│   └── PerformFAB (floating green ▶ button, bottom-right)
├── TrackSheet (bottom sheet for editing a single track's details)
├── OverflowMenu (Print, Publish, History, AI, Live, Download, Visibility)
└── ChatDrawer (replaces sidebar — bottom sheet on mobile, side panel on desktop)
```

---

### A. New TopBar (replaces SetlistHeader — ~60 lines vs current 293)

```
┌─────────────────────────────────────────────────┐
│  ←  Shabbat Morning Feb 21        Saved ✓   ⋯  │
└─────────────────────────────────────────────────┘
```

**Left:** Back arrow
**Center:** Setlist name (tap to edit inline — no mode switch needed). Truncates on mobile.
**Right:** Save status indicator (tiny dot: green = saved, yellow = saving, red = error) + overflow menu (⋯)

**That's it.** One clean row at 56px tall.

The overflow menu (⋯) contains everything else, organized by frequency:

```
⋯ Menu
─────────────────────────
▶  Perform                    ← most important action
─────────────────────────
🖨  Print Gig Packets
🔔  Publish & Notify
📋  Duplicate Setlist
─────────────────────────
🌐  Make Public / Make Private
📅  Set Event Date
📜  Version History
💾  Download for Offline
─────────────────────────
✨  Open AI Assistant
📻  Go Live
─────────────────────────
🗑  Delete Setlist
```

**Undo/Redo:** Move to a toast. When you delete or reorder a track, a toast appears: "Moved 'Mi Chamocha' to position 3 — Undo". This is more intuitive than dedicated buttons because it's contextual.

**Presence avatars:** Move below the title as a subtle line: "Karen and Josh are viewing" — or omit entirely until Live mode is active.

---

### B. New Track Rows (replaces TrackItem + TrackServiceItem — simpler, unified)

#### Song Row (the default)
```
┌───────────────────────────────────────────────┐
│  ≡  Mi Chamocha                    Em  Karen  │
│     ♪ Mi_Chamocha_Friedman.pdf              → │
└───────────────────────────────────────────────┘
```

- **Left edge:** Drag handle (≡) — always visible for editors, touch target is the full left strip
- **Line 1:** Title (bold) + Key badge (if set) + Lead vocalist (if set, subtle italic)
- **Line 2:** Linked file name (small, muted) + chevron (→) indicating "tap for details"
- **Tap anywhere:** Opens TrackSheet (bottom sheet with full details)
- **Tap the file name or chevron:** Goes directly to perform/view the chart
- **No inline inputs, no delete button, no BPM display, no context menu**

If no file is linked, line 2 shows "Tap to link a chart" in muted text.

#### Divider Row (section headers)
```
──────── KABBALAT SHABBAT ────────
```

Just a centered label with horizontal rules. No background color, no icon, no border, no padding. In edit mode, tapping it opens a simple rename prompt. Drag handle appears on long-press.

#### Flow Row (reading, prayer, transition, note)
```
│  📖  Torah Reading · Rabbi · ~15 min         │
```

Single line. Small type icon (📖/🙏/↔/📝) + title + performer + duration. Same tap-to-edit, long-press-to-drag behavior. No colored backgrounds. The type icon is the only visual differentiation.

**Why this is better:** Every row has the same interaction model (tap → details, hold → drag). The visual hierarchy is clear: songs are the primary content (full rows), headers are structural (divider lines), flow items are secondary (compact single lines).

---

### C. TrackSheet (bottom sheet replaces TrackDetailsModal + inline editing)

When you tap any track, a bottom sheet slides up from below:

```
┌─────────────────────────────────────────────────┐
│  ─── (drag handle)                              │
│                                                  │
│  Mi Chamocha                            🗑 Delete│
│                                                  │
│  Key         [Em        ]                        │
│  Lead        [Karen     ]                        │
│  Transpose   [  -  0  +  ]  → Em                │
│  BPM         [120] [Tap Tempo]                   │
│                                                  │
│  Notes                                           │
│  [Add performance notes...               ]      │
│                                                  │
│  Chart    Mi_Chamocha_Friedman.pdf  [Change]     │
│  Audio    (none)                    [Link]       │
│                                                  │
│  [▶ Open Chart]                                  │
└─────────────────────────────────────────────────┘
```

**For non-song items (reading/prayer/transition/note):**
```
┌─────────────────────────────────────────────────┐
│  ─── (drag handle)                              │
│                                                  │
│  Type        [Reading ▾]                        │
│  Title       [Torah Reading    ]                 │
│  Performer   [Rabbi            ]                 │
│  Duration    [15] min                            │
│  Description [Triennial cycle, Year 2...]        │
│                                                  │
│                                        🗑 Delete │
└─────────────────────────────────────────────────┘
```

**Why bottom sheet, not modal:**
- Feels lighter than a centered modal — you can still see the setlist behind it
- Swipe down to dismiss (natural mobile gesture)
- Partial-height by default, swipe up for full details
- Works beautifully on iPad (the primary use case)

---

### D. Add Button (sticky bottom bar)

Instead of the current dashed "Add Item" dropdown at the end of the scroll area (which requires scrolling to the bottom), a sticky bottom bar:

```
┌─────────────────────────────────────────────────┐
│  [+ Add Song]                    [+ Add Item ▾] │
└─────────────────────────────────────────────────┘
```

- **"+ Add Song"** opens AddSongsModal directly (the most common action)
- **"+ Add Item ▾"** opens a small popover: Section Header / Reading / Prayer / Transition / Note
- Always visible at the bottom of the viewport, above the mobile tab bar
- Disappears during scroll-down (reappears on scroll-up) to maximize content space

---

### E. Perform FAB (floating action button)

A green ▶ circle in the bottom-right corner, always visible:

```
                                          ┌────┐
                                          │ ▶  │
                                          └────┘
```

One tap enters full-screen performance mode. This is the #1 thing musicians need — it should be the most prominent, most reachable element on the page.

---

### F. ChatDrawer (replaces ChatPanel sidebar)

Instead of a fixed sidebar that covers the setlist:
- **Mobile:** Bottom sheet that slides up, like Messages. User types a message, AI responds, commands are applied to the setlist behind the sheet. User can peek at the setlist by dragging the sheet down.
- **Desktop:** Right panel that pushes the track list narrower (not overlays it). Or a bottom panel like VS Code's terminal.

The AI chat should **not** auto-open. It's available from the overflow menu when you want it.

---

### G. Layout Fix (footer issue)

Two options:

**Option A (preferred): Move setlist editor out of (main) layout**
Create `src/app/setlists/[id]/page.tsx` as a route *outside* the `(main)` group. This means no AppNavigation, no Footer. The editor provides its own back button and is a self-contained full-screen experience. The setlist *dashboard* (`/setlists` list view) stays in `(main)`.

**Option B: Conditional footer suppression**
Add a `suppressFooter` context or check the route in layout.tsx. Less clean but doesn't require moving files.

---

## Part 3: Implementation Plan

### Files to Create (New)
| File | Purpose | Est. Lines |
|------|---------|-----------|
| `src/app/setlists/[id]/page.tsx` | Standalone route outside (main) | 80 |
| `src/app/setlists/[id]/layout.tsx` | Minimal layout (no nav/footer) | 15 |
| `src/components/setlist/v2/SetlistTopBar.tsx` | Slim header with overflow | 80 |
| `src/components/setlist/v2/TrackList.tsx` | Scrollable track container | 60 |
| `src/components/setlist/v2/SongRow.tsx` | Song track row | 80 |
| `src/components/setlist/v2/DividerRow.tsx` | Section header divider | 30 |
| `src/components/setlist/v2/FlowRow.tsx` | Reading/prayer/transition/note | 50 |
| `src/components/setlist/v2/TrackSheet.tsx` | Bottom sheet for track details | 200 |
| `src/components/setlist/v2/AddBar.tsx` | Sticky add button bar | 60 |
| `src/components/setlist/v2/OverflowMenu.tsx` | All secondary actions | 120 |
| `src/components/setlist/v2/PerformFAB.tsx` | Green floating perform button | 25 |

**Total new: ~800 lines across 11 files**

### Files to Delete (After Migration)
| File | Lines | Why |
|------|-------|-----|
| `SetlistTimeline.tsx` | 55 | Already removed from JSX, dead code |
| `SetlistEditor.tsx` | 356 | Replaced by new architecture |
| `editor/SetlistHeader.tsx` | 293 | Replaced by SetlistTopBar + OverflowMenu |
| `editor/TrackItem.tsx` | 361 | Replaced by SongRow |
| `editor/TrackServiceItem.tsx` | 293 | Replaced by DividerRow + FlowRow |
| `modals/TrackDetailsModal.tsx` | 251 | Replaced by TrackSheet |

**Total removed: ~1,609 lines across 6 files**

**Net: ~800 new lines replacing ~1,609 old lines = ~50% reduction**

### Files to Keep (Unchanged or Minor Edits)
| File | Notes |
|------|-------|
| `PrintModal.tsx` | Keep — opens from overflow menu |
| `PublishDialog.tsx` | Keep — opens from overflow menu |
| `SetlistHistoryPanel.tsx` | Keep — opens from overflow menu |
| `ChatPanel.tsx` | Refactor to bottom sheet but same logic |
| `modals/AddSongsModal.tsx` | Keep — opens from Add bar |
| `modals/MatchFileModal.tsx` | Keep — opens from TrackSheet |
| `modals/NamePrompt.tsx` | Keep for new setlist creation |
| `RunSheetTimeline.tsx` | Move inside overflow menu as info display |
| `use-setlist-logic.ts` | Keep — remove edit mode toggle, keep everything else |

### Migration Strategy

1. Build the v2 components in `src/components/setlist/v2/` alongside the existing ones
2. Create the standalone route at `src/app/setlists/[id]/` (outside `(main)`)
3. Wire up the v2 components in the new route
4. Test thoroughly
5. Delete old `src/app/(main)/setlists/[id]/page.tsx` and redirect
6. Delete old components

This means zero disruption during development — the old editor still works at the old route until we switch over.

---

## Part 4: Questions Before Building

1. **The Perform FAB vs. header button:** Are you OK with the floating green button approach? It means Perform is always one tap away but takes up a small corner of screen real estate permanently.

2. **Bottom sheet vs. modal for track details:** The bottom sheet is more natural on iPad/mobile but slightly unconventional on desktop. Would you prefer a modal on desktop and bottom sheet on mobile, or bottom sheet everywhere?

3. **Service flow items in the redesign:** My proposal makes them much more compact (single line). This means readings/prayers lose their colored backgrounds and detailed edit fields are only in the sheet. Is that OK, or do you want readings/prayers to remain visually distinct from each other?

4. **AI chat auto-open:** Currently it auto-opens in edit mode on desktop. I'm proposing to kill that — AI only opens when you explicitly ask for it. Agree?
