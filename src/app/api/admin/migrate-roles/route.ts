/**
 * POST /api/admin/migrate-roles
 *
 * One-time migration from old role system to new role hierarchy.
 *
 * Old roles → New roles:
 *   admin   → admin (unchanged)
 *   leader  → band_leader
 *   member  → musician (all current "members" are band musicians)
 *   pending → pending (unchanged)
 *
 * Also sets soundEngineer flag for Daniel (admin/backup sound).
 * Updates both Firestore docs and Firebase Auth custom claims.
 *
 * Requires admin role. Safe to run multiple times (idempotent).
 */

import { NextRequest, NextResponse } from "next/server"
import { withAuth } from "@/lib/api-auth"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { getAuth } from "firebase-admin/auth"
import { logger } from "@/lib/logger"

const ROLE_MAP: Record<string, string> = {
    leader: "band_leader",
    member: "musician",
    // admin and pending stay the same
}

const SUPER_ADMIN_UID = "93Xn3DbS0bSNb8zmfzLyfOMX1Ai3"

export async function POST(request: NextRequest) {
    try {
        const auth = await withAuth(request, "admin")
        if (auth instanceof NextResponse) return auth

        initAdmin()
        const db = getFirestore()
        const fbAuth = getAuth()

        const usersSnap = await db.collection("users").get()
        const results: Array<{ uid: string; name: string; oldRole: string; newRole: string; soundEngineer?: boolean }> = []
        let unchanged = 0

        for (const doc of usersSnap.docs) {
            const data = doc.data()
            const oldRole = data.role || "pending"
            const newRole = ROLE_MAP[oldRole] || oldRole
            const updates: Record<string, unknown> = {}

            // Map role if changed
            if (newRole !== oldRole) {
                updates.role = newRole
            }

            // Set soundEngineer for admin (Daniel = backup sound engineer)
            if (doc.id === SUPER_ADMIN_UID && !data.soundEngineer) {
                updates.soundEngineer = true
            }

            if (Object.keys(updates).length > 0) {
                // Update Firestore
                await doc.ref.update(updates)

                // Update custom claims
                try {
                    const currentUser = await fbAuth.getUser(doc.id)
                    const currentClaims = currentUser.customClaims || {}
                    await fbAuth.setCustomUserClaims(doc.id, {
                        ...currentClaims,
                        role: updates.role || currentClaims.role || oldRole,
                    })
                } catch (claimErr) {
                    logger.warn(`[MigrateRoles] Failed to update claims for ${doc.id}:`, claimErr)
                }

                results.push({
                    uid: doc.id,
                    name: data.displayName || data.email || doc.id,
                    oldRole,
                    newRole: (updates.role as string) || oldRole,
                    soundEngineer: updates.soundEngineer ? true : undefined,
                })
            } else {
                unchanged++
            }
        }

        logger.info(`[MigrateRoles] Migrated ${results.length} users, ${unchanged} unchanged`)

        return NextResponse.json({
            success: true,
            migrated: results.length,
            unchanged,
            details: results,
        })
    } catch (err) {
        logger.error("[MigrateRoles] Error:", err)
        return NextResponse.json({ error: "Migration failed" }, { status: 500 })
    }
}
