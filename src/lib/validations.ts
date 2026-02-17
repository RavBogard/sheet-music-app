import { z } from "zod"

/** Valid track types for service flow items */
export const VALID_TRACK_TYPES = ['song', 'header', 'reading', 'prayer', 'transition', 'note'] as const
export type ValidTrackType = typeof VALID_TRACK_TYPES[number]

export function isValidTrackType(type: string): type is ValidTrackType {
    return (VALID_TRACK_TYPES as readonly string[]).includes(type)
}

/** Non-song track types that appear as service flow items */
export const SERVICE_FLOW_TYPES = ['reading', 'prayer', 'transition', 'note'] as const

export const transferSetlistSchema = z.object({
    setlistId: z.string().min(1, "Setlist ID is required"),
    newOwnerEmail: z.string().email("Invalid email address")
})

export const createSetlistSchema = z.object({
    name: z.string().min(1, "Name is required"),
    tracks: z.array(z.any()), // Refine this later with Track schema
    isPublic: z.boolean().optional()
})

export const updateRoleSchema = z.object({
    targetUserId: z.string(),
    newRole: z.enum(['admin', 'leader', 'member', 'pending'])
})
