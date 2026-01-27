import { z } from 'zod'

const envSchema = z.object({
    NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1, "Firebase API Key is missing"),
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1),
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1),
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().min(1),
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().min(1),
    NEXT_PUBLIC_FIREBASE_APP_ID: z.string().min(1),
})

export function validateEnv() {
    try {
        envSchema.parse(process.env)
    } catch (e: any) {
        console.error("❌ Invalid environment variables:", e.flatten().fieldErrors)
        // We generally don't want to crash the client in prod for everything, but helpful for dev
    }
}
