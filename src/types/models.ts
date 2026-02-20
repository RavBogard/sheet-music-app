/** Firestore Timestamp — may come as raw object or with toDate() method */
export type FirestoreDate = string | Date | { seconds: number; nanoseconds: number; toDate?: () => Date }

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
    mimeType: string
    parents?: string[]
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
    title: string
    fileId?: string // Linked Google Drive File ID (PDF/MusicXML)
    fileName?: string // Cached File Name
    audioFileId?: string // Linked Audio File ID (MP3)
    audioFileName?: string // Cached Audio File Name
    key?: string
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
}

/** A musician assigned to play a specific service/setlist */
export interface SetlistMusician {
    uid?: string        // Present if registered user
    name: string
    email: string
    instrument?: string
}

export interface Setlist {
    id: string
    name: string
    date: FirestoreDate
    eventDate?: FirestoreDate
    updatedAt?: FirestoreDate
    tracks: SetlistTrack[]
    trackCount: number
    isPublic?: boolean
    ownerId?: string
    ownerName?: string
    rabbi?: string // Which rabbi is leading this service
    serviceNotes?: string // Service-wide instructions for performers
    musicians?: SetlistMusician[] // Who's playing this service
    isTemplate?: boolean
    templateType?: 'shabbat_morning' | 'friday_night' | 'rosh_hashanah' | 'yom_kippur' | 'festival' | 'other'
    transferredAt?: string
    previousOwnerId?: string
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
    createdAt?: FirestoreDate
    lastLoginAt?: FirestoreDate
    claimsUpdatedAt?: FirestoreDate
    musicianProfile?: MusicianProfile
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
}

