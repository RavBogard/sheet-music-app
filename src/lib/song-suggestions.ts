/**
 * Smart Song Suggestions
 *
 * Generates contextual song suggestions for the Add Songs modal based on:
 * - Frequently used songs (staples)
 * - Songs not played recently (fresh rotation)
 * - Usage data from /api/library/usage
 *
 * All logic is client-side; usage data is fetched once per modal open.
 */

import { DriveFile } from "@/types/models"

export interface UsageInfo {
    lastUsedDate: string
    totalUses: number
    lastUsedSetlistName: string
}

export interface SongSuggestion {
    file: DriveFile
    reason: string
    category: 'staple' | 'fresh'
}

/**
 * Fetch usage summaries for a batch of file IDs.
 * Returns a map of fileId → UsageInfo (null entries omitted).
 */
export async function fetchUsageData(
    fileIds: string[]
): Promise<Map<string, UsageInfo>> {
    if (fileIds.length === 0) return new Map()

    const result = new Map<string, UsageInfo>()

    // Batch in chunks of 100 (API limit)
    for (let i = 0; i < fileIds.length; i += 100) {
        const chunk = fileIds.slice(i, i + 100)
        try {
            const res = await fetch(`/api/library/usage?fileIds=${chunk.join(',')}`)
            if (!res.ok) continue
            const data = await res.json()
            for (const [id, info] of Object.entries(data)) {
                if (info) result.set(id, info as UsageInfo)
            }
        } catch {
            // Network error — skip this batch, suggestions degrade gracefully
        }
    }

    return result
}

/**
 * Generate smart song suggestions.
 *
 * @param library - All library files (non-folder)
 * @param usageMap - Usage data from fetchUsageData()
 * @param currentTrackFileIds - File IDs already in the setlist
 * @param limit - Max suggestions per category
 */
export function getSuggestions(
    library: DriveFile[],
    usageMap: Map<string, UsageInfo>,
    currentTrackFileIds: Set<string>,
    limit: number = 6
): SongSuggestion[] {
    const now = Date.now()
    const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000

    // Filter to songs not already in the setlist
    const candidates = library.filter(f =>
        !f.mimeType.includes('folder') &&
        !currentTrackFileIds.has(f.id)
    )

    // Separate into used and unused
    const withUsage: Array<{ file: DriveFile; usage: UsageInfo }> = []
    const unused: DriveFile[] = []

    for (const file of candidates) {
        const usage = usageMap.get(file.id)
        if (usage) {
            withUsage.push({ file, usage })
        } else {
            unused.push(file)
        }
    }

    // STAPLES: most frequently used songs (3+ uses)
    const staples = withUsage
        .filter(({ usage }) => usage.totalUses >= 3)
        .sort((a, b) => b.usage.totalUses - a.usage.totalUses)
        .slice(0, limit)
        .map(({ file, usage }): SongSuggestion => ({
            file,
            reason: `Used ${usage.totalUses}× — ${usage.lastUsedSetlistName}`,
            category: 'staple',
        }))

    // FRESH: songs not played in 90+ days, or never played
    const staleUsed = withUsage
        .filter(({ usage }) => {
            const lastDate = new Date(usage.lastUsedDate).getTime()
            return (now - lastDate) > NINETY_DAYS
        })
        .sort((a, b) => new Date(a.usage.lastUsedDate).getTime() - new Date(b.usage.lastUsedDate).getTime())
        .slice(0, limit)
        .map(({ file, usage }): SongSuggestion => {
            const daysSince = Math.round((now - new Date(usage.lastUsedDate).getTime()) / (24 * 60 * 60 * 1000))
            return {
                file,
                reason: `Not played in ${daysSince} days`,
                category: 'fresh',
            }
        })

    // Add some never-played songs to fresh
    const neverPlayed = unused
        .slice(0, Math.max(0, limit - staleUsed.length))
        .map((file): SongSuggestion => ({
            file,
            reason: 'Never played',
            category: 'fresh',
        }))

    const fresh = [...staleUsed, ...neverPlayed].slice(0, limit)

    // Interleave: alternate staple, fresh
    const result: SongSuggestion[] = []
    const maxLen = Math.max(staples.length, fresh.length)
    for (let i = 0; i < maxLen; i++) {
        if (i < staples.length) result.push(staples[i])
        if (i < fresh.length) result.push(fresh[i])
    }

    return result
}
