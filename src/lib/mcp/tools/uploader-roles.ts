import {
    forbiddenRoleEnvelope,
    richError,
    type RichErrorEnvelope,
} from "@/lib/mcp/error-envelopes"

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

export async function loadUploader(
    db: FirebaseFirestore.Firestore,
    uid: string,
): Promise<UploaderRoles> {
    const snap = await db.collection("users").doc(uid).get()
    const d = snap.exists ? (snap.data() as Record<string, unknown>) : {}
    return {
        role: typeof d.role === "string" ? d.role : undefined,
        canUpload: d.canUpload === true,
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
