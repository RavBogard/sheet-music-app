import type { FirestoreDate } from "./models"

/** Append-only audit trail entry for a live song swap */
export interface SwapHistoryEntry {
  id: string                // Auto-generated doc ID
  trackIndex: number        // Position in setlist that was swapped
  liturgicalSlot: string    // Which slot group this belongs to
  previousFileId: string    // The song being replaced
  previousTitle: string
  newFileId: string         // The replacement song
  newTitle: string
  newKey?: string
  swappedBy: string         // UID of director
  swappedByName: string
  swappedAt: FirestoreDate  // serverTimestamp()
  reason?: string           // Optional: "singer running late", etc.
}
