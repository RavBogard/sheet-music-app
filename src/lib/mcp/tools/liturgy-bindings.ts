import { initAdmin, getFirestore } from "@/lib/firebase-admin"
import { assertEditor } from "@/lib/mcp/server-tracks-write"
import { richError, type RichErrorEnvelope } from "@/lib/mcp/error-envelopes"
import { rowOrg } from "@/lib/mcp/org-context"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { getTracksForSetlist } from "@/lib/server-tracks"
import { validateLiturgyRef } from "@/lib/books/registry"
import { liturgyLookup } from "@/lib/liturgy/lookup"
import { matchLiturgyTitle, type LiturgyMatch } from "@/lib/liturgy/match"
import { logger } from "@/lib/logger"

/**
 * A-W3' — `propose_liturgy_bindings`.
 *
 * "Bind, don't add" (Daniel, 2026-09-15). Every row he authored gains its
 * liturgical identity — the draft feed's unit id and the legacy booklet's page
 * — by matching what he TYPED against the lookup table. Nothing here creates,
 * removes or reorders a row. The count of rows in and rows out is identical,
 * always.
 *
 * STAGE, CONFIRM, COMMIT. `dryRun` defaults to true and returns the whole
 * proposal without touching anything; that is the F-05 standing rule, and it
 * is also the only sane posture for a tool whose output prints page numbers on
 * a lectern sheet. A real run writes ONLY the `bound` rows plus whatever
 * `plausible` rows the caller passes back in `accept` — Daniel's confirmation,
 * expressed as data.
 *
 * WHAT IS NEVER BOUND. Header rows: a header is a sign over a section, not a
 * moment, and giving it a page would put the wrong number on every screen that
 * shows the section. Rows that already carry a `liturgyRef`: an author-typed
 * page is never overwritten by a guess. And anything the matcher would not
 * bind on its own — see `src/lib/liturgy/match.ts` for the three refusals.
 */

type DB = FirebaseFirestore.Firestore

/** Row types that can name a liturgical moment. Headers and notes cannot. */
const BINDABLE_TYPES = new Set(["song", "prayer", "reading", "transition"])

export interface ProposeLiturgyBindingsArgs {
    setlistId?: string
    templateId?: string
    book: string
    dryRun?: boolean
    /** Plausible rows Daniel confirmed: row id → the unit id (or label) to bind. */
    accept?: Array<{ rowId: string; unitId: string }>
}

export interface ProposedBinding {
    rowId: string
    title: string
    unitId: string | null
    folio: number | null
    label: string
    confidence: number
    /** The spelling in the table that matched. */
    via: string
}

export interface PlausibleBinding extends ProposedBinding {
    alternatives: Array<{ unitId: string | null; label: string; folio: number | null; confidence: number }>
}

export interface UnmatchedRow {
    rowId: string
    title: string
    type: string
}

export interface ProposeLiturgyBindingsResult {
    ok: true
    book: string
    setlistId?: string
    templateId?: string
    dryRun: boolean
    /** Rows the matcher would bind on its own. */
    bound: ProposedBinding[]
    /** Rows that need Daniel: real candidates, none of them safe alone. */
    plausible: PlausibleBinding[]
    unmatched: UnmatchedRow[]
    /** Rows skipped and why — headers, notes, and rows already bound. */
    skipped: Array<{ rowId: string; title: string; reason: string }>
    /** Written only on a real run. */
    written?: number
}

interface Row {
    id: string
    title: string
    type: string
    hasRef: boolean
}

function bindingOf(m: LiturgyMatch, rowId: string, title: string): ProposedBinding {
    return {
        rowId,
        title,
        unitId: m.entry.unitId ?? null,
        folio: m.entry.folio ?? null,
        label: m.entry.label,
        confidence: m.score,
        via: m.via,
    }
}

/**
 * The ref that may actually be written, or null.
 *
 * Two things are being respected here, and they pull against each other.
 *
 * A page is only writable if it has a page in THIS book: `validateLiturgyRef`
 * is the guard that keeps a wrong number off a lectern sheet, and an
 * identity-only match is reported rather than written with a borrowed number.
 *
 * And a unit id belongs to the book that defines it. The legacy booklets are
 * pagemaps with no units at all, so `crc-friday` cannot carry
 * `shma.barchu@shabbat-maariv` however true that identity is — the registry
 * refuses it, correctly. The proposal still REPORTS the unit id, because that
 * is the identity Daniel is confirming and it is what a later book switch
 * re-resolves on; the write just drops it and keeps the page. When the Shirei
 * volume for a service is released and becomes the book, the same match will
 * carry its unit id through unchanged.
 */
function writableRef(
    book: string,
    b: ProposedBinding,
): { book: string; unitId?: string; folio: number } | null {
    if (typeof b.folio !== "number") return null
    if (b.unitId) {
        const withId = { book, unitId: b.unitId, folio: b.folio }
        if (validateLiturgyRef(withId).ok) return withId
    }
    const pageOnly = { book, folio: b.folio }
    return validateLiturgyRef(pageOnly).ok ? pageOnly : null
}

async function rowsForSetlist(db: DB, id: string, org: OrgId): Promise<Row[] | null> {
    const doc = await db.collection("setlists").doc(id).get()
    if (!doc.exists) return null
    const data = doc.data() as Record<string, unknown>
    if (rowOrg(data.orgId) !== org) return null
    const tracks = await getTracksForSetlist(db, id, data)
    return tracks.map((t) => {
        const row = t as Record<string, unknown>
        return {
            id: t.id,
            title: typeof t.title === "string" ? t.title : "",
            type: typeof row.type === "string" ? row.type : "song",
            hasRef: !!row.liturgyRef && typeof row.liturgyRef === "object",
        }
    })
}

async function rowsForTemplate(db: DB, id: string, org: OrgId): Promise<Row[] | null> {
    const doc = await db.collection("setlistTemplates").doc(id).get()
    if (!doc.exists) return null
    const data = doc.data() as Record<string, unknown>
    if (rowOrg(data.orgId) !== org) return null
    const tracks = Array.isArray(data.tracks) ? data.tracks : []
    return tracks.map((t, i) => {
        const row = (t ?? {}) as Record<string, unknown>
        return {
            id: String(i),
            title: typeof row.title === "string" ? row.title : "",
            type: typeof row.type === "string" ? row.type : "song",
            hasRef:
                (!!row.liturgyRef && typeof row.liturgyRef === "object") ||
                (!!row.liturgyRefs && typeof row.liturgyRefs === "object"),
        }
    })
}

export async function proposeLiturgyBindings(
    uid: string,
    args: ProposeLiturgyBindingsArgs,
    org: OrgId = DEFAULT_ORG_ID,
): Promise<ProposeLiturgyBindingsResult | RichErrorEnvelope> {
    const setlistId = args.setlistId?.trim()
    const templateId = args.templateId?.trim()
    const book = args.book?.trim()

    if (!!setlistId === !!templateId) {
        return richError(
            "invalid_argument",
            "Pass exactly one of setlistId or templateId.",
            { setlistId: setlistId ?? null, templateId: templateId ?? null },
            "A binding run reads one document; name which.",
        )
    }
    if (!book) {
        return richError(
            "invalid_argument",
            "book is required.",
            { book: book ?? null },
            "Pass a book slug from list_books — the pages come from that book.",
        )
    }
    if (!liturgyLookup(book).length) {
        return richError(
            "no_lookup_for_book",
            `No liturgy lookup table exists for '${book}'.`,
            { book },
            "Tables exist for crc-friday, crc-saturday, shabbat-maariv and shabbat-shacharit. A book with no table cannot be bound against; nothing is guessed.",
        )
    }

    initAdmin()
    const db = getFirestore()
    const editor = await assertEditor(db, uid)
    if (!editor.ok) return editor

    const rows = setlistId
        ? await rowsForSetlist(db, setlistId, org)
        : await rowsForTemplate(db, templateId as string, org)
    if (!rows) {
        return richError(
            setlistId ? "setlist_not_found" : "template_not_found",
            `${setlistId ? "Setlist" : "Template"} '${setlistId ?? templateId}' was not found.`,
            { setlistId: setlistId ?? null, templateId: templateId ?? null },
            "Verify the id via list_setlists / list_templates.",
        )
    }

    const bound: ProposedBinding[] = []
    const plausible: PlausibleBinding[] = []
    const unmatched: UnmatchedRow[] = []
    const skipped: Array<{ rowId: string; title: string; reason: string }> = []

    for (const row of rows) {
        if (!BINDABLE_TYPES.has(row.type)) {
            skipped.push({
                rowId: row.id,
                title: row.title,
                reason:
                    row.type === "header"
                        ? "header rows are never bound — a header is a sign, not a moment"
                        : `row type '${row.type}' does not name a liturgical moment`,
            })
            continue
        }
        if (row.hasRef) {
            skipped.push({
                rowId: row.id,
                title: row.title,
                reason: "already carries a liturgyRef — an author-typed page is never overwritten",
            })
            continue
        }
        if (!row.title.trim()) {
            skipped.push({ rowId: row.id, title: row.title, reason: "no title to match" })
            continue
        }

        const m = matchLiturgyTitle(book, row.title)
        if (m.clear) {
            bound.push(bindingOf(m.clear, row.id, row.title))
        } else if (m.plausible.length) {
            const first = bindingOf(m.plausible[0], row.id, row.title)
            plausible.push({
                ...first,
                alternatives: m.plausible.map((p) => ({
                    unitId: p.entry.unitId ?? null,
                    label: p.entry.label,
                    folio: p.entry.folio ?? null,
                    confidence: p.score,
                })),
            })
        } else {
            unmatched.push({ rowId: row.id, title: row.title, type: row.type })
        }
    }

    const dryRun = args.dryRun !== false
    const result: ProposeLiturgyBindingsResult = {
        ok: true,
        book,
        ...(setlistId ? { setlistId } : { templateId: templateId as string }),
        dryRun,
        bound,
        plausible,
        unmatched,
        skipped,
    }
    if (dryRun) return result

    // ── Real run ────────────────────────────────────────────────────────
    // Everything in `bound`, plus the `plausible` rows Daniel named in
    // `accept`. Nothing else, ever — an unaccepted plausible row stays
    // unbound however confident it looked.
    const accepted = new Map((args.accept ?? []).map((a) => [a.rowId, a.unitId]))
    const toWrite: ProposedBinding[] = [...bound]
    for (const p of plausible) {
        const wanted = accepted.get(p.rowId)
        if (!wanted) continue
        const alt = p.alternatives.find(
            (a) => a.unitId === wanted || a.label === wanted,
        )
        if (!alt) continue
        toWrite.push({ ...p, unitId: alt.unitId, folio: alt.folio, label: alt.label })
    }

    let written = 0
    for (const b of toWrite) {
        const ref = writableRef(book, b)
        if (!ref) continue
        try {
            if (setlistId) {
                await db.collection("tracks").doc(b.rowId).update({ liturgyRef: ref })
            } else {
                const docRef = db.collection("setlistTemplates").doc(templateId as string)
                await db.runTransaction(async (tx) => {
                    const snap = await tx.get(docRef)
                    const tracks = [...((snap.data()?.tracks as unknown[]) ?? [])]
                    const i = Number(b.rowId)
                    if (!tracks[i]) return
                    tracks[i] = {
                        ...(tracks[i] as Record<string, unknown>),
                        liturgyRefs: {
                            ...(((tracks[i] as Record<string, unknown>)
                                .liturgyRefs as Record<string, unknown>) ?? {}),
                            [book]: b.unitId
                                ? { unitId: b.unitId, folio: b.folio }
                                : { folio: b.folio },
                        },
                    }
                    tx.update(docRef, { tracks })
                })
            }
            written++
        } catch (err) {
            logger.warn("[propose_liturgy_bindings] write failed", {
                rowId: b.rowId,
                err: err instanceof Error ? err.message : String(err),
            })
        }
    }

    return { ...result, written }
}
