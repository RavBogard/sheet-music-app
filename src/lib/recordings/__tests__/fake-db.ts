/**
 * A small in-memory Firestore stand-in for the recordings tests: doc get /
 * set / update, `where` (==, in), `limit`, batches and transactions whose
 * tx.get takes a doc ref or a query. Not a test file itself.
 */
type Data = Record<string, unknown>
type Store = Record<string, Record<string, Data>>

export function fakeDb(seed: Store = {}) {
    const store: Store = JSON.parse(JSON.stringify(seed))
    const coll = (name: string) => (store[name] ??= {})

    function docRef(name: string, id: string) {
        return {
            id,
            path: `${name}/${id}`,
            async get() {
                const d = coll(name)[id]
                return { id, exists: !!d, data: () => (d ? { ...d } : undefined), get: (f: string) => d?.[f], ref: docRef(name, id) }
            },
            async set(data: Data) {
                coll(name)[id] = { ...data }
            },
            async update(data: Data) {
                if (!coll(name)[id]) throw new Error(`no doc ${name}/${id}`)
                coll(name)[id] = { ...coll(name)[id], ...data }
            },
        }
    }

    function query(name: string, filters: Array<[string, string, unknown]> = [], lim?: number) {
        return {
            where(f: string, op: string, v: unknown) {
                return query(name, [...filters, [f, op, v]], lim)
            },
            limit(n: number) {
                return query(name, filters, n)
            },
            async get() {
                let hits = Object.entries(coll(name)).filter(([, d]) =>
                    filters.every(([f, op, v]) =>
                        op === "==" ? d[f] === v : op === "in" ? (v as unknown[]).includes(d[f]) : false,
                    ),
                )
                if (lim !== undefined) hits = hits.slice(0, lim)
                const docs = hits.map(([id, d]) => ({ id, exists: true, data: () => ({ ...d }), get: (f: string) => d[f], ref: docRef(name, id) }))
                return { docs, size: docs.length, empty: docs.length === 0, forEach: (fn: (d: unknown) => void) => docs.forEach(fn) }
            },
        }
    }

    const db = {
        store,
        collection(name: string) {
            return { doc: (id: string) => docRef(name, id), ...query(name) }
        },
        batch() {
            const ops: Array<() => Promise<void>> = []
            return {
                update(ref: ReturnType<typeof docRef>, data: Data) {
                    ops.push(() => ref.update(data))
                },
                async commit() {
                    for (const op of ops) await op()
                },
            }
        },
        async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
            const writes: Array<() => Promise<void>> = []
            const tx = {
                get: (target: { get: () => Promise<unknown> }) => target.get(),
                update(ref: ReturnType<typeof docRef>, data: Data) {
                    writes.push(() => ref.update(data))
                },
            }
            const out = await fn(tx)
            for (const w of writes) await w()
            return out
        },
    }
    return db
}
