import { ROLE_CODE, type TenantRole } from "@/lib/org/membership-types"
import type { OrgId } from "@/lib/org/types"

/**
 * Multi-tenant phase 2 — the browser's view of "my role here". Pure and
 * client-safe (no firebase import) so the transition rule is unit-testable.
 *
 * Transition rule (P2 design §3.6):
 *   - `po` claim                 → 'admin' (platform owner)
 *   - token carries an `m` map   → the membership doc's role in this tenant;
 *                                  no membership → null (treated as pending)
 *   - no `m` map (not migrated)  → the legacy profile role, unchanged
 * Sound engineer follows the same split (membership flag vs profile flag).
 */

export interface MembershipView {
    role: TenantRole
    soundEngineer?: boolean
}

export type ClaimsView = Record<string, unknown> | null | undefined

export interface ClientRole {
    /** Role in the host tenant; null = not a member here (treat as pending). */
    role: string | null
    isSoundEngineer: boolean
    isPlatformOwner: boolean
    source: "platform-owner" | "membership" | "legacy"
}

export function claimsHaveM(claims: ClaimsView): boolean {
    const m = claims?.m
    return typeof m === "object" && m !== null && !Array.isArray(m)
}

export function resolveClientRole(input: {
    claims: ClaimsView
    membership: MembershipView | null | undefined
    profileRole: string | null | undefined
    profileSoundEngineer: boolean | null | undefined
}): ClientRole {
    const { claims, membership, profileRole, profileSoundEngineer } = input
    const isPlatformOwner = claims?.po === true
    const hasM = claimsHaveM(claims)
    const isSoundEngineer = hasM ? !!membership?.soundEngineer : !!profileSoundEngineer
    if (isPlatformOwner) {
        return { role: "admin", isSoundEngineer, isPlatformOwner, source: "platform-owner" }
    }
    if (hasM) {
        return { role: membership?.role ?? null, isSoundEngineer, isPlatformOwner, source: "membership" }
    }
    return { role: profileRole ?? null, isSoundEngineer, isPlatformOwner, source: "legacy" }
}

/**
 * Drift between the token's `m[org]` code and the membership doc. A denied or
 * missing membership carries no claim code. Only meaningful when the token has
 * an `m` map (legacy tokens use the old role comparison).
 */
export function membershipClaimDrifted(
    claims: ClaimsView,
    org: OrgId,
    membership: MembershipView | null | undefined,
): boolean {
    if (!claimsHaveM(claims)) return false
    const m = claims!.m as Record<string, unknown>
    const claimCode = typeof m[org] === "string" ? (m[org] as string) : undefined
    const role = membership?.role
    const docCode = role && role !== "denied" ? ROLE_CODE[role] : undefined
    return claimCode !== docCode
}

/** sessionStorage key: one join request per (host tenant, uid) per session. */
export function joinSessionKey(org: OrgId, uid: string): string {
    return `crc_join_done:${org}:${uid}`
}
