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
import { initAdmin, verifyIdToken } from "@/lib/firebase-admin"
import { DecodedIdToken } from "firebase-admin/auth"
import { logger } from "@/lib/logger"

export type AuthRole = 'admin' | 'band_leader' | 'musician' | 'member'

export interface AuthResult {
    uid: string
    email: string | undefined
    token: DecodedIdToken
    role: string | undefined
    isAdmin: boolean
    isBandLeader: boolean
    isMusician: boolean
}

function getSuperAdminUid(): string | null {
    return process.env.SUPER_ADMIN_UID || null
}

/**
 * Verify the request has a valid Firebase auth token.
 * Optionally checks that the user has the required role.
 * 
 * Returns AuthResult on success, throws NextResponse on failure.
 */
export async function requireAuth(req: NextRequest | Request, requiredRole?: AuthRole, optional?: false): Promise<AuthResult>;
export async function requireAuth(req: NextRequest | Request, requiredRole: AuthRole | undefined, optional: true): Promise<AuthResult | null>;
export async function requireAuth(
    req: NextRequest | Request,
    requiredRole?: AuthRole,
    optional: boolean = false
): Promise<AuthResult | null> {
    const authHeader = req.headers.get("Authorization")
    const rawToken = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null

    if (!rawToken) {
        if (optional) return null;
        throw NextResponse.json(
            { error: "Authentication required" },
            { status: 401 }
        )
    }

    if (!initAdmin()) {
        throw NextResponse.json(
            { error: "Firebase Admin not available" },
            { status: 500 }
        )
    }
    const decoded = await verifyIdToken(rawToken)

    if (!decoded) {
        if (optional) return null;
        throw NextResponse.json(
            { error: "Invalid or expired token" },
            { status: 403 }
        )
    }

    const userRole = (decoded.role as string) || undefined
    const superAdminUid = getSuperAdminUid()
    const isAdmin = (superAdminUid && decoded.uid === superAdminUid) || userRole === 'admin'
    const isBandLeader = isAdmin || userRole === 'band_leader'
    const isMusician = isBandLeader || userRole === 'musician'

    // Role hierarchy: admin > band_leader > musician > member > pending
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
        isAdmin,
        isBandLeader,
        isMusician,
    }
}

function checkRoleHierarchy(userRole: string | undefined, isAdmin: boolean, required: AuthRole): boolean {
    if (isAdmin) return true
    if (required === 'admin') return false

    const hierarchy: Record<string, number> = {
        'admin': 4,
        'band_leader': 3,
        'musician': 2,
        'member': 1,
        'pending': 0,
    }

    const userLevel = hierarchy[userRole || ''] ?? -1
    const requiredLevel = hierarchy[required] ?? 99
    return userLevel >= requiredLevel
}

/**
 * Wrapper that catches auth errors and returns them as NextResponse.
 * Use in route handlers:
 * 
 *   const auth = await withAuth(req)
 *   if (auth instanceof NextResponse) return auth
 */
export async function withAuth(req: NextRequest | Request, requiredRole?: AuthRole, optional?: false): Promise<AuthResult | NextResponse>;
export async function withAuth(req: NextRequest | Request, requiredRole: AuthRole | undefined, optional: true): Promise<AuthResult | null | NextResponse>;
export async function withAuth(
    req: NextRequest | Request,
    requiredRole?: AuthRole,
    optional: boolean = false
): Promise<AuthResult | null | NextResponse> {
    try {
        return optional
            ? await requireAuth(req, requiredRole, true)
            : await requireAuth(req, requiredRole)
    } catch (error) {
        if (error instanceof NextResponse) return error
        logger.error("Auth middleware error:", error)
        return NextResponse.json({ error: "Authentication failed" }, { status: 500 })
    }
}
