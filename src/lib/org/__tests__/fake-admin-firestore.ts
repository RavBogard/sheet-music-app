/**
 * A small in-memory stand-in for the Admin SDK Firestore, enough for the
 * multi-tenant phase 1 golden tests of the cron and scheduling reads.
 *
 * Firestore semantics that matter here: filters, then order, then limit,
 * whatever the call order; `orderBy` drops documents missing the field. Every
 * executed query is recorded so a test can tell an indexed tenant query from
 * a legacy whole-collection read.
 */

type Data = Record<string, unknown>
type Filter = { field: string; op: string; value: unknown }

export interface RecordedQuery {
    collection: string
    filters: Filter[]
    orderBy: Array<{ field: string; dir: "asc" | "desc" }>
    limit: number | null
}

function millis(v: unknown): number | string | null {
    if (v == null) return null
    if (v instanceof Date) return v.getTime()
    if (typeof v === "number" || typeof v === "string") return v
    if (typeof v === "object") {
        const o = v as { toMillis?: () => number; seconds?: number }
        if (typeof o.toMillis === "function") return o.toMillis()
        if (typeof o.seconds === "number") return o.seconds * 1000
    }
    return null
}

function matches(data: Data, f: Filter): boolean {
    const v = data[f.field]
    switch (f.op) {
        case "==":
            return v === f.value
        case "in":
            return Array.isArray(f.value) && f.value.includes(v)
        case "array-contains":
            return Array.isArray(v) && v.includes(f.value)
        default:
            throw new Error(`fake firestore: unsupported op ${f.op}`)
    }
}

export class FakeFirestore {
    readonly collections = new Map<string, Map<string, Data>>()
    readonly queries: RecordedQuery[] = []
    readonly updates: Array<{ path: string; data: Data }> = []
    readonly adds: Array<{ path: string; data: Data }> = []
    readonly sets: Array<{ path: string; data: Data }> = []

    async runTransaction<T>(fn: (tx: unknown) => Promise<T>): Promise<T> {
        return fn({
            get: (ref: { get: () => Promise<unknown> }) => ref.get(),
            set: (ref: { set: (d: Data) => Promise<void> }, d: Data) => void ref.set(d),
        })
    }

    seed(collection: string, docs: Record<string, Data>): this {
        const c = this.collections.get(collection) ?? new Map<string, Data>()
        for (const [id, d] of Object.entries(docs)) c.set(id, { ...d })
        this.collections.set(collection, c)
        return this
    }

    collection(name: string) {
        return new FakeQuery(this, name, [], [], null)
    }

    async getAll(...refs: Array<{ _path: string; get: () => Promise<unknown> }>) {
        return Promise.all(refs.map((r) => r.get()))
    }

    docRef(collection: string, id: string) {
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const db = this
        const path = `${collection}/${id}`
        return {
            id,
            _path: path,
            async get() {
                const d = db.collections.get(collection)?.get(id)
                return { id, exists: d !== undefined, data: () => (d ? { ...d } : undefined) }
            },
            async update(data: Data) {
                db.updates.push({ path, data })
            },
            async set(data: Data) {
                db.sets.push({ path, data })
            },
            collection(sub: string) {
                return {
                    async add(data: Data) {
                        db.adds.push({ path: `${path}/${sub}`, data })
                        return { id: `added-${db.adds.length}` }
                    },
                }
            },
        }
    }
}

export class FakeQuery {
    constructor(
        private db: FakeFirestore,
        private name: string,
        private filters: Filter[],
        private orders: Array<{ field: string; dir: "asc" | "desc" }>,
        private lim: number | null,
    ) {}

    where(field: string, op: string, value: unknown) {
        return new FakeQuery(this.db, this.name, [...this.filters, { field, op, value }], this.orders, this.lim)
    }
    orderBy(field: string, dir: "asc" | "desc" = "asc") {
        return new FakeQuery(this.db, this.name, this.filters, [...this.orders, { field, dir }], this.lim)
    }
    limit(n: number) {
        return new FakeQuery(this.db, this.name, this.filters, this.orders, n)
    }
    doc(id: string) {
        return this.db.docRef(this.name, id)
    }

    async get() {
        this.db.queries.push({ collection: this.name, filters: this.filters, orderBy: this.orders, limit: this.lim })
        let rows = [...(this.db.collections.get(this.name) ?? new Map()).entries()]
        rows = rows.filter(([, d]) => this.filters.every((f) => matches(d, f)))
        for (const o of [...this.orders].reverse()) {
            rows = rows.filter(([, d]) => d[o.field] !== undefined)
            rows.sort(([, a], [, b]) => {
                const x = millis(a[o.field])!
                const y = millis(b[o.field])!
                const c = x < y ? -1 : x > y ? 1 : 0
                return o.dir === "desc" ? -c : c
            })
        }
        if (this.lim !== null) rows = rows.slice(0, this.lim)
        const docs = rows.map(([id, d]) => ({
            id,
            exists: true,
            data: () => ({ ...d }),
            ref: this.db.docRef(this.name, id),
        }))
        return { docs, empty: docs.length === 0, size: docs.length }
    }
}

/** Indexed tenant queries (orgId equality / orgIds membership) the test saw. */
export function tenantFilters(db: FakeFirestore, collection: string): Filter[] {
    return db.queries
        .filter((q) => q.collection === collection)
        .flatMap((q) => q.filters.filter((f) => f.field === "orgId" || f.field === "orgIds"))
}
