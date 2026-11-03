import { z } from "zod"
import { sanitizeFreeformString } from "@/lib/sanitize-freeform"
import { liturgyRefGuard } from "@/lib/mcp/liturgy-ref-guard"
import { DurationSecSchema, GigPatchSchema, SingerKeysSchema } from "@/lib/gig/model"
import type { LiturgyRef } from "@/lib/books/types"
import { CLIENT_REFUSED_ROW_FIELDS, RESERVED_SETLIST_FIELDS } from "./types"

/**
 * Per-field validation for op payloads. The types and limits are the MCP
 * track and setlist tools' (src/lib/mcp/tools/index.ts trackRowFields,
 * trackPatchFields, outlineFields; update_setlist), so a row written through
 * /ops is indistinguishable from one written over MCP. Fields Overlays reads
 * (`type`, `liturgyRef`, `momentId`, `eventDate`) keep their stored types.
 *
 * Unknown fields are refused, not dropped: a client that sends a field the
 * server does not know about learns so at once.
 */

/** A Firestore top-level field name the engine will accept. No dots, no `__`. */
export const FIELD_KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/
export const isSafeKey = (k: string) => FIELD_KEY_RE.test(k) && !k.startsWith("__")

/** Free text. Capped so one field can't approach Firestore's 1 MiB doc limit. */
const freeform = z.string().max(5000).transform(sanitizeFreeformString)

const liturgyRefSchema = z
    .object({
        book: z.string().min(1),
        unitId: z.string().min(1).optional(),
        folio: z.number().int().min(1),
        stale: z.boolean().optional(),
    })
    .strict()
    .superRefine((ref, ctx) => {
        const { stale: _stale, ...core } = ref
        const bad = liturgyRefGuard(core as LiturgyRef)
        if (bad) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "liturgyRef is not a valid page in a known book" })
    })

const honorsSchema = z
    .array(
        z
            .object({
                name: z.string().min(1).max(120).transform(sanitizeFreeformString),
                note: z.string().max(200).transform(sanitizeFreeformString).optional(),
            })
            .strict(),
    )
    .max(12)

const singerKeysSchema = SingerKeysSchema.transform((list) =>
    list.map((e) => ({ musician: sanitizeFreeformString(e.musician), key: sanitizeFreeformString(e.key) })),
)

const TRACK_TYPES = ["song", "header", "reading", "prayer", "transition", "note"] as const

/** Row fields a client may write. `nullable` = may be cleared with `null`. */
const ROW_FIELDS: Record<string, { schema: z.ZodTypeAny; nullable: boolean }> = {
    title: { schema: freeform, nullable: false },
    type: { schema: z.enum(TRACK_TYPES), nullable: false },
    key: { schema: freeform, nullable: true },
    bpm: { schema: z.number().positive().max(400), nullable: true },
    leadMusician: { schema: freeform, nullable: true },
    referenceLink: { schema: freeform, nullable: true },
    notes: { schema: freeform, nullable: true },
    songId: { schema: z.string().min(1).max(300), nullable: true },
    fileId: { schema: z.string().min(1).max(300), nullable: true },
    fileName: { schema: z.string().max(500), nullable: true },
    mimeType: { schema: z.string().max(200), nullable: true },
    performer: { schema: freeform, nullable: true },
    description: { schema: freeform, nullable: true },
    estimatedMinutes: { schema: z.number().int().min(0).max(600), nullable: true },
    liturgyRef: { schema: liturgyRefSchema, nullable: true },
    momentId: { schema: z.string().min(1).max(200), nullable: true },
    fixed: { schema: z.boolean(), nullable: true },
    honors: { schema: honorsSchema, nullable: true },
    durationSec: { schema: DurationSecSchema, nullable: true },
    segue: { schema: z.boolean(), nullable: true },
    singerKeys: { schema: singerKeysSchema, nullable: true },
    // Carried by clone / duplicate / undo (PR 3 fix round): the rest of a
    // stored row an author can have set.
    pageNumber: { schema: z.number().int().min(1).max(5000), nullable: true },
    audioFileId: { schema: z.string().min(1).max(300), nullable: true },
    audioFileName: { schema: z.string().max(500), nullable: true },
    transposition: { schema: z.number().min(-24).max(24), nullable: true },
    tune: { schema: freeform, nullable: true },
    duration: { schema: z.string().max(40).transform(sanitizeFreeformString), nullable: true },
    unmatched: { schema: z.boolean(), nullable: true },
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

/**
 * Setlist fields a client may write through `editSetlist`, by their STORED
 * names. `book` is not here: a book change re-pages every row and stays on
 * MCP `update_setlist`. `eventDate` is sent as an ISO string and stored as a
 * Timestamp.
 *
 * `gig` (band tenants) is a PATCH merged per sub-field by the engine: the
 * editor sends the parts it changed (null removes a part) with their base,
 * so a concurrent MCP edit to another part is kept and one to the same part
 * is a conflict on `gig.<part>`. `gig: null` clears the whole gig.
 */
const SETLIST_FIELDS: Record<string, { schema: z.ZodTypeAny; nullable: boolean }> = {
    name: { schema: z.string().min(1).max(200).transform(sanitizeFreeformString), nullable: false },
    eventDate: {
        schema: z.string().max(40).refine((s) => {
            const t = Date.parse(s)
            // A Firestore Timestamp holds years 1..9999; keep to a sane window.
            return !Number.isNaN(t) && t >= Date.UTC(2000, 0, 1) && t < Date.UTC(2200, 0, 1)
        }, "eventDate must be an ISO date string between 2000 and 2199"),
        nullable: false,
    },
    templateType: { schema: z.string().max(100), nullable: true },
    rabbi: { schema: freeform, nullable: true },
    serviceNotes: { schema: freeform, nullable: true },
    startsAtLocal: { schema: z.string().regex(HHMM, "24-hour HH:mm"), nullable: true },
    special: { schema: z.boolean(), nullable: true },
    gig: { schema: GigPatchSchema, nullable: true },
}

/** Row fields a client may write. The browser ops client mirrors this list (a test holds them equal). */
export const ROW_FIELD_NAMES: readonly string[] = Object.keys(ROW_FIELDS)
/** Row fields that may be cleared with `null`. */
export const NULLABLE_ROW_FIELD_NAMES: readonly string[] = Object.keys(ROW_FIELDS).filter((k) => ROW_FIELDS[k].nullable)
/** Setlist fields `editSetlist` accepts. */
export const SETLIST_FIELD_NAMES: readonly string[] = Object.keys(SETLIST_FIELDS)
/** Setlist fields that may be cleared with `null`. */
export const NULLABLE_SETLIST_FIELD_NAMES: readonly string[] = Object.keys(SETLIST_FIELDS).filter((k) => SETLIST_FIELDS[k].nullable)

export type FieldCheck = { ok: true; value: Record<string, unknown> } | { ok: false; message: string }

/**
 * Validate and clean one field map. `undefined` values are dropped (they are
 * not fields). `mode`:
 *  - "row": an insert payload (no nulls are meaningful; they are dropped);
 *  - "set": an edit (null clears where the field allows it);
 *  - "base": what the client last saw (format-checked only, never written).
 */
function checkFields(
    obj: Record<string, unknown>,
    table: Record<string, { schema: z.ZodTypeAny; nullable: boolean }>,
    reserved: ReadonlySet<string>,
    mode: "row" | "set" | "base",
): FieldCheck {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
        if (!isSafeKey(k)) return { ok: false, message: `field '${k}' is not a plain field name` }
        if (v === undefined) continue
        if (mode === "base") {
            out[k] = v
            continue
        }
        if (reserved.has(k)) return { ok: false, message: `field '${k}' is written by the server only` }
        // Own keys only: `constructor`, `toString` etc. must read as unknown.
        const spec = Object.hasOwn(table, k) ? table[k] : undefined
        if (!spec) return { ok: false, message: `unknown field '${k}'` }
        if (v === null) {
            if (mode === "row") continue
            if (!spec.nullable) return { ok: false, message: `field '${k}' cannot be cleared` }
            out[k] = null
            continue
        }
        const r = spec.schema.safeParse(v)
        if (!r.success) return { ok: false, message: `field '${k}': ${r.error.issues[0]?.message ?? "invalid"}` }
        out[k] = r.data
    }
    return { ok: true, value: out }
}

export const checkRowFields = (obj: Record<string, unknown>, mode: "row" | "set" | "base") =>
    checkFields(obj, ROW_FIELDS, CLIENT_REFUSED_ROW_FIELDS, mode)

export const checkSetlistFields = (obj: Record<string, unknown>, mode: "set" | "base") =>
    checkFields(obj, SETLIST_FIELDS, RESERVED_SETLIST_FIELDS, mode)
