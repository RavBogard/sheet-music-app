import "server-only"
import type { Auth, UserRecord } from "firebase-admin/auth"
import type { Firestore } from "firebase-admin/firestore"
import type { Membership } from "@/lib/org/membership-types"
import { buildClaims, canonicalClaims, readOwners } from "@/lib/org/claims"

/**
 * Multi-tenant phase 2 (design §3.4, admin-consistency cron): compare the
 * identity sources of truth with what the tokens carry.
 *   - every platform/owners uid must carry the `po` claim;
 *   - every account's `m` / `se` / `po` claims must equal what its
 *     memberships produce (buildClaims);
 *   - report accounts not migrated yet (no users/{uid}.membershipsMigratedAt)
 *     and accounts whose claims have no `m` (they still read through the
 *     legacy transition rule — step 5 removes it once this list is empty).
 * Read-only.
 */
export interface IdentityConsistency {
    checked: number
    owners: string[]
    drift: Array<{ uid: string; reason: string }>
    unmigrated: string[]
    withoutM: string[]
}

async function listAll(auth: Auth): Promise<UserRecord[]> {
    const out: UserRecord[] = []
    let token: string | undefined
    do {
        const page = await auth.listUsers(1000, token)
        out.push(...page.users)
        token = page.pageToken
    } while (token)
    return out
}

export async function checkIdentityConsistency(db: Firestore, auth: Auth): Promise<IdentityConsistency> {
    const [owners, users, memSnap, docsSnap] = await Promise.all([
        readOwners(db),
        listAll(auth),
        db.collection("memberships").get(),
        db.collection("users").get(),
    ])
    const byUid = new Map<string, Membership[]>()
    for (const d of memSnap.docs) {
        const m = d.data() as Membership
        const list = byUid.get(m.uid) ?? []
        list.push(m)
        byUid.set(m.uid, list)
    }
    const migrated = new Set(docsSnap.docs.filter((d) => !!d.get("membershipsMigratedAt")).map((d) => d.id))
    const authUids = new Set(users.map((u) => u.uid))

    const drift: IdentityConsistency["drift"] = []
    for (const uid of owners) {
        if (!authUids.has(uid)) drift.push({ uid, reason: "platform owner has no Auth account" })
    }
    const unmigrated: string[] = []
    const withoutM: string[] = []
    for (const u of users) {
        const claims = (u.customClaims ?? {}) as Record<string, unknown>
        const isOwner = owners.includes(u.uid)
        if (isOwner && claims.po !== true) drift.push({ uid: u.uid, reason: "po claim missing" })
        if (!isOwner && claims.po === true) drift.push({ uid: u.uid, reason: "po claim without platform/owners entry" })
        if (!migrated.has(u.uid)) unmigrated.push(u.uid)
        const hasM = !!claims.m && typeof claims.m === "object"
        if (!hasM) {
            withoutM.push(u.uid)
            continue
        }
        let expected: Record<string, unknown>
        try {
            expected = buildClaims(claims, byUid.get(u.uid) ?? [], isOwner)
        } catch (e) {
            drift.push({ uid: u.uid, reason: `claims over limit: ${(e as Error).message}` })
            continue
        }
        if (canonicalClaims(expected.m) !== canonicalClaims(claims.m)) {
            drift.push({ uid: u.uid, reason: `m=${JSON.stringify(claims.m)} expected ${JSON.stringify(expected.m)}` })
        }
        if (canonicalClaims(expected.se ?? []) !== canonicalClaims(claims.se ?? [])) {
            drift.push({ uid: u.uid, reason: `se=${JSON.stringify(claims.se ?? [])} expected ${JSON.stringify(expected.se ?? [])}` })
        }
    }
    return { checked: users.length, owners, drift, unmigrated, withoutM }
}
