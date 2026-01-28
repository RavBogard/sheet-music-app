import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

export const env = createEnv({
    server: {
        FIREBASE_SERVICE_ACCOUNT_KEY: z.string().optional(), // Optional as it might be used only on server or constructed
        // Add other server-only vars here
    },
    client: {
        NEXT_PUBLIC_FIREBASE_API_KEY: z.string().optional(),
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().optional(),
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().optional(),
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().optional(),
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().optional(),
        NEXT_PUBLIC_FIREBASE_APP_ID: z.string().optional(),
        NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: z.string().optional(),
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().optional(),
        NEXT_PUBLIC_GOOGLE_API_KEY: z.string().optional(),
        UPSTASH_REDIS_REST_URL: z.string().optional(),
        UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
    },
    runtimeEnv: {
        FIREBASE_SERVICE_ACCOUNT_KEY: process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
        NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
        NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
        NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        NEXT_PUBLIC_GOOGLE_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_API_KEY,
        UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
        UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    },
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
    emptyStringAsUndefined: true,
})
