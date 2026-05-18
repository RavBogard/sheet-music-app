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
import {
    generateRequestId,
    requestIdStorage,
    validateInboundRequestId,
} from "@/lib/request-id"
import { httpError } from "@/lib/http/error-envelope"

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
        // Cycle-5 C5C-001/002 — rich envelope on the 401 so any
        // createApiHandler-wrapped route (incl. /api/drive/metadata +
        // /api/library/list) ships the canonical `{ok:false, error:{
        // code, machine_code, message, ...}, hint?}` shape on auth
        // failures. Replaces the pre-cycle-5 flat `{error:"..."}`.
        throw httpError(
            401,
            "missing_bearer",
            "Authentication required",
            { errorCode: 401 },
            "Send `Authorization: Bearer <token>`.",
        )
    }

    if (!initAdmin()) {
        throw httpError(
            500,
            "server_not_ready",
            "Firebase Admin not available",
            { errorCode: 500 },
        )
    }
    const decoded = await verifyIdToken(rawToken)

    if (!decoded) {
        if (optional) return null;
        // Status preserved at 403 for back-compat with existing callers;
        // `error.code` set explicitly so it matches the HTTP status (the
        // ERROR_CODE_MAP would default `invalid_bearer` to 401).
        throw httpError(
            403,
            "invalid_bearer",
            "Invalid or expired token",
            { errorCode: 403 },
            "The bearer token failed verification — re-issue and retry.",
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
            throw httpError(
                403,
                "forbidden_role",
                `Requires ${requiredRole} role`,
                {
                    errorCode: 403,
                    callerRole: userRole ?? null,
                    requiredRole,
                },
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
        return httpError(
            500,
            "server_error",
            "Authentication failed",
            { errorCode: 500 },
        )
    }
}

/**
 * Request-ID wrapper for routes that don't use `createApiHandler` (e.g.,
 * streaming SSE routes). Additive — preserves any existing handler wiring.
 * Runs the handler inside the AsyncLocalStorage request-id scope and stamps
 * the returned response with the `x-request-id` header.
 *
 * Usage:
 *   export const POST = (req: NextRequest) => wrapWithRequestId(req, async (rid) => {
 *     // ...build streaming response...
 *   })
 */
export async function wrapWithRequestId(
    req: NextRequest | Request,
    handler: (requestId: string) => Promise<NextResponse | Response> | NextResponse | Response,
): Promise<NextResponse | Response> {
    const inbound = validateInboundRequestId(req.headers.get("x-request-id"))
    const requestId = inbound ?? generateRequestId()
    return requestIdStorage.run({ requestId }, async () => {
        const response = await handler(requestId)
        try {
            response.headers.set("x-request-id", requestId)
        } catch {
            // Some Response objects have immutable headers — best-effort only.
        }
        return response
    })
}
