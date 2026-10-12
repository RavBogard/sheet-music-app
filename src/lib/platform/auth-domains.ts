import "server-only"
import { getApp } from "firebase-admin/app"
import type { Firestore } from "firebase-admin/firestore"
import { randomUUID } from "node:crypto"
import { initAdmin, getFirestore } from "@/lib/firebase-admin"

/**
 * Multi-tenant phase 3 — add or remove hosts in Firebase Auth's authorized
 * domains (without them Google sign-in on a tenant's address does nothing).
 *
 * Identity Toolkit admin API, same call as scripts/add-auth-domains.mjs:
 *   GET   https://identitytoolkit.googleapis.com/admin/v2/projects/{project}/config
 *   PATCH .../config?updateMask=authorizedDomains   {authorizedDomains: [...]}
 * PATCH REPLACES the whole list, so every change is read → modify → PATCH →
 * read back, one at a time, under a lock held on ONE Firestore document
 * (`platform/authDomainsLock`, {owner, expiresAt, op}). The lock expires after
 * 30 s so a crashed holder cannot wedge it; a waiter retries with backoff for
 * up to 20 s, then gives up with `lock_timeout`.
 *
 * Safety: only the hosts asked for are added or removed; a read that fails or
 * returns an empty list refuses the PATCH (an empty list would wipe sign-in for
 * every tenant); the read-back must show the change AND every host that was
 * there before (minus the removed ones), or the call fails `readback_mismatch`.
 */

export const LOCK_DOC = { collection: "platform", id: "authDomainsLock" } as const
export const LOCK_TTL_MS = 30_000
export const LOCK_WAIT_MS = 20_000

export type AuthDomainsErrorKind = "lock_timeout" | "read_failed" | "empty_read" | "patch_failed" | "readback_mismatch"

export class AuthDomainsError extends Error {
    readonly kind: AuthDomainsErrorKind
    constructor(kind: AuthDomainsErrorKind, message: string) {
        super(message)
        this.name = "AuthDomainsError"
        this.kind = kind
    }
}

export interface AuthDomainsDeps {
    db?: Firestore
    fetch?: typeof fetch
    /** OAuth access token with cloud-platform scope. Default: the Admin SDK app credential. */
    getAccessToken?: () => Promise<string>
    projectId?: string
    now?: () => number
    sleep?: (ms: number) => Promise<void>
    /** Lock owner id; default a fresh uuid per call. */
    owner?: string
    lockTtlMs?: number
    lockWaitMs?: number
}

export interface AuthDomainsResult {
    /** The list as read back after the change. */
    domains: string[]
    size: number
    added: string[]
    removed: string[]
    /** false when nothing needed changing (no PATCH sent). */
    changed: boolean
}

export function normaliseHost(h: string): string {
    return h.trim().toLowerCase().replace(/\.$/, "")
}

async function defaultAccessToken(): Promise<string> {
    initAdmin()
    const cred = getApp().options.credential
    if (!cred) throw new AuthDomainsError("read_failed", "Firebase Admin app has no credential for the Identity Toolkit call")
    return (await cred.getAccessToken()).access_token
}

function defaultProjectId(): string {
    initAdmin()
    let fromApp: string | undefined
    try {
        fromApp = getApp().options.projectId
    } catch {
        fromApp = undefined
    }
    return fromApp || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "crcmusiccharts"
}

function defaultDb(): Firestore {
    initAdmin()
    return getFirestore()
}

/** Take the lock or return false (one transaction). */
async function tryAcquire(db: Firestore, owner: string, now: number, ttl: number, op: string): Promise<boolean> {
    const ref = db.collection(LOCK_DOC.collection).doc(LOCK_DOC.id)
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref)
        const cur = snap.exists ? (snap.data() as { owner?: unknown; expiresAt?: unknown }) : null
        const held = cur && typeof cur.expiresAt === "number" && cur.expiresAt > now && cur.owner !== owner
        if (held) return false
        tx.set(ref, { owner, expiresAt: now + ttl, op, takenAt: now })
        return true
    })
}

async function release(db: Firestore, owner: string): Promise<void> {
    const ref = db.collection(LOCK_DOC.collection).doc(LOCK_DOC.id)
    await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref)
        if (snap.exists && (snap.data() as { owner?: unknown }).owner === owner) tx.delete(ref)
    })
}

/** Run `fn` while holding the authorized-domains lock. Exported for tests. */
export async function withAuthDomainsLock<T>(op: string, fn: () => Promise<T>, deps: AuthDomainsDeps = {}): Promise<T> {
    const db = deps.db ?? defaultDb()
    const now = deps.now ?? Date.now
    const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
    const owner = deps.owner ?? randomUUID()
    const ttl = deps.lockTtlMs ?? LOCK_TTL_MS
    const wait = deps.lockWaitMs ?? LOCK_WAIT_MS
    const start = now()
    let delay = 100
    for (;;) {
        if (await tryAcquire(db, owner, now(), ttl, op)) break
        if (now() - start >= wait)
            throw new AuthDomainsError("lock_timeout", `Another authorized-domains change held the lock for over ${Math.round(wait / 1000)} s`)
        await sleep(delay + Math.floor(Math.random() * 50))
        delay = Math.min(delay * 2, 2_000)
    }
    try {
        return await fn()
    } finally {
        await release(db, owner).catch(() => {})
    }
}

/** Read → modify → PATCH → read back, under the lock. */
export async function changeAuthorizedDomains(
    change: { add?: string[]; remove?: string[] },
    deps: AuthDomainsDeps = {},
): Promise<AuthDomainsResult> {
    const add = [...new Set((change.add ?? []).map(normaliseHost).filter(Boolean))]
    const remove = [...new Set((change.remove ?? []).map(normaliseHost).filter(Boolean))].filter((h) => !add.includes(h))
    const doFetch = deps.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
    const getToken = deps.getAccessToken ?? defaultAccessToken
    const project = deps.projectId ?? defaultProjectId()
    const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${encodeURIComponent(project)}/config`

    return withAuthDomainsLock(
        `${add.length ? `add ${add.join(",")}` : ""}${remove.length ? ` remove ${remove.join(",")}` : ""}`.trim(),
        async () => {
            const token = await getToken()
            const auth = { Authorization: `Bearer ${token}` }

            const read = async (): Promise<string[]> => {
                let res: Response
                try {
                    res = await doFetch(url, { headers: auth })
                } catch (e) {
                    throw new AuthDomainsError("read_failed", `Reading authorized domains failed: ${(e as Error)?.message ?? e}`)
                }
                if (!res.ok) throw new AuthDomainsError("read_failed", `Reading authorized domains failed: HTTP ${res.status}`)
                const cfg = (await res.json().catch(() => null)) as { authorizedDomains?: unknown } | null
                const list = cfg?.authorizedDomains
                if (!Array.isArray(list) || list.length === 0)
                    throw new AuthDomainsError("empty_read", "Authorized domains read back empty; refusing to write a list that would replace it")
                return list.filter((x): x is string => typeof x === "string")
            }

            const before = await read()
            const toAdd = add.filter((h) => !before.includes(h))
            const toRemove = remove.filter((h) => before.includes(h))
            if (toAdd.length === 0 && toRemove.length === 0)
                return { domains: before, size: before.length, added: [], removed: [], changed: false }

            const next = [...before.filter((h) => !toRemove.includes(h)), ...toAdd]
            let patch: Response
            try {
                patch = await doFetch(`${url}?updateMask=authorizedDomains`, {
                    method: "PATCH",
                    headers: { ...auth, "Content-Type": "application/json" },
                    body: JSON.stringify({ authorizedDomains: next }),
                })
            } catch (e) {
                throw new AuthDomainsError("patch_failed", `Writing authorized domains failed: ${(e as Error)?.message ?? e}`)
            }
            if (!patch.ok) throw new AuthDomainsError("patch_failed", `Writing authorized domains failed: HTTP ${patch.status}`)

            const after = await read()
            const missing = next.filter((h) => !after.includes(h))
            const lingering = toRemove.filter((h) => after.includes(h))
            if (missing.length || lingering.length)
                throw new AuthDomainsError(
                    "readback_mismatch",
                    `Authorized domains read-back does not match: missing [${missing.join(", ")}], still present [${lingering.join(", ")}]`,
                )
            return { domains: after, size: after.length, added: toAdd, removed: toRemove, changed: true }
        },
        deps,
    )
}

export function addAuthorizedDomains(hosts: string[], deps?: AuthDomainsDeps): Promise<AuthDomainsResult> {
    return changeAuthorizedDomains({ add: hosts }, deps)
}

export function removeAuthorizedDomains(hosts: string[], deps?: AuthDomainsDeps): Promise<AuthDomainsResult> {
    return changeAuthorizedDomains({ remove: hosts }, deps)
}

/** Read only (no lock): the current list, for dry runs. */
export async function readAuthorizedDomains(deps: AuthDomainsDeps = {}): Promise<string[]> {
    const doFetch = deps.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a))
    const token = await (deps.getAccessToken ?? defaultAccessToken)()
    const project = deps.projectId ?? defaultProjectId()
    const res = await doFetch(`https://identitytoolkit.googleapis.com/admin/v2/projects/${encodeURIComponent(project)}/config`, {
        headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new AuthDomainsError("read_failed", `Reading authorized domains failed: HTTP ${res.status}`)
    const cfg = (await res.json()) as { authorizedDomains?: unknown }
    return Array.isArray(cfg.authorizedDomains) ? (cfg.authorizedDomains as string[]) : []
}
