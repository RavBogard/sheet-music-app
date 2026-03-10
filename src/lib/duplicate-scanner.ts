import { levenshteinDistance } from "@/lib/string-utils"
import { DriveFile } from "@/types/models"

export interface DuplicateGroup {
  items: DriveFile[]
  similarity: number
}

const SIMILARITY_THRESHOLD = 0.85

/**
 * Find groups of potential duplicate files based on name similarity.
 * Uses Levenshtein distance with 85% threshold (matches upload-time detection).
 */
export function findDuplicateGroups(files: DriveFile[]): DuplicateGroup[] {
  const normalized = files.map(f => ({
    file: f,
    norm: f.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
  }))

  // Union-Find for grouping
  const parent = new Map<string, string>()
  const find = (id: string): string => {
    if (!parent.has(id)) parent.set(id, id)
    if (parent.get(id) !== id) parent.set(id, find(parent.get(id)!))
    return parent.get(id)!
  }
  const union = (a: string, b: string) => {
    parent.set(find(a), find(b))
  }

  // Track best similarity per pair for group metadata
  const groupSimilarity = new Map<string, number>()

  // O(n²/2) pairwise comparison
  for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      const a = normalized[i]
      const b = normalized[j]
      const maxLen = Math.max(a.norm.length, b.norm.length)
      if (maxLen === 0) continue

      const distance = levenshteinDistance(a.norm, b.norm)
      const similarity = 1 - distance / maxLen

      if (similarity >= SIMILARITY_THRESHOLD) {
        union(a.file.id, b.file.id)
        const root = find(a.file.id)
        const current = groupSimilarity.get(root) ?? 1
        groupSimilarity.set(root, Math.min(current, similarity))
      }
    }
  }

  // Collect groups
  const groups = new Map<string, DriveFile[]>()
  for (const { file } of normalized) {
    const root = find(file.id)
    if (!groups.has(root)) groups.set(root, [])
    groups.get(root)!.push(file)
  }

  // Return only groups with 2+ items, sorted by group size descending
  return Array.from(groups.entries())
    .filter(([, items]) => items.length >= 2)
    .map(([root, items]) => ({
      items: items.sort((a, b) => a.name.localeCompare(b.name)),
      similarity: groupSimilarity.get(root) ?? SIMILARITY_THRESHOLD,
    }))
    .sort((a, b) => b.items.length - a.items.length)
}
