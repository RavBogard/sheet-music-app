# CentralReform 3.0 — Implementation Plan

**Created:** February 16, 2026  
**Current Version:** 2.2.0 (220 commits)  
**Codebase:** 190 files, 20,407 lines  

---

## Executive Summary

This plan covers 31 improvements across 6 categories, organized into 5 implementation phases.
Each phase is designed to be independently shippable and builds on the previous.

**Phase A** — Cleanup & Foundation (backend hygiene, nav fixes, quick UI wins)  
**Phase B** — Quality of Life (onboarding, loading states, printing, file rows)  
**Phase C** — Performance Mode Overhaul (back gesture, hand-off, keyboard shortcuts, guided setup)  
**Phase D** — Setlist Collaboration & Annotations (the two biggest features)  
**Phase E** — Multi-Congregation Abstraction (white-label groundwork)  

Estimated total: ~3,500–4,500 new/modified lines across ~60 files.

---

## Phase A: Cleanup & Foundation

*Goal: Eliminate dead code, fix inconsistencies, harden the backend. Zero new features — pure quality.*

### A1. Dead Code Removal [Backend #1]

**Problem:** 6 orphaned components, ~9 unused API routes, 1 orphaned audio component = ~1,200 lines of dead weight.

**Delete — Orphaned Components:**
| File | Reason |
|------|--------|
| `src/components/admin/PruneManager.tsx` | Logic moved inline to `/admin` page |
| `src/components/audio/AudioLibrary.tsx` | Replaced by Library audio tab integration |
| `src/components/auth/ProtectedLayout.tsx` | Never imported — auth handled by `auth-context` |
| `src/components/dashboard/DashboardChatPrompt.tsx` | Never imported — chat uses `ChatPanel` |
| `src/components/network-status.tsx` | Never imported — online status is inline in header |
| `src/components/setlist/setlist-manager.tsx` | Never imported — logic lives in `use-setlist-logic.ts` |
| `src/components/settings/ExportDataButton.tsx` | Never imported — export route itself is also unused |

**Delete — Unused API Routes:**
| Route | Reason |
|-------|--------|
| `/api/admin/bootstrap/route.ts` | One-time setup, already run, no client calls |
| `/api/admin/migrate-setlists/route.ts` | Legacy migration, complete, no client calls |
| `/api/cron/enrich/route.ts` | Cron endpoint never wired up (enrichment is manual) |
| `/api/cron/sync/route.ts` | Cron endpoint never wired up (sync is manual) |
| `/api/diagnose/route.ts` | Debug endpoint, no client calls |
| `/api/drive/doc/[fileId]/route.ts` | Superseded by `library/file/[id]` |
| `/api/export/route.ts` | Never wired to UI, no try/catch |
| `/api/library/enrich/route.ts` | Duplicate — enrichment runs via `/api/admin/enrich` |
| `/api/library/save-corrections/route.ts` | Never called from client |

**Impact:** ~1,200 lines removed, cleaner imports, smaller bundle.

---

### A2. API Auth Wrapper [Backend #2]

**Problem:** Auth verification varies across 28 API routes — some use `api-middleware.ts`, some do inline checks, 3 have no try/catch at all.

**Solution:** Create `src/lib/api-auth.ts`:

```typescript
type Role = 'admin' | 'leader' | 'member' | 'any'

export function withAuth(handler: AuthedHandler, options?: { role?: Role }) {
    return async (request: Request, context?: any) => {
        try {
            const token = request.headers.get('Authorization')?.replace('Bearer ', '')
            if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
            
            const decoded = await adminAuth.verifyIdToken(token)
            if (options?.role && options.role !== 'any') {
                const userDoc = await getDoc(doc(db, 'users', decoded.uid))
                const userRole = userDoc.data()?.role
                // Check role hierarchy: admin > leader > member
                if (!meetsRoleRequirement(userRole, options.role)) {
                    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
                }
            }
            return await handler(request, decoded, context)
        } catch (error) {
            console.error('API Error:', error)
            return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
        }
    }
}
```

**Migration:** Refactor all admin routes to use `withAuth(handler, { role: 'admin' })`. 
Non-admin routes use `withAuth(handler, { role: 'member' })`.
Every route gets automatic try/catch + auth + role checking.

**Files changed:** All 28 `route.ts` files (most are mechanical find-replace).

---

### A3. Console → Logger Migration [Backend #3]

**Problem:** 125 `console.*` statements in production code. `src/lib/logger.ts` exists but isn't used consistently.

**Solution:**
1. Add ESLint rule: `no-console: 'warn'` (or `error` with `allow: ['warn', 'error']` during transition)
2. Bulk find-replace:
   - `console.log(` → `logger.info(`
   - `console.warn(` → `logger.warn(`
   - `console.error(` → `logger.error(`
3. Ensure `logger` suppresses `info` in production builds (already does via `NODE_ENV` check)

**Files changed:** ~40 files, mechanical replacement.

---

### A4. Navigation Consistency Fix [Interface #1, #2, #3]

**Problem (three issues combined):**
- Mobile Library tab shows for unauthenticated users but the page blocks them
- No Admin access in mobile nav  
- Desktop and mobile nav order differs, asymmetric features

**Solution — Unified Nav Model:**

| Tab/Link | Desktop Header | Mobile Tab Bar | Condition |
|----------|---------------|----------------|-----------|
| Home | ✅ | ✅ | Always |
| Setlists | ✅ | ✅ | Always |
| Library | ✅ | ✅ | `isMember` |
| Monitor | ✅ | ✅ | `hasMonitorAccess` |
| Admin | ✅ (nav link) | ✅ (replaces Library slot) | `isAdmin` |
| Settings | Profile dropdown | ✅ | Always |

**Mobile Tab Bar changes:**
```typescript
const navItems = [
    { label: "Home",     href: "/",         icon: Home,     show: true },
    { label: "Setlists", href: "/setlists", icon: ListMusic, show: true },
    { label: "Library",  href: "/library",  icon: Library,  show: isMember && !isAdmin },
    { label: "Admin",    href: "/admin",    icon: ShieldAlert, show: isAdmin },
    { label: "Monitor",  href: "/monitor",  icon: Radio,    show: hasMonitorAccess },
    { label: "Library",  href: "/library",  icon: Library,  show: isAdmin },  // admins get it too, just after admin
    { label: "Settings", href: "/settings", icon: Settings, show: true },
]
// Filter to show: true, then take first 5 (so admins get Home, Setlists, Admin, Library, Settings — Monitor in admin dashboard + quick panel)
// Non-admins with monitor: Home, Setlists, Library, Monitor, Settings
// Regular members: Home, Setlists, Library, Settings (4 tabs)
```

Actually, simpler approach — keep 5 tabs max, dynamic:

```
Everyone:          Home | Setlists | Library | [empty] | Settings
Members:           Home | Setlists | Library | [empty] | Settings
Monitor users:     Home | Setlists | Library | Monitor | Settings
Admins:            Home | Setlists | Library | Admin   | Settings
Admins + Monitor:  Home | Setlists | Admin   | Monitor | Settings
```

The key change: Library only shows for `isMember`. Admin replaces Library's "4th slot" for admins (admins access Library via desktop or /library URL). If admin has monitor too, Library moves to desktop-only.

**Note:** This is the trickiest part — mobile tab bar has 5 slots max and 6 potential items. The priority system ensures the most important items for each role are visible. Admin wins the tab slot over Monitor for admin users; Monitor is accessible via QuickMonitorPanel in performance toolbar + direct URL. Library is always accessible via URL and desktop nav for admins who need both Admin and Monitor tabs.

**Decision:** Admin gets the tab, Monitor via QuickMonitorPanel + URL. ✅ Confirmed.

**Files changed:**
- `src/components/nav/MobileTabBar.tsx` — Conditional tab logic
- `src/components/nav/DesktopHeader.tsx` — Ensure Library gated to `isMember`

---

### A5. Theme Token Consistency [UI #4]

**Problem:** `Tuner.tsx`, `AudioPlayer.tsx`, `QuickMonitorPanel.tsx`, `FaderStrip.tsx`, and `PerformanceToolbar.tsx` use hardcoded `zinc-*` / `bg-black` colors that won't adapt to light theme.

**Decision needed:** These components are ALL used in performance context (dark stage environment). Two approaches:

**Option A (recommended): Explicitly scope as "always dark"**
- Wrap these components in a `<div className="dark">` container so they inherit dark theme tokens
- Replace `bg-zinc-900` → `bg-card`, `text-zinc-400` → `text-muted-foreground` etc.
- Performance toolbar already forces dark — just make it consistent
- QuickMonitorPanel appears inside a dark popover in the toolbar, so this is natural

**Option B: Make them fully theme-aware**
- Would require light-mode designs for faders, tuner, etc.
- Unnecessary — these are literally used on a dark stage

**Implementation:**
- Audit all `zinc-*`, `bg-black`, hardcoded color classes in the 5 files above
- For components ONLY used in perform context: wrap parent in `<div className="dark">`
- For `AudioPlayer` (used in Library, which CAN be light): convert to semantic tokens

**Files changed:** ~5 component files, mostly class name replacements.

---

### A6. Admin Dashboard Collapsible Sections [UI #1]

**Problem:** Admin page is 567 lines rendered as one long scroll. On mobile, finding the section you need requires scrolling past everything else.

**Solution:** Collapsible accordion sections with smart defaults.

```typescript
// Sections auto-expand based on what needs attention:
const defaultOpen = useMemo(() => {
    const open: string[] = []
    if (pendingCount > 0) open.push("people")      // Users need approval
    if (!monitorLoading && !bridgeUrl) open.push("sound")  // Not configured yet
    return open.length > 0 ? open : ["people"]      // Default to People if nothing urgent
}, [pendingCount, monitorLoading, bridgeUrl])
```

Each section header becomes a clickable toggle:
```
▾ People (2 pending)          ← expanded, has badge
▸ Sound System                ← collapsed
▸ Library & Data              ← collapsed  
▸ System                      ← collapsed
```

**Implementation:** Use Radix `Accordion` (already have Radix installed) or a simple `useState<string[]>` for open sections.

**Files changed:** `src/app/(main)/admin/page.tsx` — Wrap each section in collapsible container.

---

### A7. Empty State Illustrations [UI #5]

**Problem:** Empty states throughout use icon + text but feel clinical.

**Solution:** Create 5 small SVG illustration components for the key empty states:

| Context | Illustration | Current |
|---------|-------------|---------|
| No setlists | Music stand with sheet music floating away | `ListMusic` icon |
| Empty folder | Open folder with dotted outline | `FolderOpen` icon |
| No search results | Magnifying glass with "?" | `Search` icon |
| No audio files | Headphones with music notes | `Music` icon |
| Pending account | Clock with checkmark approaching | Text only |

**Implementation:** Create `src/components/ui/illustrations/` directory with simple SVG React components. Each is a ~20-line inline SVG with theme-aware stroke colors (`stroke="currentColor"` with opacity variants). Wire into existing `EmptyState` components.

**Files changed:** 
- New: `src/components/ui/illustrations/*.tsx` (5 files)
- Modified: `EmptyState` usage sites (~5 files, swapping `icon` prop for `illustration`)

---

## Phase B: Quality of Life

*Goal: Fix the most friction-heavy user journeys — first login, song loading, and printing.*

### B1. Onboarding Flow [UX #1]

**Problem:** New users sign in, get "Pending" status, and see an empty homepage with no explanation.

**Solution:** Three-state onboarding system:

**State 1: Pending User (pre-approval)**
Replace the current empty homepage for pending users with a dedicated welcome card:

```
┌─────────────────────────────────────────┐
│  🎵 Welcome to CRC Music!              │
│                                          │
│  Your account is being reviewed.         │
│  An admin will approve you shortly.      │
│                                          │
│  While you wait, you can:                │
│  • Browse public setlists                │
│  • Set up your instrument profile →      │
│                                          │
│  ┌─────────────────────────────────┐    │
│  │ 🎸 Set Up My Instrument         │    │
│  └─────────────────────────────────┘    │
└─────────────────────────────────────────┘
```

Tapping "Set Up My Instrument" navigates to Settings (which is accessible even when pending).

**State 2: First-time approved member (no instrument profile)**
After approval, first visit shows a one-time prompt:

```
┌─────────────────────────────────────────┐
│  ✅ You're approved! Let's get set up.  │
│                                          │
│  Step 1: What do you play?              │
│  [MusicianProfileSettings inline]        │
│                                          │
│  Step 2: Done! Here's what you can do:  │
│  📚 Library — all your charts           │
│  📋 Setlists — build & share sets       │
│  🎭 Perform — full-screen stage mode    │
│                                          │
│  [Go to Library →]  [Browse Setlists →] │
└─────────────────────────────────────────┘
```

**State 3: Returning member (has profile)**
Normal homepage as-is.

**Tracking:** Add `onboardingComplete: boolean` to user profile doc. Set to `true` when user dismisses the onboarding or completes instrument setup. Check this field on homepage to decide which state to show.

**Files changed:**
- `src/app/(main)/page.tsx` — Add onboarding state checks + inline onboarding UI
- `src/lib/users-firebase.ts` — Add `onboardingComplete` field
- `src/components/settings/MusicianProfileSettings.tsx` — Expose as embeddable (may already work)

---

### B2. Song Loading State [Usability #1]

**Problem:** Navigating to `/perform/[id]` shows "No Chart Available" flash before PDF loads.

**Solution:** Loading skeleton with song context.

In `PerformerView.tsx`, when `fileUrl` is set but content hasn't rendered yet:

```
┌──────────────────────────────────┐
│                                  │
│      ♪ Loading                   │
│      Oseh Shalom                 │
│      ━━━━━━━━░░░░░░░             │
│                                  │
│                                  │
│    [skeleton rectangle blocks]   │
│                                  │
└──────────────────────────────────┘
```

**Implementation:**
- `PDFViewer` already has internal loading state — expose it via a callback prop `onLoadStart` / `onLoadComplete`
- `PerformerView` shows overlay skeleton while `isLoading` is true
- Song name comes from `playbackQueue[queueIndex].name` (already available in store)
- Skeleton is dark-themed to match performance mode

**Files changed:**
- `src/components/views/PerformerView.tsx` — Add loading overlay
- `src/components/music/PDFViewer.tsx` — Expose loading callbacks
- New: `src/components/performance/SongLoadingSkeleton.tsx` (~40 lines)

---

### B3. Selective Print [Usability #2]

**Problem:** "Print All Packets" generates packets for ALL musicians with profiles. No way to pick just 2-3 musicians for tonight's service, or print just your own packet quickly.

**Solution:** Replace the current binary "Print Standard / Print All" with a unified print flow:

```
┌─ Print Gig Packet ──────────────────────┐
│                                          │
│  Title: [Shabbat Morning_____________]   │
│  Date:  [Friday, February 20, 2026___]   │
│                                          │
│  Print for:                              │
│  ○ Standard (no transposition)           │
│  ○ Just me (Daniel — Guitar, Capo 2)     │
│  ○ Select musicians:                     │
│     ☑ Daniel (Guitar)                    │
│     ☑ Karen (Voice)                      │
│     ☐ Bryn (Piano)                       │
│     ☐ Josh (Drums)                       │
│     ☑ Sarah (Flute, Bb)                  │
│     [Select All] [Deselect All]          │
│                                          │
│  ┌─────────────────────────────────────┐ │
│  │  📄 Generate & Download             │ │
│  └─────────────────────────────────────┘ │
│                                          │
│  Single musician → downloads PDF         │
│  Multiple musicians → downloads ZIP      │
└──────────────────────────────────────────┘
```

**Logic:**
- "Standard" → single PDF, no transposition (existing behavior)
- "Just me" → single PDF, applies current user's musician profile transposition. Most common use case — one tap for "give me my packet for tonight"
- "Select musicians" → checkboxes, generates only checked. 1 musician = PDF, 2+ = ZIP
- Persist last selection in localStorage — same band usually plays together, so the previous selection is pre-checked on next visit. Checkboxes are always visible so you can adjust when the lineup changes.
- "Just me" is pre-selected if user has a musician profile and no previous selection exists

**Decision:** Remember last selection with checkboxes always visible. ✅ Confirmed.

**Files changed:**
- `src/components/setlist/PrintModal.tsx` — Rewrite print mode selector with musician checkboxes
- Print API route stays the same (already handles per-musician transposition)

---

### B4. Compact Library Rows [UI #2]

**Problem:** Library rows use `p-6 text-xl` — only 4 charts visible on a phone screen without scrolling. Finding a song takes too much scrolling.

**Solution:** Responsive density:

```typescript
// Mobile (< 640px): compact
<button className="p-3 sm:p-5 rounded-xl sm:rounded-2xl ...">
    <FileMusic className="h-6 w-6 sm:h-10 sm:w-10 ..." />
    <div className="font-semibold text-base sm:text-xl truncate">
        {displayName}
    </div>
</button>
```

**Changes:**
- `p-6` → `p-3 sm:p-5` (tighter on mobile)
- `text-xl` → `text-base sm:text-xl` (smaller title on mobile)
- `h-10 w-10` icons → `h-6 w-6 sm:h-8 sm:w-8` (smaller icons)
- `rounded-2xl` → `rounded-xl sm:rounded-2xl`
- Metadata badges: hide BPM on mobile (key is enough), keep topics on `sm:`

**Result:** ~7-8 visible rows on phone vs current 4. Tablet/desktop stays spacious.

**Files changed:** `src/components/library/LibraryFileRow.tsx` — Responsive class adjustments.

---

### B5. Admin Action Changelogs [Usability #5]

**Problem:** After Library Sync, the result shows "Scanned: 180 · New: 3" — but not *which* 3 files were added. After AI Enrichment, you see counts but not which songs got new metadata. Admins can't verify the right things happened.

**Solution:** Return and display itemized results from admin actions.

**API changes — return file names in responses:**

Library Sync (`/api/library/sync`):
```typescript
// Currently returns: { stats: { totalScanned, added, updated, removed, ... } }
// Change to also return:
{
    stats: { totalScanned: 180, added: 3, updated: 1, removed: 0, ... },
    details: {
        added: ["Hashkiveinu.pdf", "Mi Chamocha.pdf", "Oseh Shalom.pdf"],
        updated: ["Shalom Rav.pdf"],
        removed: []
    }
}
```

AI Enrichment (`/api/admin/enrich`):
```typescript
// Currently returns: { stats: { processed, enriched, skipped }, message }
// Change to also return:
{
    stats: { processed: 12, enriched: 8, skipped: 4 },
    details: {
        enriched: [
            { name: "Hashkiveinu.pdf", key: "Dm", bpm: 72, topics: ["Evening", "Peace"] },
            { name: "Mi Chamocha.pdf", key: "Em", bpm: null, topics: ["Exodus", "Sea"] },
        ],
        skipped: ["Oseh Shalom.pdf", "Shalom Rav.pdf"]  // already had metadata
    }
}
```

**Admin Dashboard UI — expandable results:**

After each action completes, show a collapsible details panel:

```
Library Sync                              [Sync Now]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Done — Scanned: 180 · New: 3 · Updated: 1

▾ What changed:
  + Hashkiveinu.pdf
  + Mi Chamocha.pdf  
  + Oseh Shalom.pdf
  ~ Shalom Rav.pdf (updated)
```

```
AI Enrichment                         [Run Enrichment]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Done — Processed: 12 · Enriched: 8 · Skipped: 4

▾ Enriched files:
  Hashkiveinu.pdf → Dm, 72 BPM, [Evening, Peace]
  Mi Chamocha.pdf → Em, [Exodus, Sea]
  ...
```

The details section is collapsed by default (click to expand). This keeps the UI clean for routine syncs but lets admins drill in when they need to verify.

**Implementation:**

The sync engine (`src/lib/sync-engine.ts`) already tracks which files were added/updated/removed internally — it just doesn't return the names. The change is to collect file names during processing and include them in the response.

For enrichment, the API route iterates over files and calls the enrichment engine — same pattern, just collect the names and results as it goes.

**Files changed:**
- `src/lib/sync-engine.ts` — Return file names in `SyncStats.details`
- `src/app/api/library/sync/route.ts` — Pass details through to response
- `src/app/api/admin/enrich/route.ts` — Collect and return per-file results
- `src/app/(main)/admin/page.tsx` — Expandable details panels for sync + enrichment results
- `src/types/api.ts` — Add `SyncDetails` and `EnrichDetails` types

---

## Phase C: Performance Mode Overhaul

*Goal: Fix the perform → navigate → return flow and add guided setup.*

### C1. Perform ↔ Setlist Hand-off [Interface #5]

**Problem:** Entering perform mode from a setlist, then pressing Home, goes to homepage — not back to the setlist. Round-trip is broken.

**Solution:** Track "return destination" in the music store:

```typescript
// In store.ts, add:
returnPath: string | null  // Where to go when exiting perform mode

// SetlistEditor sets it when launching perform:
setQueue(tracks)
setReturnPath(`/setlists/${setlistId}`)
router.push(`/perform/${firstTrack.fileId}`)

// Library sets it when opening a song:
setReturnPath('/library')

// PerformanceToolbar Home button uses it:
const handleHome = () => {
    const returnPath = useMusicStore.getState().returnPath
    router.push(returnPath || '/')
    clearReturnPath()
}
```

**Files changed:**
- `src/lib/store.ts` — Add `returnPath` + `setReturnPath` + `clearReturnPath`
- `src/components/performance/PerformanceToolbar.tsx` — Home button uses `returnPath`
- `src/hooks/use-setlist-logic.ts` — Set `returnPath` when launching perform
- `src/app/(main)/library/page.tsx` — Set `returnPath` on song select

---

### C2. Back Gesture for Perform Mode [Interface #4]

**Problem:** No way to exit performance mode except toolbar Home button (which requires tap-to-reveal first). Browser back is unreliable with the gesture system.

**Solution:** Add swipe-down-from-top gesture to exit:

```typescript
// In PerformerView.tsx, modify the existing useDrag:
// Detect downward swipe from top 15% of screen
if (my > 100 && velocity[1] > 0.3 && startY < window.innerHeight * 0.15) {
    // Animate view sliding down
    viewRef.current.style.transform = `translateY(100%)`
    viewRef.current.style.transition = 'transform 0.3s ease-out'
    setTimeout(() => {
        const returnPath = useMusicStore.getState().returnPath
        router.push(returnPath || '/')
    }, 300)
}
```

**Additionally:** Show a subtle "swipe down to exit" hint on first-ever performance (one-time, stored in localStorage):

```
     ╶───╴
  Swipe down to exit
```

This pairs with C1 — the swipe-down returns you to wherever you came from.

**Files changed:**
- `src/components/views/PerformerView.tsx` — Add downward swipe detection + first-time hint

---

### C3. Performance Mode Intro Tooltip [UX #2]

**Problem:** First-time performers don't know about tap-to-toggle-toolbar, swipe-to-navigate, or zone tapping.

**Solution:** One-time overlay on first performance entry:

```
┌─────────────────────────────────────────┐
│                                          │
│  ← Tap left     Tap center    Tap right →│
│  to scroll up   to show/hide  to scroll  │
│                 toolbar       down        │
│                                          │
│       ← Swipe left/right for →           │
│         next/previous song               │
│                                          │
│       ↓ Swipe down from top ↓            │
│         to exit                          │
│                                          │
│            [ Got it! ]                   │
└─────────────────────────────────────────┘
```

Semi-transparent dark overlay with white text/arrows. Dismisses on tap, sets `localStorage.performIntroSeen = true`. Never shows again.

**Files changed:**
- New: `src/components/performance/PerformIntro.tsx` (~60 lines)
- `src/components/views/PerformerView.tsx` — Render `PerformIntro` conditionally

---

### C4. Monitor Setup Wizard [UX #3]

**Problem:** Monitor config in admin is just a form with fields. First-time setup requires knowing what a "bridge WebSocket URL" is.

**Solution:** Add a "Setup" mode to the Sound System section that guides through steps:

```
Step 1 of 4: Bridge Server
─────────────────────────
Is the bridge server running on the production PC?

  Bridge URL: [ws://________________:9000]
  
  [Test Connection]
  
  ✅ Connected! Bridge v1.0 running on PRODUCTION-PC
  
  [Next →]

Step 2 of 4: Find Your Mixer  
─────────────────────────────
Let's scan the network for your X32.

  [Scan Now 📡]
  
  ✅ Found X32 Rack at 192.168.1.47
  
  [Next →]

Step 3 of 4: Monitor Buses
──────────────────────────
Which mix buses feed your wedge monitors?

  ☑ Bus 1    ☑ Bus 2    ☑ Bus 3    ☑ Bus 4
  ☐ Bus 5    ☐ Bus 6    ...
  
  [Next →]

Step 4 of 4: Assign Musicians
──────────────────────────────
Who's on each monitor?

  Bus 1: [Daniel ▾]
  Bus 2: [Karen ▾]
  Bus 3: [Unassigned ▾]
  Bus 4: [Unassigned ▾]
  
  Grant monitor access to:
  ☑ Daniel  ☑ Karen  ☐ Bryn

  [Save & Finish ✅]
```

**Implementation:** This is a UI layer on top of the existing config form. If config already exists, show the normal form view (current behavior). If config doesn't exist or user clicks "Setup Wizard", show the step-by-step flow. Both write to the same Firestore `config/monitor` document.

**Files changed:**
- New: `src/components/admin/MonitorSetupWizard.tsx` (~200 lines)
- `src/app/(main)/admin/page.tsx` — In Sound System section, show wizard if no config exists, or add "Run Setup" button

---

## Phase D: Setlist Collaboration & Annotations

*Goal: The two marquee 3.0 features — real-time setlist editing and chart annotations.*

### D1. Setlist Live Sync [Feature #1]

**Problem:** Setlists are single-author. No real-time collaboration, no "leader changed the order" push to performers.

**Architecture:**

Firestore is already real-time — `onSnapshot` is used for setlist subscriptions. The foundation exists. What's missing:

1. **Presence awareness** — who's looking at this setlist right now?
2. **Live edit propagation** — leader reorders tracks, everyone sees it instantly
3. **"Go to song" command** — leader says "we're on track 3", all performers jump

**Implementation:**

**Presence (lightweight):**
```typescript
// Firestore subcollection: setlists/{id}/presence/{odinguid}
{
    uid: string,
    displayName: string,
    photoURL: string,
    lastSeen: Timestamp,
    currentSongIndex: number | null,  // If in perform mode
    status: 'editing' | 'performing' | 'viewing'
}
```

Write presence on setlist open, heartbeat every 30s, delete on unmount. Display as avatar dots in setlist editor header.

**Live edit propagation (already works!):**
`subscribeToSetlist` already uses `onSnapshot`. The setlist editor just needs to handle external changes:
- Currently the editor loads data once and works locally until save
- Change: Subscribe to live updates. On remote change, merge:
  - If local has unsaved edits in the SAME field → keep local (last-write-wins with warning)
  - If remote changed a DIFFERENT field → accept silently
  - Track reordering: accept remote order unless user is mid-drag

**"Go to song" command:**
```typescript
// Firestore field on setlist document:
liveState?: {
    currentTrackIndex: number,
    updatedBy: string,
    updatedAt: Timestamp
}
```

Leader taps a "Live" toggle in the setlist editor. When active, tapping a track writes `liveState.currentTrackIndex`. All performers subscribed to this setlist see a toast notification: "Karen moved to: *Mi Chamocha*" with a "Jump to song" button. Performers choose whether to follow — they are never auto-navigated, preserving autonomy if they've intentionally gone to a different song.

**Decision:** Notification + optional jump, not auto-navigate. ✅ Confirmed.

**Performer integration:**
In perform mode, if the current setlist has `liveState` enabled, show a small "LIVE" badge in the toolbar. When `currentTrackIndex` changes remotely, show a non-blocking toast with the song name and a "Jump" action button. The notification auto-dismisses after 5 seconds if not acted on.

**Files changed:**
- `src/lib/setlist-firebase.ts` — Add `updateLiveState()`, presence helpers
- `src/lib/setlist-store.ts` — Add `liveState`, `presence` to store
- `src/components/setlist/SetlistEditor.tsx` — Live toggle, presence avatars, handle remote changes
- `src/components/performance/PerformanceToolbar.tsx` — Live badge + jump notification
- `src/hooks/use-setlist-logic.ts` — Subscribe to presence + liveState changes
- `firestore.rules` — Add presence subcollection rules

**Firestore rules addition:**
```javascript
match /setlists/{setlistId}/presence/{odinguid} {
    allow read: if isSignedIn();
    allow write: if isSignedIn() && request.auth.uid == odinguid;
    allow delete: if isSignedIn() && request.auth.uid == odinguid;
}
```

---

### D2. Chart Annotation Layer [Feature #4]

**Problem:** Musicians write on paper charts — breath marks, dynamic reminders, cues. Digital charts lose this.

**Architecture:**

Transparent SVG overlay on top of the PDF viewer. Annotations are per-user per-song, stored in Firestore.

**Data model:**
```typescript
// Firestore: users/{uid}/annotations/{fileId}
{
    fileId: string,
    pageAnnotations: {
        [pageNumber: string]: Annotation[]
    },
    updatedAt: Timestamp
}

interface Annotation {
    id: string
    type: 'freehand' | 'text' | 'highlight'
    // Freehand: SVG path data (normalized 0-1 coordinate space)
    path?: string
    // Text: positioned note
    text?: string
    x?: number  // 0-1 normalized
    y?: number  // 0-1 normalized
    // Common
    color: string  // '#ff0000', '#0066ff', '#00aa00', '#ffaa00'
    strokeWidth?: number
    pageNumber: number
    createdAt: number
}
```

**Coordinate normalization:** All positions stored as 0–1 ratios relative to page dimensions. This means annotations survive zoom changes and different screen sizes.

**UI — Annotation Toolbar:**
When user taps an "Annotate" button (pencil icon in performance toolbar), a secondary toolbar slides in:

```
[✏️ Draw] [T Text] [🖍 Highlight] | [🔴 Red] [🔵 Blue] [🟢 Green] | [↩ Undo] [🗑 Clear Page] [✓ Done]
```

- **Draw mode:** Touch to draw freehand SVG paths on the overlay. Uses pointer events with `pointerdown → pointermove → pointerup` to capture stroke paths.
- **Text mode:** Tap to place a text annotation. Opens a small input popover at tap position.
- **Highlight mode:** Draw rectangular highlight regions (semi-transparent fill).
- **Colors:** Four quick-select options: red, blue, green, orange. ✅ Confirmed — no full picker needed.
- **Undo:** Removes last annotation on current page.
- **Clear Page:** Clears all annotations on current page (with confirmation).
- **Done:** Exits annotation mode, saves to Firestore.

**Rendering:** SVG layer positioned absolutely over each PDF page. During normal viewing (non-annotate mode), annotations render as non-interactive SVG. Touch events pass through to the normal scroll/swipe handling.

**Auto-save:** Debounced save to Firestore (500ms after last stroke). No explicit "save" button needed — annotations persist automatically.

**Files changed:**
- New: `src/components/music/AnnotationLayer.tsx` — SVG overlay rendering + drawing logic (~300 lines)
- New: `src/components/music/AnnotationToolbar.tsx` — Tool selection bar (~100 lines)
- New: `src/lib/annotation-store.ts` — Zustand store + Firestore CRUD (~80 lines)
- New: `src/types/annotations.ts` — Type definitions (~30 lines)
- `src/components/music/PDFPageWrapper.tsx` — Render `AnnotationLayer` over each page
- `src/components/performance/PerformanceToolbar.tsx` — Add annotate toggle button
- `firestore.rules` — Add annotation subcollection rules

**Firestore rules:**
```javascript
match /users/{userId}/annotations/{fileId} {
    allow read, write: if isSignedIn() && request.auth.uid == userId;
}
```

---

## Phase E: Multi-Congregation Abstraction

*Goal: Decouple CRC-specific branding so the app can serve other congregations.*

### E1. Congregation Config System [Feature #5]

**Problem:** 15 references to "CRC", "Central Reform Congregation", or `/logo.jpg` are hardcoded across the codebase. The app is structurally a single-tenant system.

**Solution:** Create a congregation config document in Firestore and a config provider.

**Firestore document: `config/congregation`**
```typescript
interface CongregationConfig {
    name: string              // "Central Reform Congregation"
    shortName: string         // "CRC Music"
    location: string          // "St. Louis, MO"
    logoUrl: string           // URL to logo image
    description: string       // "Digital Sheet Music Library for ..."
    themeColor: string        // "#7c3aed" (violet)
    driveFolderId: string     // Root Google Drive folder ID
    features: {
        monitor: boolean      // X32 monitor integration
        ai: boolean           // AI assistant
        audio: boolean        // Audio practice files
        annotations: boolean  // Chart annotations
        collaboration: boolean // Live setlist sync
    }
    printFooter: string       // "Generated by CRC Music Books"
}
```

**Config Provider:**
```typescript
// src/lib/congregation-context.tsx
const CongregationContext = createContext<CongregationConfig>(DEFAULT_CONFIG)

export function CongregationProvider({ children }) {
    const [config, setConfig] = useState(DEFAULT_CONFIG)
    
    useEffect(() => {
        return onSnapshot(doc(db, 'config', 'congregation'), (snap) => {
            if (snap.exists()) setConfig(snap.data() as CongregationConfig)
        })
    }, [])
    
    return <CongregationContext.Provider value={config}>{children}</CongregationContext.Provider>
}

export const useCongregation = () => useContext(CongregationContext)
```

**Migration — Replace all hardcoded references:**

| Current | Replacement |
|---------|-------------|
| `"/logo.jpg"` | `config.logoUrl` |
| `"CRC Music"` | `config.shortName` |
| `"Central Reform Congregation"` | `config.name` |
| `"St. Louis, MO"` | `config.location` |
| `"Digital Sheet Music Library for..."` | `config.description` |
| `"Generated by CRC Music Books"` | `config.printFooter` |

**Feature flags** control which nav items and capabilities are available. A congregation without an X32 doesn't see Monitor. A congregation without AI keys doesn't see the AI button. This is checked via `config.features.*` in the nav components and feature-gated pages.

**Files changed:**
- New: `src/lib/congregation-context.tsx` — Provider + hook (~50 lines)
- `src/components/client-providers.tsx` — Wrap app in `CongregationProvider`
- `src/app/layout.tsx` — Dynamic metadata from config
- `src/app/login/page.tsx` — Dynamic branding
- `src/app/(main)/page.tsx` — Dynamic greeting + logo
- `src/components/nav/DesktopHeader.tsx` — Dynamic logo + name
- `src/components/library/SongChartsLibrary.tsx` — Dynamic logo
- `src/components/setlist/SetlistDashboard.tsx` — Dynamic logo
- `src/app/api/setlist/print/route.ts` — Dynamic footer text
- `src/lib/greeting.ts` — Dynamic fallback greeting
- `src/lib/musician-profile.ts` — Remove CRC-specific comment (instruments are universal)

**Note:** This phase does NOT implement multi-tenancy (multiple congregations in one Firestore). It makes the single-tenant app configurable. True multi-tenancy (separate Firestore databases, auth domains, Drive folders per congregation) would be a 4.0 effort requiring infrastructure changes.

**Admin UI for Congregation Config:**

A "Congregation" section in the Admin dashboard (or a dedicated sub-section under System):

```
Congregation Settings
━━━━━━━━━━━━━━━━━━━━━
Name:       [Central Reform Congregation___]
Short Name: [CRC Music____________________]
Location:   [St. Louis, MO________________]
Logo URL:   [/logo.jpg____________________]  [Upload]
Print Footer: [Generated by CRC Music Books]

Features:
  ☑ Monitor (X32 integration)
  ☑ AI Assistant
  ☑ Audio practice files
  ☐ Annotations (coming soon)
  ☐ Live Collaboration (coming soon)

[Save Changes]
```

**Decision:** Editable via Admin dashboard UI. ✅ Confirmed.

**Files changed (additional):**
- `src/app/(main)/admin/page.tsx` — Add Congregation section with form fields + feature checkboxes (~100 lines)

---

## Implementation Order & Dependencies

```
Phase A (Foundation)
├── A1. Dead Code Removal          ← Do first, cleaner slate
├── A2. API Auth Wrapper           ← Do with A1 (touching same files)
├── A3. Console → Logger           ← Mechanical, can batch
├── A4. Navigation Consistency     ← Independent
├── A5. Theme Token Consistency    ← Independent
├── A6. Admin Collapsible          ← Independent
└── A7. Empty State Illustrations  ← Independent (can defer)

Phase B (Quality of Life)
├── B1. Onboarding Flow            ← Independent
├── B2. Song Loading State         ← Independent
├── B3. Selective Print            ← Independent
├── B4. Compact Library Rows       ← Independent
└── B5. Admin Action Changelogs    ← Independent

Phase C (Performance Mode)
├── C1. Perform ↔ Setlist Hand-off ← Do first (store change)
├── C2. Back Gesture               ← Depends on C1 (uses returnPath)
├── C3. Performance Intro Tooltip  ← Depends on C2 (documents gestures)
└── C4. Monitor Setup Wizard       ← Independent

Phase D (Major Features)
├── D1. Setlist Live Sync          ← Independent (builds on existing Firestore)
└── D2. Chart Annotation Layer     ← Independent (new subsystem)

Phase E (Abstraction)
└── E1. Congregation Config        ← Do last (touches many files, should be stable)
```

**Suggested session order:**
1. **Session 10:** A1 + A2 + A3 (cleanup sprint — lots of deletions, mechanical changes)
2. **Session 11:** A4 + A5 + A6 + A7 (nav + UI polish)
3. **Session 12:** B1 + B2 + B4 + B5 (onboarding + loading + compact rows + admin changelogs)
4. **Session 13:** B3 + C1 + C2 (print + perform hand-off + back gesture)
5. **Session 14:** C3 + C4 (perform intro + monitor wizard)
6. **Session 15:** D1 (setlist collaboration — biggest single feature)
7. **Session 16:** D2 (annotations — second biggest feature)
8. **Session 17:** E1 (congregation config — touches many files, do when stable)

**Version milestones:**
- v2.3.0 after Phase A (cleanup)
- v2.4.0 after Phase B (quality of life)
- v2.5.0 after Phase C (performance mode)
- v3.0.0 after Phase D (collaboration + annotations = major release)
- v3.1.0 after Phase E (white-label ready)

---

## Appendix: Files at Risk

Files modified across multiple phases (coordinate carefully):

| File | Phases |
|------|--------|
| `PerformanceToolbar.tsx` | C1, C2, D1, D2 |
| `PerformerView.tsx` | B2, C2, C3 |
| `admin/page.tsx` | A6, C4 |
| `MobileTabBar.tsx` | A4 |
| `DesktopHeader.tsx` | A4, A5 |
| `store.ts` | C1 |
| `firestore.rules` | D1, D2 |
| `setlist-firebase.ts` | D1 |
| `PrintModal.tsx` | B3 |

---

## Questions for Daniel — ANSWERED

1. **Nav priority (A4):** Admin gets the mobile tab. Monitor via QuickMonitorPanel + URL. ✅
2. **Annotation colors (D2):** Four colors (red, blue, green, orange). No full picker. ✅
3. **Live sync scope (D1):** Notification + optional "Jump" button. Never auto-navigate. ✅
4. **Congregation config (E1):** Editable via Admin dashboard UI. ✅
5. **Print selection (B3):** Remember last selection in localStorage, always show checkboxes. ✅
