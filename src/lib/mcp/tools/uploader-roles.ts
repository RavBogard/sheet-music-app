import {
    forbiddenRoleEnvelope,
    richError,
    type RichErrorEnvelope,
} from "@/lib/mcp/error-envelopes"
import type { LibraryCollection } from "@/lib/library-upload"
import { getTenantAccess } from "@/lib/org/access"
import type { OrgId } from "@/lib/org/types"

/**
 * Shared uploader role-gate helpers for the MCP chart/curation surface.
 *
 * Extracted from `library-upload.ts` so `song-metadata.ts` (update_song) can
 * reuse the EXACT same gate (`isUploadAllowed` = admin / band_leader /
 * musician / canUpload) without importing `library-upload` — which would
 * create a cycle once `library-upload` imports `applySongMetadata` back from
 * `song-metadata` for the save_scraped_chart parity path.
 */

export interface UploaderRoles {
    role: string | undefined
    canUpload: boolean
    email: string | undefined
}

/**
 * Multi-tenant P2: the caller's role IN THE TOKEN TENANT (`org` =
 * orgFrom(extra)). `canUpload` stays a global users-doc flag in P2; `email`
 * is the profile email. Platform owner reads as admin (effectiveRole).
 */
export async function loadUploader(
    db: FirebaseFirestore.Firestore,
    uid: string,
    org: OrgId,
): Promise<UploaderRoles> {
    const [access, snap] = await Promise.all([
        getTenantAccess(uid, org, { db }),
        db.collection("users").doc(uid).get(),
    ])
    const d = snap.exists ? (snap.data() as Record<string, unknown>) : {}
    return {
        role: access.effectiveRole ?? undefined,
        canUpload: access.canUpload === true,
        email: typeof d.email === "string" ? d.email : undefined,
    }
}

export function isUploadAllowed(roles: UploaderRoles): boolean {
    // Mirror the HTTP route's gate: admin / band_leader / musician roles all
    // get upload by default; anyone else needs the explicit canUpload flag.
    if (roles.role === "admin") return true
    if (roles.role === "band_leader") return true
    if (roles.role === "musician") return true
    return roles.canUpload
}

/** Trusted-leader role — bypasses rate limits AND gates curated-catalog writes. */
export function isTrustedLeader(roles: UploaderRoles): boolean {
    return roles.role === "admin" || roles.role === "band_leader"
}

export function uploadForbidden(roles: UploaderRoles): RichErrorEnvelope {
    return forbiddenRoleEnvelope({
        callerRole: roles.role ?? null,
        requiredRoles: ["admin", "band_leader", "musician"],
        message:
            "Upload permission required. Ask an admin to enable uploads for your account.",
        hint: "Ask an admin to add you as admin / band_leader / musician, or set canUpload on your user doc.",
        context: { canUpload: roles.canUpload },
    })
}

export function rateLimitEnvelope(reason: string): RichErrorEnvelope {
    return richError(
        "rate_limited",
        reason,
        undefined,
        "Retry after the cooldown window, or ask an admin to bypass via trusted-leader role.",
    )
}

/**
 * Curated-catalog write gate. 'core' (the main CRC catalog), 'supplemental'
 * (the Shireinu songbook) and 'nava' (the Nava Tehila corpus) are curated
 * collections: only a trusted leader may file a chart into one. 'uploads' —
 * and an unset collection, which defaults to it — is open to every
 * upload-allowed caller.
 *
 * Returns the refusal envelope, or null when the write is permitted. Kept
 * here beside the other shared gates so the single-upload session tools and
 * batch intake can never drift on which collections are curated.
 */
export function curatedCatalogGate(
    roles: UploaderRoles,
    collection: LibraryCollection | undefined,
): RichErrorEnvelope | null {
    if (
        (collection === "core" ||
            collection === "supplemental" ||
            collection === "nava") &&
        !isTrustedLeader(roles)
    ) {
        return forbiddenRoleEnvelope({
            callerRole: roles.role ?? null,
            requiredRoles: ["admin", "band_leader"],
            message: `Writing to the '${collection}' catalog requires an admin or band leader account.`,
            hint: "Pick collection: 'uploads' (default) or ask an admin/band leader to add this to the curated catalog.",
            context: { collection },
        })
    }
    return null
}
