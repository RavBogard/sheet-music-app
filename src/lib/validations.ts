import { z } from "zod"

export const transferSetlistSchema = z.object({
    setlistId: z.string().min(1, "Setlist ID is required"),
    newOwnerEmail: z.string().email("Invalid email address")
})
