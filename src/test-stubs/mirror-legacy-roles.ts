/**
 * Emulator-test fixture helper (SEC-02). MCP role gates (assertEditor and the
 * admin-only gates) read ONLY `memberships/{org}__{uid}` now; the legacy
 * tenant-blind `users/{uid}.role` no longer authorises anything. Fixtures that
 * seed their gated callers as `users/{uid}.role` call this after seeding: every
 * seeded admin or band_leader gets a membership with that role in each tenant
 * (default crc and brotherslazaroff), which is what those fixtures modelled
 * when the gate was tenant-blind.
 *
 * Other roles are left alone unless `allRoles` is set: they never pass an
 * editor gate, and roster reads (listTenantMembers) keep their own legacy rules
 * for them, which the roster fixtures test. `uids` limits the mirror to those
 * people. Memberships this helper wrote earlier are replaced on every call,
 * so a fixture that clears `users` between tests never keeps a stale one.
 */
type DB = FirebaseFirestore.Firestore

const LEADER_ROLES = new Set(["admin", "band_leader"])
const MARK = "mirror-legacy-roles"

export async function mirrorLegacyRoles(
    db: DB,
    opts: { orgs?: string[]; uids?: string[]; allRoles?: boolean; keepExisting?: boolean } = {},
): Promise<void> {
    const orgs = opts.orgs ?? ["crc", "brotherslazaroff"]
    if (!opts.keepExisting) {
        const old = await db.collection("memberships").where("addedBy", "==", MARK).get()
        await Promise.all(old.docs.map((d) => d.ref.delete()))
    }
    const users = await db.collection("users").get()
    const batch = db.batch()
    let n = 0
    for (const d of users.docs) {
        if (opts.uids && !opts.uids.includes(d.id)) continue
        const u = d.data() ?? {}
        if (typeof u.role !== "string") continue
        if (!opts.allRoles && !LEADER_ROLES.has(u.role)) continue
        for (const org of orgs) {
            batch.set(db.collection("memberships").doc(`${org}__${d.id}`), {
                uid: d.id,
                tenantId: org,
                role: u.role,
                soundEngineer: u.soundEngineer === true,
                addedBy: MARK,
            })
            n++
        }
    }
    if (n > 0) await batch.commit()
}
