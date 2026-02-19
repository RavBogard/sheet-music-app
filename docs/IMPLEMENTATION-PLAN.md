# CRC Music — Implementation Plan

*8 features + Rabbi Randy + recursive audit. Ordered by dependency chain and build efficiency.*

---

## Phase 1: Quick Wins (Foundation Layer)

These are small, standalone changes that other features depend on or that should ship first because they're trivial and immediately valuable.

### 1A. Add Rabbi Randy to Rabbi Options

**File:** `src/components/setlist/v2/OverflowMenu.tsx`

**Change:** Line 153 — add `"Randy"` to the rabbi array:
```
{["Daniel", "Karen", "Randy"].map((r) => (
```

That's it. One word. The rabbi field is a free string stored on the setlist doc, so no model or Firestore changes needed.

**Test:** Open any setlist → overflow menu → Assign Rabbi → verify "Rabbi Randy" appears and persists after reload.

---

### 1B. Instant Personalized Load (localStorage Cache)

**Goal:** Eliminate the 1–2s blank greeting while Firebase Auth restores from IndexedDB.

**File:** `src/lib/auth-context.tsx`

**Implementation:**
1. After successful auth + profile fetch, write to localStorage:
   ```ts
   localStorage.setItem('crc_cached_user', JSON.stringify({
       displayName: profile.displayName,
       photoURL: profile.photoURL,
       role: profile.role,
       email: user.email,
   }))
   ```
2. On mount (before `onAuthStateChanged` fires), read from localStorage and set as initial state:
   ```ts
   const [cachedUser] = useState(() => {
       try {
           const raw = localStorage.getItem('crc_cached_user')
           return raw ? JSON.parse(raw) : null
       } catch { return null }
   })
   ```
3. Expose `cachedUser` from the auth context alongside `user` and `profile`.
4. On sign-out, clear: `localStorage.removeItem('crc_cached_user')`.

**File:** `src/app/(main)/page.tsx`

**Change:** The greeting `firstName` derivation (line ~58) should prefer `cachedUser?.displayName` when `profile` is still null. This means the greeting renders the user's name on the very first frame.

**Risk:** Stale name if user changes displayName on another device. Mitigated by overwriting cache every time auth resolves — staleness window is one session at most.

**Test:** Hard-reload the dashboard. Greeting should show "Good evening, Daniel" immediately (no flash of generic greeting).

---

## Phase 2: Default Band Roster

This is the highest-impact workflow improvement. It depends on nothing and unblocks the "Clone for Next Week" feature (which should carry musicians over).

### 2A. Data Model

**Firestore:** `config/congregation` document gets a new field:
```ts
defaultMusicians: Array<{
    uid: string
    name: string
    instrument?: string
}>
```

This is congregation-wide (not per-user), since there's one band. Stored alongside existing config fields.

**Why congregation config, not a separate collection?** The default band is a single, small document (~5–10 entries). It's already loaded on every page via `CongregationProvider`. No extra reads.

**File:** `src/lib/congregation-context.tsx`

Add to `CongregationConfig` interface:
```ts
defaultMusicians?: Array<{
    uid: string
    name: string
    instrument?: string
}>
```

No default value needed — `undefined` means "no defaults configured yet."

### 2B. MusicianPicker — "Load Defaults" Button + Default Toggle

**File:** `src/components/setlist/v2/MusicianPicker.tsx`

**New UI elements:**

1. **"Load Defaults" button** — appears at the top of the Members section when `musicians.length === 0` and `defaultMusicians` exists. Tapping it calls `onChange(defaultMusicians)` to populate the full roster in one tap. Also available as a subtle link when musicians are already assigned ("Reset to defaults").

2. **Per-user default star** — next to each member chip (only visible to admins/leaders), a small star icon. Filled = this person is in the default roster. Tapping it adds/removes them from `config/congregation.defaultMusicians` via a Firestore update. This means you can mark someone as a default right from the setlist editor without navigating to a separate settings page.

**Implementation detail for the star toggle:**
```ts
const toggleDefault = async (user: UserProfile) => {
    const ref = doc(db, "config", "congregation")
    const current = congregationConfig.defaultMusicians || []
    const exists = current.some(m => m.uid === user.uid)
    const updated = exists
        ? current.filter(m => m.uid !== user.uid)
        : [...current, { uid: user.uid, name: user.displayName, instrument: getInstrumentLabel(user) }]
    await updateDoc(ref, { defaultMusicians: updated })
}
```

The `CongregationProvider` already subscribes to this doc via `onSnapshot`, so the UI updates reactively everywhere.

**File:** `src/lib/congregation-context.tsx` — import `useCongregation` in MusicianPicker to read defaults.

### 2C. Instrument Sync

When loading defaults, instruments come from the saved `defaultMusicians` array. But if a musician changed their instrument since being saved as a default, the default data is stale. 

**Resolution:** On "Load Defaults," merge with live user data: use the default list for *who* to include, but pull `instrument` from the user's current `musicianProfile` (already fetched via `subscribeToAllUsers`). The saved instrument in `defaultMusicians` is a fallback only.

### 2D. Test Plan

- Configure 5 default musicians via star toggles.
- Create a new setlist → MusicianPicker should show "Load Defaults" button.
- Tap it → all 5 appear with current instruments.
- Remove one, add a guest → defaults are not affected.
- Toggle a star off for one member → they disappear from defaults on next "Load Defaults."
- Navigate to a different setlist → defaults still work.

---

## Phase 3: Clone for Next Week

### 3A. Parasha-Aware Name Generation

**File:** `src/lib/liturgical-templates.ts` — `generateSetlistName()` already exists and produces names like "Shabbat Tetzaveh — February 28, 2026." The clone feature will call this with the target date to auto-generate the new name.

**Key detail:** `generateSetlistName` calls `getParasha()` which is async (Hebcal API). The clone flow must `await` this before creating the doc.

### 3B. Clone Logic

**File:** `src/lib/setlist-firebase.ts` — new method on the setlist service:

```ts
async cloneForNextWeek(sourceSetlist: Setlist): Promise<string> {
    // 1. Compute target date: same weekday, +7 days
    const sourceDate = toDate(sourceSetlist.eventDate || sourceSetlist.date)
    const targetDate = new Date(sourceDate)
    targetDate.setDate(targetDate.getDate() + 7)
    
    // 2. Generate new name (async — parasha lookup)
    const context = await getFullServiceContext(targetDate)
    const name = generateSetlistName(context)
    
    // 3. Create new setlist doc
    const docRef = await addDoc(collection(db, 'setlists'), {
        name,
        date: Timestamp.fromDate(targetDate),
        eventDate: Timestamp.fromDate(targetDate),
        tracks: sourceSetlist.tracks,
        trackCount: sourceSetlist.tracks.length,
        isPublic: false,
        ownerId: userId,
        ownerName: userName,
        musicians: sourceSetlist.musicians || [],
        rabbi: sourceSetlist.rabbi || '',
        clonedFrom: sourceSetlist.id,
    })
    
    return docRef.id
}
```

**Key decisions:**
- Musicians carry over (this is the whole point — you just deselect whoever's out).
- Rabbi carries over (usually the same week to week).
- Tracks carry over verbatim (you swap/reorder in the editor).
- `isPublic: false` — the clone is a draft until you publish.
- `clonedFrom` field for audit trail.

### 3C. UI Integration

**File:** `src/components/setlist/v2/OverflowMenu.tsx`

Add a new menu item after "Duplicate Setlist":
```tsx
{onCloneNextWeek && canEdit && (
    <DropdownMenuItem onClick={onCloneNextWeek}>
        <CalendarPlus className="h-4 w-4 mr-2" />
        Clone for Next Week
    </DropdownMenuItem>
)}
```

**File:** `src/components/setlist/v2/SetlistEditorV2.tsx`

Wire the handler:
```ts
const handleCloneNextWeek = async () => {
    if (!setlistId) return
    toast.loading('Creating next week's setlist...')
    const newId = await setlistService.cloneForNextWeek(currentSetlist)
    toast.success('Cloned! Opening editor...')
    router.push(`/setlists/${newId}`)
}
```

After cloning, the user lands directly in the editor for the new setlist, ready to tweak.

### 3D. Test Plan

- Open a Friday night setlist dated Feb 20 → Clone for Next Week.
- Verify: new setlist dated Feb 27, name includes correct parasha, same tracks, same musicians, same rabbi, `isPublic: false`.
- Open a Shabbat morning setlist → clone → verify Saturday date bumped correctly.
- Clone a setlist with no `eventDate` (old data) → should gracefully fall back to `date` field.

---

## Phase 4: Save Setlist as Reusable Template

### 4A. Template Storage

The `Setlist` model already has `isTemplate` and `templateType` fields. Templates are just setlists with `isTemplate: true`, no `eventDate`, and no `musicians`.

**No schema changes needed.**

### 4B. Save as Template Action

**File:** `src/lib/setlist-firebase.ts` — new method:

```ts
async saveAsTemplate(source: Setlist, templateName?: string): Promise<string> {
    const docRef = await addDoc(collection(db, 'setlists'), {
        name: templateName || `${source.name} (Template)`,
        date: serverTimestamp(),
        tracks: source.tracks,
        trackCount: source.tracks.length,
        isPublic: false,
        isTemplate: true,
        templateType: source.templateType || 'other',
        ownerId: userId,
        ownerName: userName,
    })
    return docRef.id
}
```

Deliberately strips: `musicians`, `rabbi`, `eventDate`, `isPublic`. These are per-service, not per-template.

### 4C. UI — Save Dialog

**File:** `src/components/setlist/v2/OverflowMenu.tsx`

New menu item in the Settings section:
```tsx
{onSaveAsTemplate && canEdit && isLeader && (
    <DropdownMenuItem onClick={onSaveAsTemplate}>
        <BookmarkPlus className="h-4 w-4 mr-2" />
        Save as Template
    </DropdownMenuItem>
)}
```

A simple confirm dialog with an editable name field (pre-filled with the setlist name). On confirm, calls `saveAsTemplate()` and toasts success.

### 4D. Using Templates — New Setlist Flow

**File:** `src/components/setlist/SetlistDashboard.tsx`

The "New Setlist" flow already has "Friday Night" and "Shabbat Morning" template buttons. Add a third section: **"Your Templates"** — queries setlists where `isTemplate: true`.

```ts
const templates = allSetlists.filter(s => s.isTemplate)
```

Each template card shows name + track count. Tapping it creates a new setlist from the template (same logic as `buildSetlistFromTemplate` but using the saved tracks directly instead of slot matching).

### 4E. Test Plan

- Open a polished Friday night setlist → overflow → Save as Template → name it "Standard Erev Shabbat."
- Verify: template doc has `isTemplate: true`, no musicians/rabbi/eventDate.
- Go to dashboard → New Setlist → "Your Templates" section → tap "Standard Erev Shabbat."
- Verify: new setlist created with all tracks, today's date, no musicians pre-assigned.
- Edit the template later without affecting setlists already created from it.

---

## Phase 5: Service-Level Notes

### 5A. Data Model

**File:** `src/types/models.ts`

Add to `Setlist` interface:
```ts
serviceNotes?: string  // Service-wide instructions for performers
```

### 5B. Editor UI

**File:** `src/components/setlist/v2/SetlistEditorV2.tsx`

Add a collapsible "Service Notes" textarea between the MusicianPicker and the track list. Collapsed by default if empty, expanded if it has content. Auto-saves on blur (same debounce pattern as other fields).

```tsx
<div className="border-b border-border/50 px-4 py-2">
    <button onClick={() => setShowServiceNotes(!showServiceNotes)}
            className="text-xs text-muted-foreground hover:text-foreground">
        {serviceNotes ? '📋 Service Notes' : '+ Add service notes'}
    </button>
    {showServiceNotes && (
        <textarea
            value={serviceNotes}
            onChange={(e) => setServiceNotes(e.target.value)}
            onBlur={saveServiceNotes}
            placeholder="Instructions for the band..."
            className="w-full mt-1.5 text-sm bg-muted/30 rounded-lg border p-2 resize-none"
            rows={2}
        />
    )}
</div>
```

### 5C. Perform View

**File:** `src/app/perform/setlist/[id]/page.tsx`

If `serviceNotes` exists, render a banner at the top of the track list (inside the ScrollArea, above the section chips):

```tsx
{setlist.serviceNotes && (
    <div className="mx-3 mt-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
        <p className="text-sm text-blue-200 whitespace-pre-wrap">{setlist.serviceNotes}</p>
    </div>
)}
```

### 5D. Email Integration

**File:** `src/app/api/setlist/publish/route.ts`

Pass `serviceNotes` alongside the existing `note` (publisher's custom message). In the email template, if `serviceNotes` exists, render it in a distinct block below the publisher's note with a "Service Notes" header.

### 5E. Test Plan

- Add service notes: "Starting 15 min early. New arrangement for L'cha Dodi."
- Verify: persists on reload, shows in perform view as a blue banner.
- Publish → verify notes appear in email.
- Clear the notes → banner disappears from perform view.
- Clone for next week → service notes should NOT carry over (they're per-service).

---

## Phase 6: Smart Song Suggestions

### 6A. Data Sources

All data already exists:
- **Song usage:** `songUsage/{fileId}` has `lastUsedDate`, `totalUses`, `lastUsedSetlistName`.
- **Current setlist tracks:** available in the editor state.
- **Library files:** loaded by `useLibraryStore`.

### 6B. Suggestion Engine

**New file:** `src/lib/song-suggestions.ts`

```ts
interface SongSuggestion {
    file: DriveFile
    reason: string        // "Played often", "Not played in 3+ months", "From last week"
    category: 'staple' | 'fresh' | 'last_week'
    lastUsedDate?: Date
    totalUses?: number
}

export function getSuggestions(
    library: DriveFile[],
    usageMap: Map<string, SongUsageSummary>,
    currentTrackFileIds: Set<string>,
    limit: number = 12
): SongSuggestion[]
```

**Algorithm:**
1. Filter out songs already in the current setlist.
2. **Staples** (top 10 by `totalUses`, played 3+ times) — labeled "Frequently used."
3. **Fresh** (not played in 90+ days, or never played but in library 30+ days) — labeled "Not played recently."
4. **Last week** (played in most recent published setlist, not in current) — labeled "From last service."
5. Interleave: 4 staples, 4 fresh, 4 from last week. Deduplicate.

### 6C. UI — Suggestions Section in AddSongsModal

**File:** `src/components/setlist/modals/AddSongsModal.tsx`

Add a "Suggested" tab or section at the top of the modal, above the search results. Shows suggestion chips with the reason badge. Tapping a suggestion adds it to the setlist (same as tapping a search result).

The section collapses once the user starts typing a search query (search takes priority).

**Data fetching:** The modal already receives the library. Usage data needs to be fetched — call `/api/library/usage?fileIds=...` with all library file IDs on mount. Cache in a ref to avoid re-fetching on every open.

### 6D. Test Plan

- Open AddSongsModal on an empty setlist → "Suggested" section shows ~12 songs.
- Verify: songs already in the setlist don't appear in suggestions.
- Verify: "Frequently used" songs are actually high-usage.
- Verify: "Not played recently" songs haven't been used in 90+ days.
- Type a search query → suggestions collapse, search results appear.
- Clear search → suggestions reappear.

---

## Phase 7: Email Delivery Tracking

### 7A. Resend Webhook Endpoint

**New file:** `src/app/api/webhooks/resend/route.ts`

Resend sends POST webhooks for events: `email.sent`, `email.delivered`, `email.opened`, `email.bounced`, `email.complained`.

```ts
export async function POST(request: NextRequest) {
    // 1. Verify webhook signature (Resend provides svix headers)
    // 2. Parse event type and email metadata
    // 3. Find the corresponding setlist + musician by email ID
    // 4. Write delivery status to Firestore
}
```

**Firestore structure:**
```
setlists/{setlistId}/emailEvents/{emailId}
    recipientEmail: string
    status: 'sent' | 'delivered' | 'opened' | 'bounced' | 'complained'
    timestamp: Timestamp
    resendMessageId: string
```

### 7B. Store Message IDs on Publish

**File:** `src/lib/email.ts`

When `sendSetlistEmail` succeeds, Resend returns `{ data: { id: 'msg_xxx' } }`. Return this ID from the function so the publish route can store it:

```ts
return { ok: true, messageId: data.id }
```

**File:** `src/app/api/setlist/publish/route.ts`

After all emails send, write a batch of `emailEvents` docs with initial status `'sent'` and the `resendMessageId`. The webhook handler updates these docs as delivery progresses.

### 7C. UI — Delivery Status Indicators

**File:** `src/components/setlist/v2/MusicianPicker.tsx`

After a setlist is published, subscribe to `setlists/{id}/emailEvents` and show a small icon next to each musician:

| Status | Icon | Color |
|--------|------|-------|
| sent | `Mail` | gray |
| delivered | `MailCheck` | green |
| opened | `MailOpen` | blue |
| bounced | `MailX` | red |

Only show these indicators after publish (check `setlist.isPublic`). Don't clutter the pre-publish view.

### 7D. Resend Dashboard Setup (Manual Step)

1. Go to Resend dashboard → Webhooks → Add endpoint.
2. URL: `https://centralreform.live/api/webhooks/resend`
3. Events: `email.sent`, `email.delivered`, `email.opened`, `email.bounced`.
4. Copy the signing secret → add as `RESEND_WEBHOOK_SECRET` env var.

### 7E. Test Plan

- Publish a setlist with 3 musicians.
- Verify: `emailEvents` subcollection has 3 docs with status `sent`.
- Wait 30s → webhook fires → status updates to `delivered`.
- Open email → status updates to `opened`.
- MusicianPicker shows green checkmarks for delivered, blue for opened.
- Test with an invalid email → should show red bounce indicator.

---

## Phase 8: Recursive Audit & Bug Squash

After all features are implemented and committed, run a systematic audit across four dimensions.

### 8A. TypeScript Strictness Audit

```bash
npx tsc --noEmit --strict 2>&1 | head -100
```

Fix any new type errors introduced by the features above. Pay special attention to:
- Optional fields on `CongregationConfig` (defaultMusicians).
- Null checks on `cachedUser` in the greeting path.
- The `cloneForNextWeek` method's date handling (toDate helper edge cases).

### 8B. Runtime Error Sweep

Open every modified page/component in the browser and check the console for:
- React hydration mismatches (especially the localStorage greeting cache — SSR won't have localStorage).
- Firestore permission errors (new `emailEvents` subcollection needs rules).
- Unhandled promise rejections in the clone/template flows.

**Firestore rules update:** Add rules for:
```
match /setlists/{setlistId}/emailEvents/{eventId} {
    allow read: if isLeaderOrAdmin();
    allow write: if false; // Only server-side (admin SDK)
}
match /config/congregation {
    allow read: if isAuthenticated();
    allow update: if isLeaderOrAdmin(); // For default musician toggling
}
```

### 8C. UX Regression Walkthrough

Walk through every core user flow and verify nothing is broken:

1. **Dashboard load** — greeting shows instantly, setlists appear progressively.
2. **Create from template** — liturgical templates still work, custom templates appear.
3. **Editor** — add songs (suggestions section works), assign musicians (defaults button works, star toggles work), assign rabbi (Randy appears), add service notes.
4. **Publish flow** — email toggles, custom subject, custom note, service notes included.
5. **Perform view** — service notes banner, section chips, track list, annotations.
6. **Clone for next week** — correct date, correct parasha, musicians carry over.
7. **Settings** — name editing still works, musician profile still works.
8. **Email delivery** — indicators show after publish, update via webhooks.

### 8D. Performance Check

- Dashboard: first contentful paint should be under 500ms (greeting + skeleton).
- AddSongsModal: suggestions should appear within 200ms of open (usage data cached).
- Clone for Next Week: should complete in under 2s (parasha API is the bottleneck).
- Default band load: should be instantaneous (data already in CongregationProvider).

### 8E. Edge Cases to Test

- Clone a setlist that has guest musicians → guests should carry over.
- Save a template from a setlist with 0 tracks → should work (empty template).
- Load defaults when no defaults are configured → button shouldn't appear.
- Toggle a default star while offline → should queue and sync when back online.
- Webhook receives an event for a deleted setlist → should gracefully no-op.
- Two rapid publishes of the same setlist → email events shouldn't duplicate.
- Service notes with markdown/HTML → should render as plain text (no XSS).

### 8F. Lint, Test, Build

```bash
npx tsc --noEmit
npx eslint src/ --quiet --max-warnings 0
npx vitest run
npm run build
```

All four must pass clean before the final commit.

---

## Execution Order Summary

| Step | Feature | Est. Complexity | Dependencies |
|------|---------|----------------|--------------|
| 1A | Rabbi Randy | 1 line | None |
| 1B | Instant personalized load | ~40 lines | None |
| 2 | Default band roster | ~120 lines | Congregation config |
| 3 | Clone for Next Week | ~80 lines | Setlist service, parasha API |
| 4 | Save as Template | ~100 lines | Setlist service, dashboard |
| 5 | Service-level notes | ~60 lines | Setlist model, perform view |
| 6 | Smart song suggestions | ~150 lines | Usage API, AddSongsModal |
| 7 | Email delivery tracking | ~200 lines | Resend webhooks, Firestore rules |
| 8 | Audit & bug squash | Variable | All of the above |

Total estimated new code: ~750 lines across ~15 files.
