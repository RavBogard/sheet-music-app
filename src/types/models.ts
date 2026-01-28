export interface DriveFile {
    id: string
    name: string
    mimeType: string
    parents?: string[]
    webContentLink?: string
    thumbnailLink?: string
}

export interface SetlistTrack {
    id: string
    title: string
    fileId?: string // Linked Google Drive File ID (PDF/MusicXML)
    fileName?: string // Cached File Name
    audioFileId?: string // Linked Audio File ID (MP3)
    audioFileName?: string // Cached Audio File Name
    key?: string
    notes?: string
    type?: 'header' | 'song'
    duration?: string
}

export interface Setlist {
    id: string
    name: string
    date: any // Timestamp | Date - TODO: Standardization to Date or number in future
    eventDate?: string | any // Timestamp | string
    tracks: SetlistTrack[]
    trackCount: number
    isPublic?: boolean
    ownerId?: string
    ownerName?: string
    isTemplate?: boolean
    templateType?: 'shabbat_morning' | 'friday_night' | 'other'
    transferredAt?: string
    previousOwnerId?: string
}

export type UserRole = 'admin' | 'leader' | 'member' | 'pending'

export interface UserProfile {
    uid: string
    email: string
    displayName: string
    photoURL?: string
    viewedWelcomeModal?: boolean
    role: UserRole
    createdAt?: any
    lastLoginAt?: any
}
