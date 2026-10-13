import { FieldValue, type Firestore } from "firebase-admin/firestore"
import { codeOrgConfig } from "@/lib/org/config-code"
import { MIXER_ORG_ID } from "@/lib/org/features-client"

/**
 * Multi-tenant phase 6 — write each compiled tenant's feature flags (and its
 * Chart Inbox setting) from config-code.ts onto `orgs/{id}`, and stamp the
 * bridge config `config/monitor.orgId = "crc"` (absent already means crc; the
 * stamp makes it explicit). Used by scripts/ops/multitenant/set-tenant-features.ts.
 *
 * A plan records every field's before-value; apply writes the manifest's
 * after-values; undo puts the before-values back (absent fields deleted)
 * only where the document still holds what apply wrote.
 */

export const SET_FEATURES_ORGS = ["crc", "brotherslazaroff"] as const

export interface FieldChange {
    /** Document path, e.g. orgs/crc. */
    doc: string
    /** Top-level field. */
    field: string
    /** undefined = the field was absent. */
    before: unknown
    after: unknown
}

export interface SetFeaturesManifest {
    kind: "set-tenant-features"
    at: string
    projectId: string
    changes: FieldChange[]
}

const ABSENT = { __absent: true } as const
const enc = (v: unknown) => (v === undefined ? ABSENT : v)
const dec = (v: unknown) => (v && typeof v === "object" && (v as { __absent?: boolean }).__absent ? undefined : v)
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

function desired(): Array<{ doc: string; field: string; value: unknown }> {
    const out: Array<{ doc: string; field: string; value: unknown }> = []
    for (const id of SET_FEATURES_ORGS) {
        const c = codeOrgConfig(id)
        if (!c) throw new Error(`no compiled config for ${id}`)
        out.push({ doc: `orgs/${id}`, field: "features", value: { ...c.features } })
        out.push({ doc: `orgs/${id}`, field: "driveInbox", value: { ...c.driveInbox } })
    }
    out.push({ doc: "config/monitor", field: "orgId", value: MIXER_ORG_ID })
    return out
}

export async function planSetFeatures(db: Firestore, projectId: string): Promise<SetFeaturesManifest> {
    const changes: FieldChange[] = []
    for (const d of desired()) {
        const snap = await db.doc(d.doc).get()
        if (!snap.exists) {
            // Never create a tenant or the bridge config from here.
            throw new Error(`${d.doc} does not exist; run the phase 1 seed first (nothing written)`)
        }
        const before = (snap.data() as Record<string, unknown>)[d.field]
        if (same(before, d.value)) continue
        changes.push({ doc: d.doc, field: d.field, before: enc(before), after: d.value })
    }
    return { kind: "set-tenant-features", at: new Date().toISOString(), projectId, changes }
}

export async function applySetFeatures(db: Firestore, m: SetFeaturesManifest): Promise<number> {
    for (const c of m.changes) await db.doc(c.doc).update({ [c.field]: c.after })
    return m.changes.length
}

export async function undoSetFeatures(
    db: Firestore,
    m: SetFeaturesManifest,
    apply: boolean,
): Promise<{ restored: number; skipped: string[] }> {
    const skipped: string[] = []
    let restored = 0
    for (const c of m.changes) {
        const snap = await db.doc(c.doc).get()
        const now = snap.exists ? (snap.data() as Record<string, unknown>)[c.field] : undefined
        if (!same(now, c.after)) {
            skipped.push(`${c.doc}.${c.field} (changed since)`)
            continue
        }
        const before = dec(c.before)
        if (apply) await db.doc(c.doc).update({ [c.field]: before === undefined ? FieldValue.delete() : before })
        restored++
    }
    return { restored, skipped }
}
