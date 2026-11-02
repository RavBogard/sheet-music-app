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
 * every collection alike. Route auth reads `memberships/{org}__{uid}` only, so
 * wrap the mock once and set the caller's membership next to the mocked
 * token. TEST-MOCK (2026-11-02): memberships are keyed on `org__uid` exactly
 * as in production, so a route that reads the wrong tenant (or the wrong uid)
 * finds no membership and a test catches the mix-up.
 */
const mockMemberships = new Map<string, string>()

/**
 * Give `uid` the role `role` in tenant `org` (default crc). `null` clears every
 * mocked membership (test-setup does this before each test).
 */
export function setMockMembershipRole(role: string | null, uid?: string, org = "crc"): void {
    if (role == null) {
        mockMemberships.clear()
        return
    }
    if (!uid) throw new Error("setMockMembershipRole: pass the uid the mocked token carries")
    mockMemberships.set(`${org}__${uid}`, role)
}

const WRAPPED = Symbol("withMockMemberships")

export function withMockMemberships<T extends { collection: (name: string) => unknown }>(db: T): T {
    if ((db as Record<symbol, unknown>)[WRAPPED]) return db
    ;(db as Record<symbol, unknown>)[WRAPPED] = true
    const original = db.collection
    const wrapped = (name: string) =>
        name === "memberships"
            ? {
                  doc: (id: string) => ({
                      get: async () => {
                          const role = mockMemberships.get(id)
                          return {
                              id,
                              exists: role != null,
                              data: () => (role != null ? { role, soundEngineer: false } : undefined),
                          }
                      },
                  }),
              }
            : original.call(db, name)
    db.collection = wrapped as T["collection"]
    return db
}
