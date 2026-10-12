/**
 * Multi-tenant phase 4: the before/after difference every platform write
 * returns, and the deep merge `update_tenant` applies. Pure.
 *
 * Paths are dotted ("branding.shortName"). Arrays are compared and replaced
 * whole: a list of collections or service types is one value to the person
 * reading the diff, not N index paths.
 */

export interface DiffEntry {
    path: string
    before: unknown
    after: unknown
}

export function isPlainObject(v: unknown): v is Record<string, unknown> {
    if (v === null || typeof v !== "object" || Array.isArray(v)) return false
    const proto = Object.getPrototypeOf(v)
    return proto === Object.prototype || proto === null
}

/** Stable JSON for equality (sorted keys). */
export function canonical(v: unknown): string {
    const walk = (x: unknown): unknown => {
        if (Array.isArray(x)) return x.map(walk)
        if (isPlainObject(x)) return Object.fromEntries(Object.keys(x).sort().map((k) => [k, walk(x[k])]))
        if (x instanceof Date) return x.toISOString()
        return x
    }
    return JSON.stringify(walk(v)) ?? "undefined"
}

export const sameValue = (a: unknown, b: unknown) => canonical(a) === canonical(b)

/** Leaf-level differences between two values. */
export function diffValues(before: unknown, after: unknown, prefix = ""): DiffEntry[] {
    if (isPlainObject(before) && isPlainObject(after)) {
        const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort()
        return keys.flatMap((k) => diffValues(before[k], after[k], prefix ? `${prefix}.${k}` : k))
    }
    if (sameValue(before, after)) return []
    return [{ path: prefix || "(value)", before: before ?? null, after: after ?? null }]
}

/**
 * Deep merge for patches: plain objects merge key by key; arrays, primitives
 * and null replace; `undefined` in the patch leaves the base value alone.
 */
export function deepMerge<T>(base: T, patch: unknown): T {
    if (patch === undefined) return base
    if (!isPlainObject(base) || !isPlainObject(patch)) return structuredClone(patch) as T
    const out: Record<string, unknown> = { ...base }
    for (const [k, v] of Object.entries(patch)) {
        if (v === undefined) continue
        out[k] = deepMerge(base[k], v)
    }
    return out as T
}

/** Top-level keys whose values differ (what a whole-field write must touch). */
export function changedTopKeys(before: Record<string, unknown>, after: Record<string, unknown>): string[] {
    const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    return keys.filter((k) => !sameValue(before[k], after[k])).sort()
}

export function pick(o: Record<string, unknown>, keys: string[]): Record<string, unknown> {
    return Object.fromEntries(keys.filter((k) => k in o).map((k) => [k, o[k]]))
}
