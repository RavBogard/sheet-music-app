export interface DriveFile {
    id: string
    name: string
    mimeType: string
    parents?: string[]
}

export interface SetlistTrack {
    id: string
    title: string
    fileId?: string // Linked Google Drive File ID (PDF/MusicXML)
    audioFileId?: string // Linked Audio File ID (MP3)
    key?: string
    notes?: string
    type?: 'header' | 'song'
    duration?: string
}

export interface Setlist {
    id: string
    name: string
    date: any // Timestamp | Date
    eventDate?: any // Timestamp | string
    tracks: SetlistTrack[]
    trackCount: number
    isPublic?: boolean
    ownerId?: string
    ownerName?: string
    isTemplate?: boolean
    templateType?: 'shabbat_morning' | 'friday_night' | 'other'
}
