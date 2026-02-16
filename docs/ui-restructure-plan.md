# CentralReform UI/UX Restructure Plan

## Philosophy

Settings is for **me** (my account, my instrument, my preferences).  
Admin is for **the system** (sync, migration, users, monitor, maintenance).  
Everything else is for **the music** (setlists, library, performing, practicing).

---

## 1. Navigation Restructure

### Mobile Tab Bar (5 tabs max for thumb reach)

| Tab | Icon | Who sees it | Notes |
|-----|------|-------------|-------|
| Home | Home | Everyone | Dashboard with upcoming setlists |
| Setlists | ListMusic | Everyone | Browse/create setlists |
| Library | Library | Members+ | Browse charts, practice audio |
| Monitor | Radio | Authorized only | Personal monitor mixer |
| Settings | Settings | Everyone | Personal settings + admin link |

**Changes:**
- Remove "Audio" as standalone tab → absorbed into Library
- "Monitor" only appears for authorized users (already done)
- No "Admin" tab — accessed via Settings card or AI

### Desktop Header Nav

| Link | Who sees it | Notes |
|------|-------------|-------|
| Home | Everyone | |
| Setlists | Everyone | Drop "Public" prefix — it's just "Setlists" |
| Library | Members+ | |
| Monitor | Authorized | |
| Admin | Admins only | NEW — direct link to /admin |

**Changes:**
- "Public Setlists" → "Setlists" (matches mobile)
- Remove "Audio" from nav (lives inside Library now)
- Add "Admin" link (admin-only, replaces digging through Settings)
- Bell icon → remove (it's fake notifications, actually sync status)
- AI button → keep but move to a floating action or setlist-contextual position
- Clean up dead guest sign-in code and stale comments

---

## 2. Page Restructure

### `/settings` — Personal Only

**Section: Account**
- Profile card (photo, name, email, role badge)
- Appearance (light/dark/system toggle)

**Section: My Instrument**
- MusicianProfileSettings component (instrument, transposition, capo)

**Section: About**
- Version info, changelog link
- Log out button

**What moves OUT:**
- User Management → `/admin`
- Monitor Admin → `/admin`  
- Library Sync → `/admin`
- Firebase Migration → `/admin`
- AI Enrichment → `/admin`
- Chord Cache → `/admin`
- Prune Manager → `/admin`

Settings becomes clean and personal. A musician opens it, sets their instrument, picks dark mode, done.

### `/admin` — Dedicated Admin Dashboard (admin-only)

**Section: People**
- User Management (approve, assign roles) — inline, not a sub-page
- Monitor Bus Assignments (who gets which bus)
- Monitor Authorized Users (who can see the Monitor tab)

**Section: Sound**
- X32 Connection status (live: green dot + model name, or red dot + scan button)
- Bridge server status (connected clients count)
- Scan for X32 button
- Bus configuration (which buses are monitors)
- Bridge URL display/edit

**Section: Library & Data**
- Library Sync (sync from Google Drive)
- AI Enrichment (extract keys/BPM)
- Chord Cache (clear/rebuild)
- Firebase Migration (show progress, only if not 100% done)
- Prune Manager (clean orphaned data)

**Section: System**
- App version + build info
- Changelog (inline or expandable, not a separate page)
- Export Data button

**Design:** Single scrollable page with clear section headers. Each tool has a button + status indicator. No sub-pages needed — everything is right there.

### `/admin` access pattern
- Admin-only route (redirect non-admins to `/`)
- Linked from: Settings page (card at bottom), Desktop nav, AI assistant
- `/admin/page.tsx` replaces the current redirect at this route
- `/monitor/admin` → REMOVE, fold into `/admin` Sound section
- `/settings/users` → REMOVE, fold into `/admin` People section
- `/changelog` → REMOVE as standalone page, fold into `/admin` System section

### `/library` — Add Practice Audio

The Library page already shows charts. Add a secondary mode or tab:

**Option A: Audio toggle per song**
When viewing a song in the library, if it has an audio file, show a play button inline. Tapping it opens a mini player (practice mode). This keeps browsing and practicing in one place.

**Option B: Filter/view toggle**
Add a "Practice" filter that shows only songs with audio. Same page, just filtered.

Recommendation: **Option A** — simplest, no new pages, audio is contextual to the chart you're looking at.

---

## 3. AI Assistant Improvements

### Contextual Placement
- **In setlist editor:** Floating button or panel for "add a song", "suggest order", "what key is..."
- **In admin (for admins):** Can execute admin commands via natural language
- **Global:** Available via keyboard shortcut or header icon, but not always visible

### Admin Commands (stretch goal)
The AI should be able to:
- "Are there pending users?" → queries Firestore, answers
- "Make Bryn an admin" → confirms, then updates role
- "Assign bus 4 to Daniel" → updates monitor config
- "Run library sync" → triggers the API
- "What's the X32 status?" → checks bridge /status endpoint

This requires tool-use / function-calling integration. Can be built incrementally.

---

## 4. Monitor Ease-of-Use Improvements

### Performance Toolbar Quick Monitor (CRITICAL)

**Problem:** A musician needs "more me in the wedge" mid-service. Currently they'd 
have to leave the perform page, navigate to /monitor, adjust, navigate back, find 
their place. That's 15+ seconds and total flow disruption.

**Solution:** A slide-up monitor panel in the PerformanceToolbar, identical UX to 
the existing Tuner and Transposer popovers.

**UI:** A speaker/radio icon button appears in the toolbar tools row — ONLY if the 
user has monitor access AND the bridge is connected. Tapping it opens a popover panel:

```
┌──────────────────────────────────┐
│  My Monitor — Wedge L            │
│                                  │
│  🔊 Master       ████████░░  0dB │
│  ──────────────────────────────  │
│  ★ Daniel Guitar  ████░░░░  -8dB │
│  ★ Drums          ███░░░░░ -12dB │
│    Karen Vocal    ██████░░  -3dB │
│    Keys           █████░░░  -5dB │
│    Bass           ████░░░░  -8dB │
│                                  │
│  ● Connected          ★ = pinned │
└──────────────────────────────────┘
```

**Behavior:**
- Shows master fader + all channels with non-zero send level
- Pinned channels (★) always visible even if level drops to zero
- Tap the star to pin/unpin — saved per-user in Firestore
- Same WebSocket connection as /monitor page (shared via store)
- Changes take effect instantly (< 50ms to X32)
- Panel dismisses on outside tap — back to chart immediately

**Implementation:**
- New component: `src/components/monitor/QuickMonitorPanel.tsx`
- Reuses FaderStrip component (already built)
- Reuses useMonitorStore (already built)  
- Connects to bridge via same X32WSClient singleton
- Pinned channels stored in Firestore: `users/{uid}/monitorPrefs/pinned`
- PerformanceToolbar adds the button conditionally (useMonitorAccess hook)

### Auto-setup Flow
When an admin first opens the Sound section in `/admin`:
1. If no bridge URL configured → show setup wizard
2. "Step 1: Start the bridge server on the production PC"
3. "Step 2: Enter the bridge URL or let us scan" → auto-fills on scan success
4. "Step 3: Select which buses are monitors"
5. "Step 4: Assign musicians to buses"

### Status Visibility
- Admin dashboard shows live X32 connection status (green/red dot)
- Admin dashboard shows connected iPad count
- Musicians see their bus assignment on the Home dashboard ("Your monitor: Bus 1 — Wedge L")

### Self-Service
- Musicians can self-select an unassigned bus (already built)
- Musicians see "No bus assigned" with clear instructions (already built)

---

## 5. Cleanup Checklist

| Item | Action |
|------|--------|
| `/admin/page.tsx` (redirect to settings) | Replace with real admin dashboard |
| `/settings/users/page.tsx` | Remove — Users section moves into `/admin` |
| `/monitor/admin/page.tsx` | Remove — Sound section moves into `/admin` |
| `/changelog/page.tsx` | Remove — Changelog folds into `/admin` System section |
| Desktop header bell icon | Remove (fake notifications) |
| Desktop header dead guest code | Remove |
| Desktop header stale comments | Remove |
| "Public Setlists" label | → "Setlists" |
| Settings admin cards (6 cards) | Remove from Settings, rebuild in `/admin` |
| Audio nav link (desktop) | Remove |
| `/audio/page.tsx` | Keep route working but remove from nav. Long-term: integrate into Library |

---

## 6. Implementation Order

### Phase 1: Admin Dashboard (this session)
1. Build `/admin/page.tsx` with all sections
2. Move User Management inline (from `/settings/users`)
3. Move Monitor Admin inline (from `/monitor/admin`)
4. Move all admin tools from Settings
5. Clean Settings page to personal-only
6. Update nav (add Admin link for admins, fix "Setlists" label)

### Phase 2: Desktop Header Cleanup + Quick Monitor (this session)
1. Remove bell icon / sync status popover
2. Remove dead guest code
3. Remove Audio link
4. Add Admin link (admin-only)
5. Clean up AI button positioning
6. Build QuickMonitorPanel component
7. Add monitor button to PerformanceToolbar (conditional on access + connection)
8. Add pinned channels with Firestore persistence

### Phase 3: Library + Audio Integration (next session)
1. Add inline audio playback to LibraryFileRow
2. Remove Audio from desktop nav

### Phase 4: AI Admin Commands (future)
1. Define admin tool functions
2. Wire AI to Firestore queries and admin APIs
3. Test natural language admin operations

---

## File Changes Summary

### New Files
- `src/app/(main)/admin/page.tsx` — Full admin dashboard (replaces redirect)
- `src/components/monitor/QuickMonitorPanel.tsx` — Slide-up monitor for perform toolbar

### Modified Files
- `src/app/(main)/settings/page.tsx` — Strip admin sections, personal only
- `src/components/nav/DesktopHeader.tsx` — Add Admin link, remove Audio/bell, fix labels
- `src/components/nav/MobileTabBar.tsx` — Verify labels match
- `src/components/performance/PerformanceToolbar.tsx` — Add monitor quick-access button
- `src/lib/monitor-store.ts` — Add pinned channels support
- `firestore.rules` — Add monitorPrefs subcollection rule

### Removed Files
- `src/app/(main)/settings/users/page.tsx` — Folded into /admin
- `src/app/(main)/monitor/admin/page.tsx` — Folded into /admin
- `src/app/(main)/changelog/page.tsx` — Folded into /admin

### Preserved (routes still work)
- `/audio` — Page stays, just not in nav
- `/monitor` — Musician view unchanged
