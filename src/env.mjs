import { createEnv } from "@t3-oss/env-nextjs"
import { z } from "zod"

// v4.3 P10-01: secrets the app cannot run without on Vercel Production
// are required there, optional everywhere else (local builds, preview
// deploys, tests). We key on VERCEL_ENV (set only on Vercel) rather than
// NODE_ENV (which is "production" during any local `next build`) so
// `npm run build` on a developer machine still works without prod secrets.
const isVercelProd = process.env.VERCEL_ENV === "production"
const prodRequired = (name) =>
    isVercelProd
        ? z.string().min(1, `${name} is required on Vercel Production`)
        : z.string().optional()

export const env = createEnv({
    server: {
        FIREBASE_SERVICE_ACCOUNT_KEY: z.string().optional(),
        FIREBASE_CLIENT_EMAIL: prodRequired("FIREBASE_CLIENT_EMAIL"),
        FIREBASE_PRIVATE_KEY: prodRequired("FIREBASE_PRIVATE_KEY"),
        GOOGLE_SERVICE_ACCOUNT_EMAIL: z.string().optional(),
        GOOGLE_PRIVATE_KEY: z.string().optional(),
        GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
        UPSTASH_REDIS_REST_URL: z.string().optional(),
        UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
        RESEND_API_KEY: z.string().optional(),
        RESEND_FROM_EMAIL: z.string().email().optional(),
        RESEND_WEBHOOK_SECRET: z.string().optional(),
        BRIDGE_ALERT_EMAIL: z.string().email().optional(),
        // Optional — cron routes reject with 401 when missing, which is
        // fine if no Vercel cron is configured. Not required-in-prod.
        CRON_SECRET: z.string().optional(),
        SUPER_ADMIN_UID: z.string().optional(),
        SESSION_ROLE_SECRET: prodRequired("SESSION_ROLE_SECRET"),
        BACKUP_BUCKET: z.string().optional(),
        GOOGLE_DRIVE_ROOT_FOLDER_ID: z.string().optional(),
        // Cycle-3 NEW-1 (drive-sync importer). Parent folder David Lazaroff
        // drops chart files into; the /api/cron/drive-sync cron watches this
        // folder + its direct subfolders every 5 min. Optional — when unset,
        // the cron is a graceful no-op so the route ships dormant until
        // Daniel configures it. Distinct from GOOGLE_DRIVE_ROOT_FOLDER_ID
        // (which the legacy /api/cron/sync hourly mirror uses).
        DAVID_DRIVE_DROP_FOLDER_ID: z.string().optional(),
    },
    client: {
        NEXT_PUBLIC_FIREBASE_API_KEY: z.string().min(1, "Firebase API key is required"),
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: z.string().min(1, "Firebase auth domain is required"),
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: z.string().min(1, "Firebase project ID is required"),
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: z.string().optional(),
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: z.string().optional(),
        NEXT_PUBLIC_FIREBASE_APP_ID: z.string().optional(),
        NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: z.string().optional(),
        NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().optional(),
        NEXT_PUBLIC_GOOGLE_API_KEY: z.string().optional(),
    },
    runtimeEnv: {
        FIREBASE_SERVICE_ACCOUNT_KEY: process.env.FIREBASE_SERVICE_ACCOUNT_KEY,
        FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL,
        FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY,
        GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        GOOGLE_PRIVATE_KEY: process.env.GOOGLE_PRIVATE_KEY,
        GOOGLE_GENERATIVE_AI_API_KEY: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
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
        RESEND_API_KEY: process.env.RESEND_API_KEY,
        RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
        BRIDGE_ALERT_EMAIL: process.env.BRIDGE_ALERT_EMAIL,
        CRON_SECRET: process.env.CRON_SECRET,
        SUPER_ADMIN_UID: process.env.SUPER_ADMIN_UID,
        SESSION_ROLE_SECRET: process.env.SESSION_ROLE_SECRET,
        RESEND_WEBHOOK_SECRET: process.env.RESEND_WEBHOOK_SECRET,
        BACKUP_BUCKET: process.env.BACKUP_BUCKET,
        GOOGLE_DRIVE_ROOT_FOLDER_ID: process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID,
        DAVID_DRIVE_DROP_FOLDER_ID: process.env.DAVID_DRIVE_DROP_FOLDER_ID,
    },
    skipValidation: !!process.env.SKIP_ENV_VALIDATION,
    emptyStringAsUndefined: true,
})
