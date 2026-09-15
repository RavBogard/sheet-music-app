import rowsFriday from "@/data/templates/template-rows.friday.json"
import rowsSaturday from "@/data/templates/template-rows.saturday.json"
import type { TemplateSlot } from "@/lib/liturgical-templates"
import type { SlotLiturgyRefs } from "@/lib/books/slot-liturgy"
import type { TrackType } from "@/types/models"
import { foldLiturgyName, liturgyLookup } from "@/lib/liturgy/lookup"
import { matchLiturgyTitle } from "@/lib/liturgy/match"

/**
 * A-W3" — the rows a service ALWAYS does, merged into its template.
 *
 * Daniel, 2026-09-15 (BIND-NOT-ADD addendum 2): "I'm fine with building out
 * the templates a little more fully, so that when David makes a setlist for a
 * Saturday morning, it will dynamically and automatically add things that are
 * always done (Avot v'Imahot, G'vurot, Aleinu…), unless specifically and
 * explicitly skipped for a service."
 *
 * This is the ONE narrowing of "no template or setlist ever gains a row it did
 * not have": rows are added only for moments Daniel himself marked **Always**
 * for that family, in the order he confirmed. `sometimes` rows are what
 * `propose_service_frame` offers and this module never touches; `never` rows
 * stay in the lookup for identity alone.
 *
 * NOT DERIVED, DECLARED. The Always list is Daniel's, delivered as
 * `src/data/templates/template-rows.<family>.json`. Nothing here infers it
 * from a book or from a census — that is the whole point of the ruling.
 *
 * NOT DUPLICATED. A moment the template already carries as a song slot
 * (Bar'chu, Sh'ma, Mi Chamocha…) does not gain a second row: the song slot
 * takes the `liturgyRefs` instead, so the band keeps its chart and the row
 * gains its page. A cloned fixed row is an ordinary row — deletable per
 * service with no warning, which is what "explicitly skipped" means.
 */

interface AlwaysRowJson {
    label: string
    type?: string
    order?: number
    liturgyRefs?: Record<string, { unitId?: string; folio?: number }>
    note?: string | null
}

interface FamilyFile {
    family: string
    book: string
    always: AlwaysRowJson[]
}

const FAMILIES: Record<string, FamilyFile> = {
    friday_night: rowsFriday as unknown as FamilyFile,
    shabbat_morning: rowsSaturday as unknown as FamilyFile,
}

/** How a base slot came to carry (or not carry) an Always row. */
export interface AlwaysMergeNote {
    label: string
    outcome: "bound-to-slot" | "inserted"
    /** The base slot label that already named this moment, when one did. */
    slot?: string
    /** Daniel marked it Always but no book prints it — it clones page-less. */
    pageless?: boolean
}

export interface AlwaysMergeResult {
    slots: TemplateSlot[]
    notes: AlwaysMergeNote[]
}

/** The family files this module knows. */
export function alwaysRowFamilies(): string[] {
    return Object.keys(FAMILIES)
}

/** Daniel's Always rows for a family, in his confirmed order. */
export function alwaysRowsFor(family: string): AlwaysRowJson[] {
    return FAMILIES[family]?.always ?? []
}

/**
 * Every spelling that names this moment: its own label plus the aliases the
 * lookup table carries for it. Matching a template slot is EXACT on this set
 * — no fuzz. A near-miss here would silently swallow a row Daniel marked
 * Always, and a swallowed row is invisible; an extra row is not.
 */
function spellingsFor(row: AlwaysRowJson, book: string): string[] {
    const table = liturgyLookup(book)
    const folded = foldLiturgyName(row.label)
    const unitId = Object.values(row.liturgyRefs ?? {}).find((r) => r.unitId)?.unitId
    const entry =
        (unitId ? table.find((e) => e.unitId === unitId) : undefined) ??
        table.find((e) => e.aliases.some((a) => foldLiturgyName(a) === folded))
    return entry ? entry.aliases : [row.label]
}

/**
 * Does base slot `label` name this moment?
 *
 * The whole label may match any alias — the template says "Candle Lighting"
 * where the booklet prints "Lighting the Candles", and both are the moment.
 *
 * A HALF of a compound label ("Modeh Ani / Morning Blessings") may only match
 * the moment's CANONICAL name. This is not fussiness: the Saturday template
 * has a Torah-service slot called "Avot / Torah Processional", and "Avot" is a
 * legitimate booklet alias of the Amidah's "Avot v'Imahot" thirteen pages
 * earlier. Matching a compound half against aliases bound the Amidah's opening
 * to the Torah procession, printed p.71 on a Torah-service row, and dragged
 * the whole Amidah block out of place behind it. A compound half is a hint,
 * and a hint is not allowed to move a page.
 */
function slotNamesMoment(
    label: string,
    aliases: string[],
    canonical: string,
): boolean {
    const folded = foldLiturgyName(label)
    if (aliases.some((a) => foldLiturgyName(a) === folded)) return true
    const parts = label.split("/").map((p) => p.trim()).filter(Boolean)
    if (parts.length < 2) return false
    return parts.some((p) => foldLiturgyName(p) === foldLiturgyName(canonical))
}

function isHeader(slot: TemplateSlot): boolean {
    return slot.type === "header" || slot.isHeader === true
}

/**
 * Merge a family's Always rows into its base template.
 *
 * Two passes, because one is not enough to place a row honestly.
 *
 * PASS 1 assigns ANCHORS: the base slot, if any, that already names each
 * Always moment. Anchors only ever move forward, so a later moment can never
 * be pulled back into an earlier block.
 *
 * PASS 2 walks Daniel's order. An anchored row is emitted in the base slot's
 * place, carrying its pages. An unanchored row is INSERTED, and where it goes
 * is decided by the printed page: base slots keep coming out until one is
 * reached that either anchors a later Always row, or sits on a LATER page than
 * the row being inserted. That is what keeps the Amidah block together under
 * its own header instead of scattered through the Torah service — the two
 * orders disagree, and the booklet's page numbers are the tiebreak Daniel
 * already ruled on (Ruling 8: order disagreements resolve in favour of the
 * booklet).
 *
 * The page used for POSITIONING a base slot is a fuzzy match on its label and
 * is never written anywhere. Only `liturgyRefs` Daniel confirmed are written.
 */
export function mergeAlwaysRows(
    base: TemplateSlot[],
    family: string,
): AlwaysMergeResult {
    const file = FAMILIES[family]
    if (!file) return { slots: base, notes: [] }

    // Where each base slot sits in the booklet, for ORDERING only.
    const slotFolio = base.map((slot) =>
        isHeader(slot)
            ? undefined
            : matchLiturgyTitle(file.book, slot.label).clear?.entry.folio,
    )

    // Pass 1 — anchors, strictly forward.
    const anchorOf = new Map<number, number>()
    const anchored = new Set<number>()
    let scan = 0
    file.always.forEach((row, r) => {
        const aliases = spellingsFor(row, file.book)
        const at = base.findIndex(
            (slot, i) =>
                i >= scan &&
                !anchored.has(i) &&
                !isHeader(slot) &&
                slotNamesMoment(slot.label, aliases, row.label),
        )
        if (at >= 0) {
            anchorOf.set(r, at)
            anchored.add(at)
            scan = at + 1
        }
    })

    // Pass 2 — emit.
    const out: TemplateSlot[] = []
    const notes: AlwaysMergeNote[] = []
    let cursor = 0

    const emitBaseUpTo = (limit: number) => {
        while (cursor < limit) out.push(base[cursor++])
    }

    file.always.forEach((row, r) => {
        const refs = (row.liturgyRefs ?? {}) as SlotLiturgyRefs
        const hasRefs = Object.keys(refs).length > 0
        const at = anchorOf.get(r)

        if (at !== undefined) {
            emitBaseUpTo(at)
            const slot = base[at]
            out.push(hasRefs ? { ...slot, liturgyRefs: refs } : { ...slot })
            cursor = at + 1
            notes.push({
                label: row.label,
                outcome: "bound-to-slot",
                slot: slot.label,
                ...(hasRefs ? {} : { pageless: true }),
            })
            return
        }

        const folio = refs[file.book]?.folio
        const laterAnchors = new Set(
            [...anchorOf.entries()].filter(([k]) => k > r).map(([, v]) => v),
        )
        // A page-less row (Saturday's K'dushat HaYom) does not move. With no
        // printed page there is no evidence for where it goes but Daniel's
        // order, so it stays beside the row he put it beside.
        let stop = cursor
        while (typeof folio === "number" && stop < base.length) {
            if (laterAnchors.has(stop)) break
            const f = slotFolio[stop]
            if (typeof f === "number" && f >= folio) break
            stop++
        }
        emitBaseUpTo(stop)

        const inserted: TemplateSlot = {
            label: row.label,
            type: (row.type as TrackType) ?? "prayer",
            queries: [],
            fixed: true,
        }
        // K'dushat HaYom (Saturday) is Always with no booklet page. It clones
        // page-less rather than borrowing a neighbour's number.
        if (hasRefs) inserted.liturgyRefs = refs
        out.push(inserted)
        notes.push({
            label: row.label,
            outcome: "inserted",
            ...(hasRefs ? {} : { pageless: true }),
        })
    })

    emitBaseUpTo(base.length)
    return { slots: out, notes }
}
