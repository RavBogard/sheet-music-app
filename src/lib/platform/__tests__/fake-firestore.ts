import type { Firestore } from "firebase-admin/firestore"

/**
 * Minimal in-memory Firestore for the platform tests: doc get/set/update/delete,
 * collection get, and runTransaction serialised through one queue (so a
 * transaction is atomic against other transactions, as in Firestore).
 */
export function fakeFirestore(initial: Record<string, Record<string, unknown>> = {}) {
    const store = new Map<string, Record<string, unknown>>()
    for (const [path, data] of Object.entries(initial)) store.set(path, structuredClone(data))
    let queue: Promise<unknown> = Promise.resolve()
    const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v))

    const snap = (path: string) => {
        const data = store.get(path)
        return { id: path.split("/").pop()!, exists: data !== undefined, data: () => clone(data) }
    }
    const docRef = (col: string, id: string) => {
        const path = `${col}/${id}`
        return {
            path,
            id,
            get: async () => snap(path),
            set: async (d: Record<string, unknown>) => void store.set(path, clone(d)),
            update: async (d: Record<string, unknown>) => {
                if (!store.has(path)) throw new Error(`NOT_FOUND ${path}`)
                store.set(path, { ...store.get(path)!, ...clone(d) })
            },
            delete: async () => void store.delete(path),
        }
    }
    const db = {
        collection: (col: string) => ({
            doc: (id: string) => docRef(col, id),
            get: async () => ({
                docs: [...store.keys()].filter((p) => p.startsWith(`${col}/`) && p.split("/").length === 2).map(snap),
            }),
        }),
        runTransaction: <T>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
            const run = queue.then(async () => {
                const writes: Array<() => void> = []
                const tx = {
                    get: async (ref: { path: string }) => snap(ref.path),
                    set: (ref: { path: string }, d: Record<string, unknown>) => void writes.push(() => store.set(ref.path, clone(d))),
                    update: (ref: { path: string }, d: Record<string, unknown>) =>
                        void writes.push(() => {
                            if (!store.has(ref.path)) throw new Error(`NOT_FOUND ${ref.path}`)
                            store.set(ref.path, { ...store.get(ref.path)!, ...clone(d) })
                        }),
                    delete: (ref: { path: string }) => void writes.push(() => store.delete(ref.path)),
                }
                const out = await fn(tx)
                for (const w of writes) w()
                return out
            })
            queue = run.catch(() => {})
            return run
        },
    }
    return { db: db as unknown as Firestore, store }
}
