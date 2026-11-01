import { ROLE_CODE } from "@/lib/org/membership-types"

/**
 * SEC-02 test helper: the per-tenant membership claim map (`m`) a migrated
 * account's ID token carries. Route auth falls back to the token only through
 * this map now; a bare legacy `role` claim grants nothing in any tenant.
 */
export function mClaim(role: string, org = "crc"): { m: Record<string, string> } {
    const code = (ROLE_CODE as Record<string, string>)[role]
    return { m: code ? { [org]: code } : {} }
}

/**
 * SEC-02 test helper for route tests whose hand-rolled Firestore mock answers
 * every collection alike. Route auth now reads `memberships/{org}__{uid}`
 * only, so wrap the mock once and set the caller's role next to the mocked
 * token: the memberships collection then answers with that role (or absent).
 */
let mockMembershipRole: string | null = null

export function setMockMembershipRole(role: string | null): void {
    mockMembershipRole = role
}

const WRAPPED = Symbol("withMockMemberships")

export function withMockMemberships<T extends { collection: (name: string) => unknown }>(db: T): T {
    if ((db as Record<symbol, unknown>)[WRAPPED]) return db
    ;(db as Record<symbol, unknown>)[WRAPPED] = true
    const original = db.collection
    const wrapped = (name: string) =>
        name === "memberships"
            ? {
                  doc: () => ({
                      get: async () => ({
                          exists: mockMembershipRole != null,
                          data: () =>
                              mockMembershipRole != null ? { role: mockMembershipRole, soundEngineer: false } : undefined,
                      }),
                  }),
              }
            : original.call(db, name)
    db.collection = wrapped as T["collection"]
    return db
}
