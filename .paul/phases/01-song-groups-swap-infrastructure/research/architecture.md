# Live Setlist Sync — Technical Architecture

## Overview

This document specifies the complete technical architecture for the Live Setlist Sync feature: allowing a designated director (admin, band leader, or user with `canLiveSwap` permission) to swap songs in a live setlist during a service, with all connected musicians receiving the change in real time.

The design follows established codebase patterns: `soundEngineer`-style boolean custom claims, `useSafeFirestoreSync`-based real-time hooks, `createApiHandler` API routes, dot-notation Firestore partial updates, and the existing `LiveState` + `setlist-live.ts` infrastructure.

---

## 1. Data Model Changes

### 1.1 `config/songGroups` Document

Firestore path: `config/songGroups`

This document maps liturgical slot labels to groups of interchangeable songs. It is the display metadata layer on top of the `liturgicalSlot` tag stored on each song in `library_index`.

```typescript
// src/types/song-groups.ts

/** A single song reference within a group */
export interface SongGroupEntry {
  fileId: string         // Google Drive file ID (matches library_index/{fileId})
  title: string          // Cached display name
  key?: string           // Original key for quick reference
  addedAt: string        // ISO timestamp
  addedBy: string        // UID of who added it
}

/** A liturgical song group — songs that can be swapped for each other */
export interface SongGroup {
  id: string             // Slug key, e.g. "lcha_dodi", "mi_chamocha"
  label: string          // Display name, e.g. "L'cha Dodi", "Mi Chamocha"
  liturgicalSlot: string // Canonical slot identifier matching TemplateSlot.label normalization
  description?: string   // Optional: "Friday night greeting of Shabbat"
  songs: SongGroupEntry[]
  sortOrder: number      // Display order within admin UI
}

/** The full config/songGroups document shape */
export interface SongGroupsConfig {
  groups: Record<string, SongGroup>  // Keyed by group.id
  updatedAt: string                  // ISO timestamp
  updatedBy: string                  // UID
}
```

**Firestore document example:**
```json
{
  "groups": {
    "lcha_dodi": {
      "id": "lcha_dodi",
      "label": "L'cha Dodi",
      "liturgicalSlot": "L'cha Dodi",
      "songs": [
        { "fileId": "abc123", "title": "L'cha Dodi (Carlebach)", "key": "Am", "addedAt": "2026-03-30T...", "addedBy": "uid1" },
        { "fileId": "def456", "title": "L'cha Dodi (Klepper)", "key": "Dm", "addedAt": "2026-03-30T...", "addedBy": "uid1" },
        { "fileId": "ghi789", "title": "L'cha Dodi (Friedman)", "key": "Em", "addedAt": "2026-03-30T...", "addedBy": "uid1" }
      ],
      "sortOrder": 5
    }
  },
  "updatedAt": "2026-03-30T12:00:00Z",
  "updatedBy": "uid1"
}
```

### 1.2 Changes to `library_index/{fileId}` Metadata

Add a `liturgicalSlot` field to the existing `metadata` object. This is the source-of-truth tag for which liturgical position a song fills.

```typescript
// Addition to DriveFile.metadata in src/types/models.ts
export interface DriveFile {
  // ... existing fields ...
  metadata?: {
    key?: string
    bpm?: number
    timeSignature?: string
    topics?: string[]
    enrichedAt?: string
    omrCorrections?: OMRCorrection[]
    liturgicalSlot?: string  // NEW: e.g. "L'cha Dodi", "Shema", "Mi Chamocha"
  }
}
```

**Note:** `library_index` is server-only (rules deny client reads). The `liturgicalSlot` tag is written by the enrichment engine or admin API. Client code accesses this data indirectly through the `config/songGroups` document.

### 1.3 Changes to `SetlistTrack`

Add an optional `liturgicalSlot` field to link a track to its song group for swap eligibility.

```typescript
// Addition to SetlistTrack in src/types/models.ts
export interface SetlistTrack {
  // ... existing fields ...
  liturgicalSlot?: string  // NEW: Links to SongGroup for live swap eligibility
}
```

**Schema addition** in `src/types/schemas.ts`:
```typescript
// Add to setlistTrackSchema object:
liturgicalSlot: z.string().nullish().catch(undefined).transform(v => v || undefined),
```

### 1.4 Changes to `LiveState`

Extend the existing `LiveState` interface to record the last swap event, enabling receiver-side toast notifications.

```typescript
// Updated LiveState in src/lib/setlist-live.ts
export interface LiveState {
  enabled: boolean
  currentTrackIndex: number
  updatedBy: string
  updatedByName: string
  updatedAt: Timestamp | null
  // NEW: Last swap metadata (used for receiver toast)
  lastSwap?: {
    trackIndex: number        // Which position was swapped
    previousTitle: string     // What was there before
    newTitle: string           // What replaced it
    swappedBy: string          // UID
    swappedByName: string      // Display name
    swappedAt: Timestamp | null
    swapId: string             // Unique ID to deduplicate toast rendering
  }
}
```

### 1.5 `swapHistory` Subcollection

Firestore path: `setlists/{setlistId}/swapHistory/{swapId}`

Append-only audit trail of all live swaps performed on a setlist.

```typescript
// src/types/swap-history.ts

export interface SwapHistoryEntry {
  id: string                // Auto-generated doc ID
  trackIndex: number        // Position in setlist that was swapped
  liturgicalSlot: string    // Which slot group this belongs to
  previousFileId: string    // The song being replaced
  previousTitle: string
  newFileId: string          // The replacement song
  newTitle: string
  newKey?: string
  swappedBy: string          // UID of director
  swappedByName: string
  swappedAt: Timestamp       // serverTimestamp()
  reason?: string            // Optional: "congregation energy low", "cantor absent"
}
```

### 1.6 Changes to `UserProfile`

Add `canLiveSwap` boolean, following the `soundEngineer` pattern exactly.

```typescript
// Addition to UserProfile in src/types/models.ts
export interface UserProfile {
  // ... existing fields ...
  soundEngineer?: boolean
  canLiveSwap?: boolean    // NEW: Permission to swap songs during live mode
  canUpload?: boolean
}
```

**Schema addition** in `src/types/schemas.ts`:
```typescript
// Add to userProfileSchema:
canLiveSwap: z.boolean().nullish().catch(undefined).transform(v => v ?? undefined),
```

---

## 2. Firestore Security Rules

### 2.1 Helper Function: `canLiveSwap()`

```
// Add alongside existing isSoundEngineer() helper
function canLiveSwap() {
  return request.auth.token.canLiveSwap == true;
}
```

### 2.2 New Rule: `config/songGroups`

```
// Song group configuration
// Read: Any signed-in user (swap picker needs to load alternatives)
// Write: Admins and band leaders (they manage the group catalog)
match /config/songGroups {
  allow read: if isSignedIn();
  allow write: if isBandLeader();
}
```

### 2.3 Modified Setlist Update Rule (canLiveSwap Users)

The critical change: musicians with `canLiveSwap` can update a setlist, but ONLY the `liveState`, `tracks`, and `trackCount` fields. This uses Firestore's `affectedKeys().hasOnly()` to enforce field-level restrictions.

Replace the existing setlist update rule:

```
// BEFORE (current):
allow update: if isOwner(resource)
              || (resource.data.isPublic == true && isBandLeader())
              || isAdmin();

// AFTER (with live swap support):
allow update: if isOwner(resource)
              || (resource.data.isPublic == true && isBandLeader())
              || isAdmin()
              || (
                  // Live swap: canLiveSwap users can update ONLY tracks + liveState + trackCount
                  canLiveSwap()
                  && resource.data.liveState.enabled == true
                  && request.resource.data.diff(resource.data).affectedKeys()
                      .hasOnly(['liveState', 'tracks', 'trackCount'])
                  && isNotTooFrequent()
              );
```

### 2.4 Rate Limiting Rule

```
// Add as helper function
function isNotTooFrequent() {
  // Require at least 2 seconds between swap writes
  return !('lastSwapAt' in resource.data.liveState)
      || request.time > resource.data.liveState.lastSwap.swappedAt + duration.value(2, 's');
}
```

**Important:** This uses `request.time` (server time) for tamper-proof enforcement. The 2-second minimum prevents accidental double-taps.

### 2.5 `swapHistory` Append-Only Rule

```
// Swap history — append-only audit trail
match /setlists/{setlistId}/swapHistory/{swapId} {
  allow read: if isBandLeader();
  allow create: if isSignedIn()
                && (isBandLeader() || canLiveSwap())
                && request.resource.data.swappedBy == request.auth.uid;
  allow update, delete: if false;  // Immutable once written
}
```

### 2.6 Complete Rules Diff

```
// Full additions to firestore.rules:

// After existing isSoundEngineer() function:
function canLiveSwap() {
  return request.auth.token.canLiveSwap == true;
}

function isNotTooFrequent() {
  return !('liveState' in resource.data)
      || !('lastSwap' in resource.data.liveState)
      || resource.data.liveState.lastSwap == null
      || request.time > resource.data.liveState.lastSwap.swappedAt + duration.value(2, 's');
}

// Replace setlist update rule (line ~99):
allow update: if isOwner(resource)
              || (resource.data.isPublic == true && isBandLeader())
              || isAdmin()
              || (
                  canLiveSwap()
                  && resource.data.liveState != null
                  && resource.data.liveState.enabled == true
                  && request.resource.data.diff(resource.data).affectedKeys()
                      .hasOnly(['liveState', 'tracks', 'trackCount'])
                  && isNotTooFrequent()
              );

// Add after existing /setlists/{setlistId}/history rule:
match /setlists/{setlistId}/swapHistory/{swapId} {
  allow read: if isBandLeader();
  allow create: if isSignedIn()
                && (isBandLeader() || canLiveSwap())
                && request.resource.data.swappedBy == request.auth.uid;
  allow update, delete: if false;
}

// Add after existing config rules:
match /config/songGroups {
  allow read: if isSignedIn();
  allow write: if isBandLeader();
}
```

---

## 3. New Functions, Hooks, and API Routes

### 3.1 `swapLiveTrack()` in `src/lib/setlist-live.ts`

The core mutation function. Performs an atomic Firestore write that:
1. Replaces the track at the given index in the `tracks` array
2. Updates `liveState.lastSwap` for receiver-side toast
3. Writes a `swapHistory` entry for the audit trail

```typescript
import { doc, collection, updateDoc, addDoc, serverTimestamp } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { SetlistTrack } from "@/types/models"
import { logger } from "@/lib/logger"

export interface SwapLiveTrackParams {
  setlistId: string
  trackIndex: number
  currentTracks: SetlistTrack[]       // Current full tracks array (from snapshot)
  newTrack: SetlistTrack              // The replacement track
  previousTrack: SetlistTrack         // The track being replaced
  uid: string
  displayName: string
  reason?: string
}

/**
 * Atomically swap a track in a live setlist and record the change.
 *
 * Writes two documents:
 * 1. setlists/{setlistId} — updated tracks array + liveState.lastSwap
 * 2. setlists/{setlistId}/swapHistory/{auto} — append-only audit entry
 *
 * The tracks array is replaced in full (matching existing setlist save pattern).
 * liveState.lastSwap is updated via dot-notation for partial merge.
 */
export async function swapLiveTrack({
  setlistId,
  trackIndex,
  currentTracks,
  newTrack,
  previousTrack,
  uid,
  displayName,
  reason,
}: SwapLiveTrackParams): Promise<void> {
  const swapId = crypto.randomUUID()

  // Build new tracks array with the swap applied
  const updatedTracks = [...currentTracks]
  updatedTracks[trackIndex] = {
    ...newTrack,
    liturgicalSlot: previousTrack.liturgicalSlot, // Preserve the slot assignment
  }

  const setlistRef = doc(db, "setlists", setlistId)

  // Atomic setlist update: tracks + liveState.lastSwap
  await updateDoc(setlistRef, {
    tracks: updatedTracks,
    trackCount: updatedTracks.length,
    "liveState.lastSwap": {
      trackIndex,
      previousTitle: previousTrack.title,
      newTitle: newTrack.title,
      swappedBy: uid,
      swappedByName: displayName,
      swappedAt: serverTimestamp(),
      swapId,
    },
  })

  // Append audit trail (non-blocking — don't fail the swap if this errors)
  const historyRef = collection(db, "setlists", setlistId, "swapHistory")
  addDoc(historyRef, {
    trackIndex,
    liturgicalSlot: previousTrack.liturgicalSlot || previousTrack.title,
    previousFileId: previousTrack.fileId || "",
    previousTitle: previousTrack.title,
    newFileId: newTrack.fileId || "",
    newTitle: newTrack.title,
    newKey: newTrack.key || null,
    swappedBy: uid,
    swappedByName: displayName,
    swappedAt: serverTimestamp(),
    reason: reason || null,
  }).catch((e) => logger.warn("[SwapHistory] Failed to write audit entry:", e))
}
```

### 3.2 `useLiveSwapAccess()` Hook

File: `src/hooks/use-live-swap-access.ts`

Follows the `useMonitorAccess` pattern. Derives swap permission from auth context.

```typescript
"use client"

import { useAuth } from "@/lib/auth-context"

/**
 * Returns whether the current user can perform live song swaps.
 *
 * Access granted if ANY of:
 *   - User is admin
 *   - User is band leader
 *   - User has canLiveSwap flag on profile
 *
 * No Firestore read needed — all data comes from auth context / profile.
 */
export function useLiveSwapAccess(): {
  canSwap: boolean
  loading: boolean
} {
  const { user, profile, isAdmin, isBandLeader, loading } = useAuth()

  if (!user || loading) {
    return { canSwap: false, loading }
  }

  const canSwap = isAdmin || isBandLeader || !!profile?.canLiveSwap

  return { canSwap, loading: false }
}
```

### 3.3 `useSongGroups()` Hook

File: `src/hooks/use-song-groups.ts`

Loads the `config/songGroups` document via `useSafeFirestoreSync` and provides lookup helpers.

```typescript
"use client"

import { useMemo } from "react"
import { doc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { useAuth } from "@/lib/auth-context"
import { useSafeFirestoreSync } from "@/hooks/use-safe-firestore-sync"
import { SongGroupsConfig, SongGroup, SongGroupEntry } from "@/types/song-groups"

export function useSongGroups() {
  const { user } = useAuth()

  const ref = useMemo(
    () => (user ? doc(db, "config", "songGroups") : null),
    [user]
  )

  const { data, loading, error } = useSafeFirestoreSync<SongGroupsConfig>(ref)

  /** Get alternatives for a given liturgical slot, excluding the current song */
  const getAlternatives = useMemo(() => {
    if (!data?.groups) return (_slot: string, _currentFileId?: string) => []

    return (liturgicalSlot: string, currentFileId?: string): SongGroupEntry[] => {
      // Find the group that matches this slot
      const group = Object.values(data.groups).find(
        (g) => g.liturgicalSlot === liturgicalSlot
      )
      if (!group) return []
      // Return all songs except the current one
      return group.songs.filter((s) => s.fileId !== currentFileId)
    }
  }, [data])

  /** Check if a slot has swap alternatives available */
  const hasAlternatives = useMemo(() => {
    if (!data?.groups) return (_slot: string, _currentFileId?: string) => false

    return (liturgicalSlot: string, currentFileId?: string): boolean => {
      return getAlternatives(liturgicalSlot, currentFileId).length > 0
    }
  }, [data, getAlternatives])

  /** Get all groups (for admin UI) */
  const allGroups: SongGroup[] = useMemo(() => {
    if (!data?.groups) return []
    return Object.values(data.groups).sort((a, b) => a.sortOrder - b.sortOrder)
  }, [data])

  return { groups: data, allGroups, getAlternatives, hasAlternatives, loading, error }
}
```

### 3.4 API Route: `/api/admin/set-live-swap`

File: `src/app/api/admin/set-live-swap/route.ts`

Mirrors `set-sound-engineer/route.ts` exactly.

```typescript
/**
 * POST /api/admin/set-live-swap
 *
 * Toggles the canLiveSwap flag for a user.
 * Updates both Firestore profile and Firebase Auth custom claims.
 *
 * Body: { targetUserId: string, canLiveSwap: boolean }
 * Requires band_leader role or above.
 */

import { NextResponse } from "next/server"
import { createApiHandler } from "@/lib/api-wrapper"
import { checkRateLimit } from "@/lib/rate-limit"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { getAuth } from "firebase-admin/auth"
import { logger } from "@/lib/logger"
import { z } from "zod"

const schema = z.object({
  targetUserId: z.string().min(1),
  canLiveSwap: z.boolean(),
})

export const POST = createApiHandler(
  async (ctx) => {
    const limited = await checkRateLimit(ctx.req, 'api')
    if (limited) return limited

    const { targetUserId, canLiveSwap } = ctx.body!

    initAdmin()
    const db = getFirestore()
    const fbAuth = getAuth()

    // Update Firestore profile
    await db.collection("users").doc(targetUserId).update({ canLiveSwap })

    // Update custom claims
    try {
      const user = await fbAuth.getUser(targetUserId)
      const currentClaims = user.customClaims || {}
      await fbAuth.setCustomUserClaims(targetUserId, {
        ...currentClaims,
        canLiveSwap,
      })
    } catch (claimErr) {
      logger.warn(`[SetLiveSwap] Failed to update claims for ${targetUserId}:`, claimErr)
    }

    return NextResponse.json({ success: true, canLiveSwap })
  },
  { role: 'band_leader', schema }
)
```

### 3.5 API Route: `/api/admin/song-groups`

File: `src/app/api/admin/song-groups/route.ts`

CRUD operations for managing song groups. Used by the admin group management UI.

```typescript
/**
 * GET /api/admin/song-groups — List all song groups
 * PUT /api/admin/song-groups — Update/create a song group
 * DELETE /api/admin/song-groups?groupId=xxx — Remove a song group
 *
 * Requires band_leader role.
 */

import { NextResponse } from "next/server"
import { createApiHandler } from "@/lib/api-wrapper"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { z } from "zod"
import { FieldValue } from "firebase-admin/firestore"

const putSchema = z.object({
  group: z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    liturgicalSlot: z.string().min(1),
    description: z.string().optional(),
    songs: z.array(z.object({
      fileId: z.string(),
      title: z.string(),
      key: z.string().optional(),
      addedAt: z.string(),
      addedBy: z.string(),
    })),
    sortOrder: z.number(),
  }),
})

// GET: Return all groups
export const GET = createApiHandler(
  async () => {
    initAdmin()
    const db = getFirestore()
    const snap = await db.doc("config/songGroups").get()
    const data = snap.exists ? snap.data() : { groups: {} }
    return NextResponse.json(data)
  },
  { role: 'band_leader' }
)

// PUT: Upsert a group
export const PUT = createApiHandler(
  async (ctx) => {
    const { group } = ctx.body!
    initAdmin()
    const db = getFirestore()
    await db.doc("config/songGroups").set(
      {
        [`groups.${group.id}`]: group,
        updatedAt: new Date().toISOString(),
        updatedBy: ctx.auth!.uid,
      },
      { merge: true }
    )
    return NextResponse.json({ success: true })
  },
  { role: 'band_leader', schema: putSchema }
)

// DELETE: Remove a group
export const DELETE = createApiHandler(
  async (ctx) => {
    const url = new URL(ctx.req.url)
    const groupId = url.searchParams.get("groupId")
    if (!groupId) {
      return NextResponse.json({ error: "groupId required" }, { status: 400 })
    }
    initAdmin()
    const db = getFirestore()
    await db.doc("config/songGroups").update({
      [`groups.${groupId}`]: FieldValue.delete(),
      updatedAt: new Date().toISOString(),
      updatedBy: ctx.auth!.uid,
    })
    return NextResponse.json({ success: true })
  },
  { role: 'band_leader' }
)
```

### 3.6 Migration API: `/api/admin/seed-song-groups`

File: `src/app/api/admin/seed-song-groups/route.ts`

One-time seeding endpoint that:
1. Extracts unique song slot labels from `liturgical-templates.ts`
2. Queries `library_index` for matching files
3. Creates initial `config/songGroups` document

```typescript
/**
 * POST /api/admin/seed-song-groups
 *
 * Seeds the config/songGroups document from liturgical templates
 * and library index. Idempotent — merges with existing groups.
 *
 * Requires admin role.
 */

import { NextResponse } from "next/server"
import { createApiHandler } from "@/lib/api-wrapper"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { TEMPLATE_REGISTRY } from "@/lib/liturgical-templates"

export const POST = createApiHandler(
  async (ctx) => {
    initAdmin()
    const db = getFirestore()

    // 1. Extract unique song slots from all templates
    const slotsMap = new Map<string, { label: string; queries: string[] }>()
    for (const [, slots] of Object.entries(TEMPLATE_REGISTRY)) {
      for (const slot of slots) {
        if (slot.type === 'song' && slot.queries.length > 0 && !slotsMap.has(slot.label)) {
          slotsMap.set(slot.label, { label: slot.label, queries: slot.queries })
        }
      }
    }

    // 2. For each slot, find matching library_index documents
    const groups: Record<string, any> = {}
    let sortOrder = 0

    for (const [label, slotInfo] of slotsMap) {
      const groupId = label.toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')

      // Query library_index for songs matching any of the slot's search queries
      const matchingFiles: any[] = []
      const indexSnap = await db.collection("library_index").limit(500).get()

      for (const fileDoc of indexSnap.docs) {
        const file = fileDoc.data()
        const fileName = (file.name || "").toLowerCase()
        const topics = (file.metadata?.topics || []).map((t: string) => t.toLowerCase())

        const isMatch = slotInfo.queries.some((q) => {
          const qLower = q.toLowerCase()
          return fileName.includes(qLower) || topics.some((t: string) => t.includes(qLower))
        })

        if (isMatch) {
          matchingFiles.push({
            fileId: fileDoc.id,
            title: file.displayName || file.name || "Untitled",
            key: file.metadata?.key || undefined,
            addedAt: new Date().toISOString(),
            addedBy: ctx.auth!.uid,
          })
        }
      }

      if (matchingFiles.length > 0) {
        groups[groupId] = {
          id: groupId,
          label,
          liturgicalSlot: label,
          songs: matchingFiles,
          sortOrder: sortOrder++,
        }
      }
    }

    // 3. Merge with existing config/songGroups (don't overwrite manual edits)
    const existing = await db.doc("config/songGroups").get()
    const existingGroups = existing.exists ? existing.data()?.groups || {} : {}

    const merged = { ...groups }
    // Preserve any manually-created groups not in templates
    for (const [id, group] of Object.entries(existingGroups)) {
      if (!merged[id]) {
        merged[id] = group
      }
    }

    await db.doc("config/songGroups").set({
      groups: merged,
      updatedAt: new Date().toISOString(),
      updatedBy: ctx.auth!.uid,
    })

    return NextResponse.json({
      success: true,
      seededCount: Object.keys(groups).length,
      totalGroups: Object.keys(merged).length,
    })
  },
  { role: 'admin' }
)
```

### 3.7 Auth Context Extension

In `src/lib/auth-context.tsx`, add `canLiveSwap` to the context (following `isSoundEngineer` pattern):

```typescript
// AuthContextType addition:
canLiveSwap: boolean

// In AuthProvider:
const canLiveSwap = isAdmin || isBandLeader || !!profile?.canLiveSwap

// In context value:
canLiveSwap,
```

---

## 4. Component Architecture

### 4.1 Component Tree

```
SetlistView
  └── SetlistRow (per track)
        ├── [existing song content]
        └── SwapButton (NEW — only if canSwap && liveState.enabled && track has alternatives)
              └── (opens) SwapBottomSheet

SwapBottomSheet (NEW — portal/dialog)
  ├── SwapBottomSheet.Header (slot label + current song)
  ├── SwapBottomSheet.AlternativesList
  │     └── SwapAlternativeRow (per alternative song)
  │           ├── Song title + key badge
  │           └── "Swap Now" button
  └── SwapBottomSheet.Footer (cancel button)

SwapToast (NEW — receiver notification)
  └── Renders when liveState.lastSwap changes and user is NOT the swapper
```

### 4.2 `SwapButton` on SetlistRow

File: `src/components/performance/SwapButton.tsx`

```typescript
"use client"

import { ArrowLeftRight } from "lucide-react"
import { SetlistTrack } from "@/types/models"

export interface SwapButtonProps {
  track: SetlistTrack
  hasAlternatives: boolean
  onSwapTap: () => void
}

/**
 * Small icon button shown on eligible SetlistRow items during live mode.
 * Only rendered when:
 *   1. User has canSwap permission
 *   2. Live mode is enabled
 *   3. Track has a liturgicalSlot with alternatives
 */
export function SwapButton({ track, hasAlternatives, onSwapTap }: SwapButtonProps) {
  if (!hasAlternatives) return null

  return (
    <button
      onClick={(e) => {
        e.stopPropagation() // Don't trigger row click
        onSwapTap()
      }}
      className="ml-2 p-2 rounded-lg bg-amber-500/20 text-amber-400 hover:bg-amber-500/30 active:bg-amber-500/40 transition-colors shrink-0 touch-manipulation"
      style={{ minWidth: 44, minHeight: 44 }} // 44px minimum touch target
      aria-label={`Swap ${track.title}`}
      title="Swap with alternative"
    >
      <ArrowLeftRight className="w-5 h-5" />
    </button>
  )
}
```

**Integration into SetlistRow** — Add `SwapButton` at the end of the song content area:

```typescript
// SetlistRow.tsx modifications:

// New props:
export interface SetlistRowProps {
  // ... existing ...
  canSwap?: boolean
  isLiveMode?: boolean
  hasAlternatives?: boolean
  onSwapTap?: () => void
}

// In the song content JSX, after the BPM span:
{canSwap && isLiveMode && hasAlternatives && onSwapTap && (
  <SwapButton
    track={track}
    hasAlternatives={hasAlternatives}
    onSwapTap={onSwapTap}
  />
)}
```

### 4.3 `SwapBottomSheet` Component

File: `src/components/performance/SwapBottomSheet.tsx`

A modal bottom sheet following the app's existing AlertDialog pattern but styled as a bottom sheet for mobile ergonomics.

```typescript
"use client"

import { useState } from "react"
import { SetlistTrack } from "@/types/models"
import { SongGroupEntry } from "@/types/song-groups"
import { cn } from "@/lib/utils"

export interface SwapBottomSheetProps {
  open: boolean
  onClose: () => void
  currentTrack: SetlistTrack
  trackIndex: number
  alternatives: SongGroupEntry[]
  onConfirmSwap: (alternative: SongGroupEntry) => Promise<void>
}

export function SwapBottomSheet({
  open,
  onClose,
  currentTrack,
  trackIndex,
  alternatives,
  onConfirmSwap,
}: SwapBottomSheetProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [swapping, setSwapping] = useState(false)

  if (!open) return null

  const handleSwap = async (alt: SongGroupEntry) => {
    setSwapping(true)
    try {
      await onConfirmSwap(alt)
      onClose()
    } catch {
      // Error handling — toast/log
    } finally {
      setSwapping(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 max-h-[70vh] flex flex-col bg-card border-t border-border rounded-t-2xl animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="px-4 py-3 border-b border-border">
          <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-2" />
          <h3 className="text-lg font-semibold text-foreground">
            Swap: {currentTrack.liturgicalSlot || currentTrack.title}
          </h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            Currently: <span className="text-foreground">{currentTrack.title}</span>
            {currentTrack.key && (
              <span className="ml-1 font-mono text-brand">({currentTrack.key})</span>
            )}
          </p>
        </div>

        {/* Alternatives list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {alternatives.map((alt) => (
            <button
              key={alt.fileId}
              onClick={() => handleSwap(alt)}
              disabled={swapping}
              className={cn(
                "w-full flex items-center justify-between px-4 py-3 rounded-xl mb-1",
                "hover:bg-brand/10 active:bg-brand/20 transition-colors",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                "touch-manipulation"
              )}
              style={{ minHeight: 56 }} // 56px touch target
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-base font-medium text-foreground truncate">
                  {alt.title}
                </span>
                {alt.key && (
                  <span className="font-mono text-sm font-bold px-2 py-0.5 bg-brand/15 text-brand rounded-lg shrink-0">
                    {alt.key}
                  </span>
                )}
              </div>
              <span className="text-sm font-semibold text-amber-400 shrink-0 ml-3">
                Swap Now
              </span>
            </button>
          ))}

          {alternatives.length === 0 && (
            <p className="text-center text-muted-foreground py-8">
              No alternatives available for this slot.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border">
          <button
            onClick={onClose}
            className="w-full py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </>
  )
}
```

**UX flow (3 taps):**
1. Tap swap icon on SetlistRow -> opens bottom sheet
2. Tap an alternative song in the list -> triggers swap
3. (No separate confirmation needed — "Swap Now" label is the affordance. The bottom sheet serves as the confirmation boundary.)

### 4.4 `SwapToast` Component

File: `src/components/performance/SwapToast.tsx`

Renders a brief, non-intrusive toast when a musician receives a swap notification.

```typescript
"use client"

import { useEffect, useState, useRef } from "react"
import { LiveState } from "@/lib/setlist-live"
import { useAuth } from "@/lib/auth-context"

export interface SwapToastProps {
  liveState: LiveState | undefined
}

/**
 * Shows a toast notification when a live swap occurs.
 * Only shown to users who did NOT initiate the swap.
 * Auto-dismisses after 4 seconds.
 */
export function SwapToast({ liveState }: SwapToastProps) {
  const { user } = useAuth()
  const [visible, setVisible] = useState(false)
  const [message, setMessage] = useState("")
  const lastSwapId = useRef<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const swap = liveState?.lastSwap
    if (!swap || !user) return

    // Skip if we initiated this swap
    if (swap.swappedBy === user.uid) return

    // Skip if we already showed this swap
    if (swap.swapId === lastSwapId.current) return

    lastSwapId.current = swap.swapId
    setMessage(`"${swap.previousTitle}" swapped to "${swap.newTitle}"`)
    setVisible(true)

    // Auto-dismiss after 4s
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setVisible(false), 4000)

    return () => clearTimeout(timerRef.current)
  }, [liveState?.lastSwap, user])

  if (!visible) return null

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 max-w-sm animate-in fade-in slide-in-from-top duration-300">
      <div className="bg-amber-500/90 text-black px-4 py-2.5 rounded-xl shadow-lg text-sm font-medium text-center">
        {message}
      </div>
    </div>
  )
}
```

### 4.5 Admin: `canLiveSwap` Toggle in UserRow

Add to `src/components/admin/UserRow.tsx` alongside the existing `soundEngineer` toggle:

```typescript
// New toggle in the user action buttons area:
<button
  onClick={() => toggleLiveSwap(user.uid, !user.canLiveSwap)}
  className={cn(
    "text-xs px-2 py-1 rounded",
    user.canLiveSwap ? "bg-amber-500/20 text-amber-400" : "bg-muted text-muted-foreground"
  )}
>
  {user.canLiveSwap ? "Live Swap: ON" : "Live Swap: OFF"}
</button>
```

The toggle calls `/api/admin/set-live-swap` with the same fetch pattern as the sound engineer toggle.

### 4.6 Admin: Song Group Management UI

File: `src/components/admin/SongGroupManager.tsx`

This is intentionally left unstyled per project convention (admin panels out of scope for design). It provides:

- List of all song groups with their songs
- Add/remove songs from a group (searches library)
- Create new groups
- Reorder groups
- "Seed from Templates" button that calls `/api/admin/seed-song-groups`

**This component is deferred to implementation phase.** The critical path is the runtime swap functionality, not the admin catalog UI.

---

## 5. Data Flow

### 5.1 Happy Path: Director Swaps a Song During Live Service

```
Timeline (estimated latencies):

T+0ms     Director taps swap icon on "L'cha Dodi (Carlebach)" row
          ↓
T+50ms    SwapBottomSheet opens, showing alternatives from useSongGroups()
          (config/songGroups already loaded via onSnapshot — zero fetch latency)
          ↓
T+200ms   Director taps "L'cha Dodi (Klepper)" → "Swap Now"
          ↓
T+250ms   swapLiveTrack() fires:
          - updateDoc(setlistRef, { tracks: [...], "liveState.lastSwap": {...} })
          - addDoc(swapHistory) [non-blocking]
          ↓
T+300ms   Firestore SDK optimistic update — director sees change locally
          ↓
T+400ms   Director's SwapBottomSheet closes
          ↓
T+500-800ms  Firestore onSnapshot fires for ALL connected musicians
             (same-region latency: typically 200-500ms)
          ↓
T+500-800ms  Each musician's useSafeFirestoreSync receives updated setlist doc
             - tracks array has new song at the swapped index
             - liveState.lastSwap has the swap metadata
          ↓
T+500-800ms  SetlistRow re-renders with new track title/key/fileId
             SwapToast appears: '"L'cha Dodi (Carlebach)" swapped to "L'cha Dodi (Klepper)"'
          ↓
T+800ms   If musician had PDFOverlay open on the swapped track:
          - PDFOverlay detects fileId change → loads new PDF
          - Estimated PDF load: 500-2000ms depending on cache
          ↓
T+4800ms  SwapToast auto-dismisses (4s timer)
```

### 5.2 Edge Cases

**Swap while musician is viewing the swapped chart:**
- PDFOverlay receives new `fileId` via track prop change
- It re-fetches the PDF. During load, show a skeleton/spinner with the new song title
- Wake lock stays active (already handled by useWakeLock)

**Swap when musician is offline:**
- Firestore SDK queues the snapshot for when connectivity resumes
- Musician sees the swap when they come back online
- No special handling needed — Firestore SDK handles this natively

**Rapid double-swap (same slot):**
- 2s rate limit in security rules prevents the second write
- Client-side: `swapping` state in SwapBottomSheet disables buttons during the write
- If rate limited, the write rejects — director can retry after 2s

**Live mode disabled during swap:**
- Security rules require `resource.data.liveState.enabled == true`
- If someone disables live mode between tap and confirm, the write is rejected
- Client catches the error and shows a toast

### 5.3 Subscription Architecture

```
No new Firestore subscriptions are needed.

Existing subscriptions that carry swap data:
  ┌────────────────────────────────────┐
  │ useSetlistPerformance(setlistId)   │
  │   → onSnapshot("setlists/{id}")    │
  │   → provides: tracks, liveState    │
  │   → SwapToast reads liveState      │
  │   → SetlistRow reads tracks        │
  └────────────────────────────────────┘

  ┌────────────────────────────────────┐
  │ useSongGroups()                    │
  │   → onSnapshot("config/songGroups")│
  │   → one listener per client        │
  │   → provides: getAlternatives()    │
  └────────────────────────────────────┘

Total new listeners: 1 (config/songGroups, shared across all components)
```

---

## 6. Migration Plan

### 6.1 Auto-Tag Existing Songs with `liturgicalSlot`

Run as part of the `/api/admin/seed-song-groups` endpoint. For each song group created, update the matching `library_index` documents:

```typescript
// Inside seed-song-groups route, after building groups:
for (const group of Object.values(groups)) {
  for (const song of group.songs) {
    await db.collection("library_index").doc(song.fileId).update({
      "metadata.liturgicalSlot": group.liturgicalSlot,
    })
  }
}
```

This is idempotent — running it multiple times just re-writes the same value.

### 6.2 Seed `config/songGroups` from Templates

The `/api/admin/seed-song-groups` endpoint (Section 3.6) handles this. Admin triggers it from the Song Group Manager UI or via direct API call.

**Export the template registry** — add to `liturgical-templates.ts`:
```typescript
export const TEMPLATE_REGISTRY = TEMPLATES
```

### 6.3 Add `canLiveSwap` to Existing Admin Users

Two approaches, executed in order of preference:

**A. Automatic (recommended):** During the first deploy, admins already have full access via `isAdmin()` in security rules and `isAdmin` in auth context. The `useLiveSwapAccess` hook grants access to admins and band leaders without needing the `canLiveSwap` flag. No migration needed for these users.

**B. For non-admin swap directors:** Use the admin UI toggle (Section 4.5) to grant `canLiveSwap` to specific users. This calls `/api/admin/set-live-swap` which sets both the Firestore profile field and the Firebase Auth custom claim.

### 6.4 Backfill `liturgicalSlot` on Existing SetlistTracks

Existing setlists have tracks without `liturgicalSlot`. Two strategies:

**A. Lazy tagging (recommended):** When a setlist is opened in performance mode, check each track against the song groups by `fileId`. If a match is found but `liturgicalSlot` is missing, the UI still works because `useSongGroups().hasAlternatives()` can look up by fileId directly as a fallback:

```typescript
// Fallback in useSongGroups — match by fileId when liturgicalSlot is missing
const getAlternativesByFileId = (fileId: string): SongGroupEntry[] => {
  if (!data?.groups) return []
  for (const group of Object.values(data.groups)) {
    if (group.songs.some(s => s.fileId === fileId)) {
      return group.songs.filter(s => s.fileId !== fileId)
    }
  }
  return []
}
```

**B. Batch migration (optional):** An admin script that reads all setlists, matches track fileIds to song groups, and writes the `liturgicalSlot` field. Low priority — the lazy fallback handles this.

### 6.5 Deployment Order

```
Phase 1: Data layer (no UI changes)
  1. Deploy Firestore security rules (new helper functions + modified setlist rule)
  2. Deploy API routes: set-live-swap, song-groups, seed-song-groups
  3. Deploy type changes: models.ts, schemas.ts, song-groups.ts
  4. Deploy setlist-live.ts with swapLiveTrack()
  5. Run seed-song-groups to populate initial data

Phase 2: UI layer
  6. Deploy auth context extension (canLiveSwap)
  7. Deploy hooks: useLiveSwapAccess, useSongGroups
  8. Deploy components: SwapButton, SwapBottomSheet, SwapToast
  9. Deploy SetlistRow/SetlistView modifications
  10. Deploy admin UI: canLiveSwap toggle in UserRow

Phase 3: Admin tooling (deferred)
  11. Song Group Manager admin page
```

---

## 7. File Inventory

### New Files
| File | Purpose |
|------|---------|
| `src/types/song-groups.ts` | SongGroup, SongGroupEntry, SongGroupsConfig types |
| `src/types/swap-history.ts` | SwapHistoryEntry type |
| `src/hooks/use-live-swap-access.ts` | Permission hook for swap UI gating |
| `src/hooks/use-song-groups.ts` | Song groups data + lookup helpers |
| `src/components/performance/SwapButton.tsx` | Swap icon on SetlistRow |
| `src/components/performance/SwapBottomSheet.tsx` | Alternative picker bottom sheet |
| `src/components/performance/SwapToast.tsx` | Receiver notification toast |
| `src/app/api/admin/set-live-swap/route.ts` | Toggle canLiveSwap permission |
| `src/app/api/admin/song-groups/route.ts` | CRUD for song groups |
| `src/app/api/admin/seed-song-groups/route.ts` | One-time group seeding |

### Modified Files
| File | Change |
|------|--------|
| `src/types/models.ts` | Add `canLiveSwap` to UserProfile, `liturgicalSlot` to SetlistTrack and DriveFile.metadata |
| `src/types/schemas.ts` | Add Zod fields for `canLiveSwap`, `liturgicalSlot` |
| `src/lib/setlist-live.ts` | Add `lastSwap` to LiveState, add `swapLiveTrack()` function |
| `src/lib/auth-context.tsx` | Add `canLiveSwap` to AuthContextType and provider |
| `src/lib/liturgical-templates.ts` | Export `TEMPLATE_REGISTRY` |
| `src/components/performance/SetlistRow.tsx` | Add SwapButton integration |
| `src/components/performance/SetlistView.tsx` | Pass swap props through to SetlistRow |
| `src/components/admin/UserRow.tsx` | Add canLiveSwap toggle button |
| `src/hooks/use-setlist-performance.ts` | Expose liveState for SwapToast |
| `firestore.rules` | Add canLiveSwap(), isNotTooFrequent(), modified update rule, swapHistory rules, songGroups rules |
