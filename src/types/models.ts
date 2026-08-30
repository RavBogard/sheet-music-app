/** Firestore Timestamp — may come as raw object, with toDate() method, or as a Timestamp-like */
export type FirestoreDate = string | Date | number | { seconds: number; nanoseconds?: number; toDate?: () => Date } | { toDate: () => Date }

// corrections for AI Transposer
export interface OMRCorrection {
    id: string
    type: 'add' | 'remove'
    x: number // Percentage (0-100) of container width
    y: number // Percentage (0-100) of container height
    text: string // e.g. "Am7"
    pageIndex: number // 0-indexed
}

export interface DriveFile {
    id: string
    name: string
    displayName?: string
    mimeType: string
    parents?: string[]
    collection?: 'core' | 'supplemental' | 'uploads' | 'nava'
    webContentLink?: string
    thumbnailLink?: string
    metadata?: {
        key?: string
        bpm?: number
        timeSignature?: string
        topics?: string[]
        enrichedAt?: string
        omrCorrections?: OMRCorrection[]
    }
}

/** Track types for service flow items */
export type TrackType = 'song' | 'header' | 'reading' | 'prayer' | 'transition' | 'note'

export interface SetlistTrack {
    id: string
    /** v11-01: tenant scope (optional until v11-01-03 backfill; rules-enforced in v11-01-02). */
    orgId?: string
    title: string
    fileId?: string // Linked Google Drive File ID (PDF/MusicXML)
    fileName?: string // Cached File Name
    mimeType?: string // v70-01-01 Task 4: cached library_index.mimeType for type-aware viewer routing (image charts vs PDF/MusicXML/text).
    audioFileId?: string // Linked Audio File ID (MP3)
    audioFileName?: string // Cached Audio File Name
    key?: string
    tune?: string
    notes?: string
    referenceLink?: string // Link to YouTube/Spotify reference audio
    type?: TrackType // Default: 'song' (backward compatible)
    duration?: string // "3:30" for songs, "~5 min" for liturgical items
    bpm?: number
    leadMusician?: string
    transposition?: number // Per-track transposition in semitones (0 = original key)
    // Service flow fields
    description?: string // Body text for readings/prayers (responsive reading text, stage directions)
    performer?: string // Who leads this moment: "Rabbi", "Cantor", "Congregation", "Band"
    estimatedMinutes?: number // Numeric duration for run sheet time calculations
    pageNumber?: number // Which page of a multi-page PDF to open to (1-indexed)
    unmatched?: boolean // True when template expansion found no matching chart for this slot; title stays clean, search instructions live in notes.
    /**
     * Reference into a liturgy book (siddur/machzor) for this moment —
     * "this row is on p.<folio> of <book>". Distinct from `pageNumber`,
     * which addresses a page of this row's own bonded chart PDF.
     * `folio` is the PRINTED page number, resolved at authoring time from
     * the book registry (src/data/books) so nothing at render time depends
     * on an external repo. `unitId` is an AR-3 stable id and is present only
     * for feed-tier books.
     */
    liturgyRef?: { book: string; unitId?: string; folio: number }
    /**
     * Named congregants honored at this moment — "Rachel Cohen, birthday,
     * lights the candles". Free-text names; not linked to contacts. Printed
     * on the rabbi's service sheet. Never copied by templates or clone.
     */
    honors?: Array<{ name: string; note?: string }>
}

/** A musician assigned to play a specific service/setlist */
export interface SetlistMusician {
    uid?: string        // Present if registered user
    name: string
    email: string
    instrument?: string
}

/**
 * v11.4-03 (D8 item 3): a remembered ad-hoc recipient — a person the system has
 * no account for (no uid). A leader's address book, org-scoped. At least one of
 * email/phone is present (enforced at the MCP create_contact layer). `phone` is
 * stored for the future; SMS sends are held this milestone.
 */
export interface Contact {
    id: string
    orgId: string
    name: string
    email?: string
    phone?: string
    createdBy: string
    createdAt?: unknown   // Firestore Timestamp (serverTimestamp on write)
    updatedAt?: unknown
}

export interface Setlist {
    id: string
    /** v11-01: tenant scope. Optional until the v11-01-03 backfill stamps
     *  existing CRC docs with orgId='crc'; required-ness is enforced by
     *  Firestore rules (v11-01-02), not the type, to stay backward compatible. */
    orgId?: string
    name: string
    date: FirestoreDate
    eventDate?: FirestoreDate
    updatedAt?: FirestoreDate
    trackCount: number
    /** v60-06-02: denormalized count of song-typed tracks. Maintained by
     *  the SetlistGridHydrator reconciler (same pattern as trackCount). */
    songCount?: number
    /** v60-06-02: distinct fileId values across the setlist's tracks.
     *  Maintained by the SetlistGridHydrator reconciler. */
    fileIds?: string[]
    ownerId?: string
    ownerName?: string
    rabbi?: string // Which rabbi is leading this service
    serviceNotes?: string // Service-wide instructions for performers
    /**
     * Registry slug of the liturgy book used at this service (one book per
     * service), e.g. 'crc-friday'. Optional — setlists with no book (a gig,
     * a rehearsal) behave exactly as before. See src/data/books/registry.json.
     */
    book?: string
    musicians?: SetlistMusician[] // Who's playing this service
    isTemplate?: boolean
    templateType?: 'shabbat_morning' | 'friday_night' | 'rosh_hashanah' | 'yom_kippur' | 'festival' | 'other'
    transferredAt?: string
    previousOwnerId?: string
    assignedUids?: string[]
    /** v50-07-03 lazy-hydration marker. `true` once the legacy embedded
     *  `tracks[]` array has been fanned out to top-level `tracks/{id}` docs.
     *  Read-side consumers (perf-view) treat top-level as authoritative for
     *  hydrated setlists. Mirrors `LocalSetlist.hydrated`. */
    hydrated?: boolean
    /** Cycle-2 SEC-004: derived at write time. `true` for setlists owned by
     *  a `test-*` uid (provisioned by `create_test_account`) OR whose name
     *  begins with `[TEST`, `[CYCLE\d+-`, or `[CF\d+-`. /perform's public
     *  listing filters by `isTest === false`. Always written (never
     *  undefined) on new setlists; legacy rows are backfilled by the
     *  admin-only `backfill_setlist_test_flag` MCP tool. */
    isTest?: boolean
}

/**
 * Cycle-2 SEC-004 — shared classifier for "is this setlist a test artifact?"
 * Used at create_setlist write time AND by the admin backfill tool that
 * walks legacy rows. Single source of truth so the write-time + backfill
 * passes never disagree.
 *
 * Truthy when ANY of:
 *  - owner uid matches `TEST_UID_PREFIXES` (cycle-7 Lane 1): `test-…`,
 *    `c<N>i<N>[a]-…`, or `cf<N>-…` — broader than the historical
 *    `startsWith("test-")` so cycle-NN cowork-probe uids classify too.
 *  - setlist name matches `^\[(TEST|CYCLE\d+-|CF\d+-)` — the BRACKETED prefix
 *    convention every cycle's stress-run uses for ad-hoc names.
 *  - setlist name matches the UN-BRACKETED cowork conventions
 *    (`^test-`, `^c<N>i<N>[a]-`, `^cf<N>-`, or `-CLONE-` anywhere). C9I5 §6.2:
 *    cowork instances created admin-OWNED fixtures with these names (so the
 *    uid check above missed them, since the owner is a real admin), and the
 *    bracketed pattern missed them too (no leading `[`). They leaked into the
 *    public `/perform` listing AND escaped the `cleanup_all_test_data` sweep.
 *    Real setlists effectively never start with `test-`/`c\d+i\d+-`/`cf\d+-`
 *    or contain `-CLONE-` (the clone tool's default is "Copy of …"), so the
 *    false-positive risk is negligible.
 */
import { isTestUid } from "@/lib/test-isolation"
export const TEST_SETLIST_NAME_PATTERN = /^\[(TEST|CYCLE\d+-|CF\d+-)/i
export const TEST_SETLIST_NAME_PATTERN_UNBRACKETED =
    /(^(test-|c\d+i\d+[a-z]?-|cf\d+-))|(-CLONE-)/i

export function isTestSetlist(args: {
    name: string | null | undefined
    ownerId: string | null | undefined
}): boolean {
    if (isTestUid(args.ownerId)) return true
    if (args.name && TEST_SETLIST_NAME_PATTERN.test(args.name)) return true
    if (args.name && TEST_SETLIST_NAME_PATTERN_UNBRACKETED.test(args.name))
        return true
    return false
}

/** v70-02: a reference audio recording. NEW top-level recordings/{id}
 *  collection (NOT embedded on song/setlist docs — v7.0 constraint #5).
 *  songId is an OPTIONAL foreign key to songs/{id} — a recording may be
 *  standalone (uploaded before a song link is known) or song-linked. */
export interface Recording {
    id: string
    /** v11-01: tenant scope (optional until v11-01-03 backfill; rules-enforced in v11-01-02). */
    orgId?: string
    songId?: string          // optional FK → songs/{id}
    title: string
    fileName?: string        // original uploaded filename
    mimeType?: string        // audio mime, e.g. 'audio/mpeg'
    storagePath: string      // recordings/{id}.{ext} — see getRecordingStoragePath
    notes?: string           // free-form attribution (v7.0 constraint #4)
    createdAt: FirestoreDate
    createdBy: string        // uid of the uploader
}

export type UserRole = 'admin' | 'band_leader' | 'musician' | 'member' | 'pending' | 'denied'

export interface UserProfile {
    uid: string
    email: string
    displayName: string
    photoURL?: string
    viewedWelcomeModal?: boolean
    role: UserRole
    soundEngineer?: boolean
    canUpload?: boolean
    createdAt?: FirestoreDate
    lastLoginAt?: FirestoreDate
    claimsUpdatedAt?: FirestoreDate
    musicianProfile?: MusicianProfile
    // v11.1-02-02: org membership mirrored from the Auth `orgIds` claim onto the
    // user doc (by /api/admin/set-role) for the People-list display + roster
    // filtering (v11-05-02 rowOrgIds). Absent → default ['crc'] via rowOrgIds.
    orgIds?: string[]
}

/**
 * Musician-specific preferences for transposition, instrument, and print formatting.
 * Stored as a subcollection or field on UserProfile.
 * Used by the per-musician gig packet feature.
 */
export interface MusicianProfile {
    instrument?: string // e.g. "Guitar", "Bass", "Piano", "Trumpet"
    defaultTransposition?: number // Instrument transposition offset in semitones (e.g., Bb trumpet = -2)
    preferCapo?: boolean // Whether to show capo notation instead of transposed chords
    preferredCapoFret?: number // Default capo position (e.g., 7 for guitar in Am → Em shape)
    preferFlats?: boolean // Prefer flat notation (Bb) over sharps (A#)
    // Scheduling fields
    phone?: string // For SMS notifications
    schedulingTier?: SchedulingTier // 'core' | 'regular' | 'guest'
    calendarFeedToken?: string // Unique token for iCal feed URL
    notificationPreferences?: {
        email: boolean
        sms: boolean
        push: boolean
    }
}

// ── Scheduling Types ──

/** Scheduling tier determines the default confirmation behavior */
export type SchedulingTier = 'core' | 'regular' | 'guest'

/** Assignment status tracks the lifecycle of a scheduling request */
export type AssignmentStatus = 'pending' | 'confirmed' | 'declined' | 'cancelled'

/** A musician's scheduling assignment for a specific setlist/service */
export interface SchedulingAssignment {
    id: string
    /** v11-05-03: tenant scope, denormalized from the parent setlist's orgId at
     *  create. Optional until the backfill stamps legacy rows; reads default a
     *  missing value to 'crc' via rowOrg (CRC-safe without backfill). */
    orgId?: string
    setlistId: string
    setlistName: string           // Denormalized
    eventDate: FirestoreDate | null
    serviceType?: string          // 'friday_night' | 'shabbat_morning' | etc.

    // Musician
    musicianUid: string
    musicianName: string
    musicianEmail: string
    musicianPhone?: string
    instrument?: string

    // Status
    status: AssignmentStatus
    autoConfirmed: boolean        // true for core musicians (assumed confirmed)
    respondedAt?: FirestoreDate
    declineReason?: string

    // Audit
    assignedBy: string
    assignedByName: string
    assignedAt: FirestoreDate
    notifiedVia?: ('email' | 'sms' | 'push' | 'in_app')[]
}

/** Rabbi musical profile for scheduling guidance */
export interface RabbiProfile {
    name: string                  // "Rabbi Daniel", "Rabbi Randy", "Rabbi Karen"
    musicalRole: 'band_leader' | 'strummer' | 'non_musical'
    instruments?: string[]        // ["acoustic_guitar", "voice"]
    bandSizeGuidance: string      // "Smaller band OK — Rabbi leads guitar + vocals"
    notes?: string                // Freeform scheduling notes
}

/** Scheduling history entry for analytics */
export interface SchedulingHistory {
    musicianUid: string
    setlistId: string
    eventDate: FirestoreDate | null
    serviceType?: string
    instrument?: string
    status: 'played' | 'declined' | 'cancelled' | 'no_show'
    recordedAt: FirestoreDate
}


