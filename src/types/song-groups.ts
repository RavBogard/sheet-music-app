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
  liturgicalSlot: string // Canonical slot identifier
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
