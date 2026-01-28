import { z } from "zod"

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
