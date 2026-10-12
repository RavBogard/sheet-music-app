import type { z } from "zod"
import { OrgConfigSchema, type OrgConfig, type OrgConfigInput } from "@/lib/org/config-schema"

/**
 * The Identity form is GENERATED from OrgConfigSchema: the list below names
 * which fields appear and their words; the input kind and the choices come from
 * walking the zod shape, and validation is the schema itself. So the console,
 * the seed script and the platform MCP tools cannot disagree.
 */

export type FieldKind =
    | { kind: "text" }
    | { kind: "number" }
    | { kind: "boolean" }
    | { kind: "enum"; options: string[] }
    | { kind: "record" }

export interface IdentityField {
    path: string
    label: string
    hint?: string
    optionLabels?: Record<string, string>
}

export const IDENTITY_FIELDS: IdentityField[] = [
    { path: "name", label: "Name" },
    { path: "branding.shortName", label: "Short name", hint: "Shown in the nav and on phones' home screens" },
    { path: "branding.abbreviation", label: "Initials", hint: "Used in texts and badges" },
    { path: "branding.appName", label: "App name" },
    { path: "branding.tagline", label: "Tagline" },
    { path: "branding.location", label: "Location" },
    { path: "branding.logoUrl", label: "Logo address", hint: "Leave empty to show the initials" },
    { path: "vocabulary.mode", label: "Kind", optionLabels: { shul: "Synagogue", band: "Band" } },
    { path: "locale.language", label: "Language", optionLabels: { en: "English", he: "Hebrew" } },
    { path: "locale.direction", label: "Text direction", optionLabels: { ltr: "Left to right", rtl: "Right to left" } },
    { path: "locale.timeZone", label: "Time zone", hint: "For example America/Chicago or Asia/Jerusalem" },
    { path: "locale.calendar", label: "Torah reading calendar", optionLabels: { diaspora: "Diaspora", israel: "Israel" } },
    { path: "email.fromName", label: "Email sender name" },
    { path: "legal.operatorName", label: "Operator on legal pages" },
    { path: "legal.contactEmail", label: "Contact email" },
    { path: "branding.colors.light", label: "Colours, light theme", hint: "One per line: name: value. Empty keeps the app's colours." },
    { path: "branding.colors.dark", label: "Colours, dark theme", hint: "One per line: name: value" },
]

type Def = { type: string; innerType?: z.ZodType; shape?: Record<string, z.ZodType>; entries?: Record<string, string> }
const defOf = (s: z.ZodType): Def => (s as unknown as { _zod: { def: Def } })._zod.def

const WRAPPERS = new Set(["default", "optional", "nullable", "prefault", "readonly", "catch", "nonoptional"])

function unwrap(s: z.ZodType): z.ZodType {
    let cur = s
    for (let i = 0; i < 10; i++) {
        const d = defOf(cur)
        if (!WRAPPERS.has(d.type) || !d.innerType) break
        cur = d.innerType
    }
    return cur
}

export function schemaAt(path: string, root: z.ZodType = OrgConfigSchema): z.ZodType | null {
    let cur: z.ZodType = root
    for (const seg of path.split(".")) {
        const d = defOf(unwrap(cur))
        const shape = d.shape
        if (d.type !== "object" || !shape || !(seg in shape)) return null
        cur = shape[seg]
    }
    return unwrap(cur)
}

export function kindAt(path: string, root?: z.ZodType): FieldKind | null {
    const s = schemaAt(path, root)
    if (!s) return null
    const d = defOf(s)
    switch (d.type) {
        case "string":
            return { kind: "text" }
        case "number":
            return { kind: "number" }
        case "boolean":
            return { kind: "boolean" }
        case "enum":
            return { kind: "enum", options: Object.values(d.entries ?? {}) }
        case "record":
            return { kind: "record" }
        default:
            return null
    }
}

export function getPath(obj: unknown, path: string): unknown {
    let cur = obj as Record<string, unknown> | undefined
    for (const seg of path.split(".")) {
        if (cur == null || typeof cur !== "object") return undefined
        cur = cur[seg] as Record<string, unknown> | undefined
    }
    return cur
}

export function setPath<T>(obj: T, path: string, value: unknown): T {
    const segs = path.split(".")
    const out = structuredClone(obj) as Record<string, unknown>
    let cur = out
    segs.slice(0, -1).forEach((seg) => {
        const next = cur[seg]
        cur[seg] = next && typeof next === "object" ? { ...(next as object) } : {}
        cur = cur[seg] as Record<string, unknown>
    })
    cur[segs[segs.length - 1]] = value
    return out as T
}

export const recordToText = (r: unknown): string =>
    r && typeof r === "object" ? Object.entries(r as Record<string, unknown>).map(([k, v]) => `${k}: ${String(v)}`).join("\n") : ""

export function textToRecord(text: string): Record<string, string> {
    const out: Record<string, string> = {}
    for (const line of text.split("\n")) {
        const i = line.indexOf(":")
        if (i <= 0) continue
        const k = line.slice(0, i).trim()
        const v = line.slice(i + 1).trim()
        if (k) out[k] = v
    }
    return out
}

/** Form values (all strings) from a config. */
export function formValues(config: OrgConfig, fields = IDENTITY_FIELDS): Record<string, string> {
    const out: Record<string, string> = {}
    for (const f of fields) {
        const k = kindAt(f.path)
        const v = getPath(config, f.path)
        out[f.path] = k?.kind === "record" ? recordToText(v) : v == null ? "" : String(v)
    }
    return out
}

function coerce(path: string, raw: string): unknown {
    const k = kindAt(path)
    if (k?.kind === "record") return textToRecord(raw)
    if (k?.kind === "number") return raw === "" ? undefined : Number(raw)
    if (k?.kind === "boolean") return raw === "true"
    return raw
}

export interface IdentityCheck {
    /** Field path → the schema's message. */
    errors: Record<string, string>
    /** Top-level sections that changed, each whole (so a shallow merge loses nothing). */
    patch: Partial<OrgConfigInput>
    changed: string[]
}

/** Apply the form to the config, validate the whole document with the schema, and build the patch. */
export function checkIdentity(config: OrgConfig, values: Record<string, string>, fields = IDENTITY_FIELDS): IdentityCheck {
    const original = formValues(config, fields)
    let candidate: OrgConfig = config
    const changed: string[] = []
    for (const f of fields) {
        if ((values[f.path] ?? "") === (original[f.path] ?? "")) continue
        changed.push(f.path)
        candidate = setPath(candidate, f.path, coerce(f.path, values[f.path] ?? ""))
    }
    const errors: Record<string, string> = {}
    const r = OrgConfigSchema.safeParse(candidate)
    if (!r.success) {
        for (const issue of r.error.issues) {
            const p = issue.path.join(".")
            const field = fields.find((f) => p === f.path || p.startsWith(`${f.path}.`))
            const key = field?.path ?? "_form"
            if (!errors[key]) errors[key] = issue.message
        }
    }
    const patch: Record<string, unknown> = {}
    for (const p of changed) {
        const top = p.split(".")[0]
        patch[top] = (candidate as unknown as Record<string, unknown>)[top]
    }
    return { errors, patch: patch as Partial<OrgConfigInput>, changed }
}
