/**
 * API Auth Middleware
 * 
 * Eliminates the repeated auth boilerplate across API routes.
 * Every route had 8-12 lines of identical token extraction + verification.
 * 
 * Usage:
 *   const auth = await requireAuth(req)            // Any signed-in user
 *   const auth = await requireAuth(req, 'admin')   // Admin only
 *   const auth = await requireAuth(req, 'member')  // Member+ (member, leader, admin)
 */

import { NextRequest, NextResponse } from "next/server"
import { initAdmin, verifyIdToken, getAuth } from "@/lib/firebase-admin"
import { DecodedIdToken } from "firebase-admin/auth"
import { logger } from "@/lib/logger"

export type AuthRole = 'admin' | 'leader' | 'member'

export interface AuthResult {
    uid: string
    email: string | undefined
    token: DecodedIdToken
    role: string | undefined
    isAdmin: boolean
}

const SUPER_ADMIN_UID = '93Xn3DbS0bSNb8zmfzLyfOMX1Ai3'

/**
 * Verify the request has a valid Firebase auth token.
 * Optionally checks that the user has the required role.
 * 
 * Returns AuthResult on success, throws NextResponse on failure.
 */
export async function requireAuth(
    req: NextRequest | Request,
    requiredRole?: AuthRole
): Promise<AuthResult> {
    const authHeader = req.headers.get("Authorization")
    const rawToken = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null

    if (!rawToken) {
        throw NextResponse.json(
            { error: "Authentication required" },
            { status: 401 }
        )
    }

    initAdmin()
    const decoded = await verifyIdToken(rawToken)

    if (!decoded) {
        throw NextResponse.json(
            { error: "Invalid or expired token" },
            { status: 403 }
        )
    }

    const userRole = (decoded.role as string) || undefined
    const isAdmin = decoded.uid === SUPER_ADMIN_UID || userRole === 'admin'

    // Role hierarchy: admin > leader > member > (none)
    if (requiredRole) {
        const hasRole = checkRoleHierarchy(userRole, isAdmin, requiredRole)
        if (!hasRole) {
            throw NextResponse.json(
                { error: `Requires ${requiredRole} role` },
                { status: 403 }
            )
        }
    }

    return {
        uid: decoded.uid,
        email: decoded.email,
        token: decoded,
        role: userRole,
        isAdmin
    }
}

function checkRoleHierarchy(userRole: string | undefined, isAdmin: boolean, required: AuthRole): boolean {
    if (isAdmin) return true
    if (required === 'admin') return false
    if (required === 'leader') return userRole === 'leader'
    if (required === 'member') return userRole === 'member' || userRole === 'leader'
    return false
}

/**
 * Wrapper that catches auth errors and returns them as NextResponse.
 * Use in route handlers:
 * 
 *   const auth = await withAuth(req)
 *   if (auth instanceof NextResponse) return auth
 */
export async function withAuth(
    req: NextRequest | Request,
    requiredRole?: AuthRole
): Promise<AuthResult | NextResponse> {
    try {
        return await requireAuth(req, requiredRole)
    } catch (error) {
        if (error instanceof NextResponse) return error
        logger.error("Auth middleware error:", error)
        return NextResponse.json({ error: "Authentication failed" }, { status: 500 })
    }
}
