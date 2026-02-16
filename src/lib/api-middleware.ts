import { NextResponse } from "next/server"
import { verifyIdToken } from "@/lib/firebase-admin"
import { globalLimiter } from "@/lib/rate-limit"
import { ZodError } from "zod"
import { logger } from "@/lib/logger"

// DecodedIdToken-compatible shape from firebase-admin
interface DecodedToken {
    uid: string
    email?: string
    [key: string]: unknown
}

type ApiHandler = (req: Request, context: { params: Record<string, string> }) => Promise<NextResponse>
type AuthedApiHandler = (req: Request, context: { params: Record<string, string> }, user: DecodedToken) => Promise<NextResponse>

type UserRole = 'admin' | 'leader' | 'member' | 'pending'

const ROLE_HIERARCHY: Record<UserRole, number> = {
    admin: 4,
    leader: 3,
    member: 2,
    pending: 1,
}

interface MiddlewareOptions {
    /** Skip auth entirely (public endpoint) */
    isPublic?: boolean
    /** Minimum role required. Checks Firestore users/{uid}.role */
    role?: UserRole
    /** Skip rate limiting */
    rateLimit?: boolean
}

/**
 * API middleware wrapper.
 * 
 * Usage:
 *   export const POST = withAuth(handler)                          // Requires any authenticated user
 *   export const POST = withAuth(handler, { role: 'admin' })       // Requires admin role
 *   export const POST = withAuth(handler, { isPublic: true })      // No auth required
 *   export const GET = withAuth(handler, { role: 'leader' })       // Requires leader or admin
 * 
 * The handler receives the decoded user token as a third argument when auth is required.
 */
export function withAuth(handler: ApiHandler | AuthedApiHandler, options: MiddlewareOptions = {}): ApiHandler {
    return async (req: Request, context: { params: Record<string, string> }) => {
        try {
            // 1. Rate Limiting
            if (options.rateLimit !== false) {
                const ip = req.headers.get("x-forwarded-for") || "unknown"
                const allowed = await globalLimiter.check(ip)
                if (!allowed) {
                    return NextResponse.json(
                        { error: "Too Many Requests", code: "rate_limit_exceeded" },
                        { status: 429 }
                    )
                }
            }

            // 2. Authentication
            if (!options.isPublic) {
                const authHeader = req.headers.get("Authorization")
                const token = authHeader?.split("Bearer ")[1]

                if (!token) {
                    return NextResponse.json(
                        { error: "Unauthorized", code: "missing_token" },
                        { status: 401 }
                    )
                }

                const decodedToken = await verifyIdToken(token)
                if (!decodedToken) {
                    return NextResponse.json(
                        { error: "Invalid Token", code: "invalid_token" },
                        { status: 403 }
                    )
                }

                // 3. Role check (if specified)
                if (options.role) {
                    const { initAdmin, getFirestore } = await import("@/lib/firebase-admin")
                    initAdmin()
                    const db = getFirestore()
                    const userDoc = await db.collection("users").doc(decodedToken.uid).get()
                    const userRole = (userDoc.data()?.role as UserRole) || "pending"
                    const requiredLevel = ROLE_HIERARCHY[options.role] || 0
                    const userLevel = ROLE_HIERARCHY[userRole] || 0

                    if (userLevel < requiredLevel) {
                        return NextResponse.json(
                            { error: "Forbidden", code: "insufficient_role", required: options.role, actual: userRole },
                            { status: 403 }
                        )
                    }
                }

                // Pass decoded token to handler
                return await (handler as AuthedApiHandler)(req, context, decodedToken as DecodedToken)
            }

            // 4. Public endpoint — no user token
            return await (handler as ApiHandler)(req, context)

        } catch (error) {
            logger.error("[API Middleware Error]:", error)

            if (error instanceof ZodError) {
                return NextResponse.json(
                    { error: "Validation Error", details: error.issues },
                    { status: 400 }
                )
            }

            return NextResponse.json(
                { error: "Internal Server Error", message: String(error) },
                { status: 500 }
            )
        }
    }
}
