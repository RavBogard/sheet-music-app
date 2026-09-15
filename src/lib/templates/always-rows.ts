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
    /** Moments CRC does some weeks and not others — `propose_service_frame`. */
    sometimes?: string[]
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

/**
 * Which family's lists govern a setlist's `serviceType`.
 *
 * The site has four service types and Daniel ruled on two families. A
 * b'nai mitzvah IS a Shabbat morning service with a simcha in the middle, and
 * `kabbalat-shabbat` is the Friday evening service under its liturgical name —
 * so they inherit, rather than each needing their own confirmed list. A type
 * with no family (Shir Shabbat, a musical service that follows no booklet
 * order) returns null and is offered nothing, which is correct.
 */
export function familyForServiceType(serviceType: string): string | null {
    switch (serviceType) {
        case "friday_night":
        case "kabbalat-shabbat":
            return "friday_night"
        case "shabbat_morning":
        case "bnei_mitzvah_saturday":
            return "shabbat_morning"
        default:
            return null
    }
}

/** Daniel's Sometimes moments for a family — candidates, never rows. */
export function sometimesRowsFor(family: string): string[] {
    return FAMILIES[family]?.sometimes ?? []
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

/**
 * How the merge reads and writes ONE row of whatever it is merging into.
 *
 * The merge logic is about labels, types and printed pages; it has no opinion
 * about the rest of a row. Code templates carry `queries` and `topics`;
 * Firestore templates carry `songId`, `fileId`, keys and vocal leads. Routing
 * one through the other's type would drop half of it — a Saturday morning
 * template losing every chart binding, quietly, to gain some page numbers —
 * so the merge takes an adapter and keeps its hands off the row.
 */
export interface AlwaysMergeAdapter<T> {
    labelOf(row: T): string
    typeOf(row: T): string | undefined
    /** The row, unchanged except that it now carries these pages. */
    withRefs(row: T, refs: SlotLiturgyRefs): T
    /** A brand-new fixed-liturgy row for a moment no base row named. */
    make(label: string, type: string, refs?: SlotLiturgyRefs): T
}

const SLOT_ADAPTER: AlwaysMergeAdapter<TemplateSlot> = {
    labelOf: (slot) => slot.label,
    typeOf: (slot) => (slot.isHeader === true ? "header" : slot.type),
    withRefs: (slot, refs) => ({ ...slot, liturgyRefs: refs }),
    make: (label, type, refs) => ({
        label,
        type: type as TrackType,
        queries: [],
        fixed: true,
        ...(refs ? { liturgyRefs: refs } : {}),
    }),
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
    const merged = mergeAlwaysRowsWith(base, family, SLOT_ADAPTER)
    return { slots: merged.rows, notes: merged.notes }
}

/** The same merge, against any row shape an adapter can read and write. */
export function mergeAlwaysRowsWith<T>(
    base: T[],
    family: string,
    adapter: AlwaysMergeAdapter<T>,
): { rows: T[]; notes: AlwaysMergeNote[]; book: string | null } {
    const file = FAMILIES[family]
    if (!file) return { rows: base, notes: [], book: null }

    const isHeader = (row: T) => {
        const t = adapter.typeOf(row)
        return t === "header" || t === "section"
    }

    // Where each base slot sits in the booklet, for ORDERING only.
    const slotFolio = base.map((row) =>
        isHeader(row)
            ? undefined
            : matchLiturgyTitle(file.book, adapter.labelOf(row)).clear?.entry.folio,
    )

    // Pass 1 — anchors, strictly forward.
    const anchorOf = new Map<number, number>()
    const anchored = new Set<number>()
    let scan = 0
    file.always.forEach((row, r) => {
        const aliases = spellingsFor(row, file.book)
        const at = base.findIndex(
            (candidate, i) =>
                i >= scan &&
                !anchored.has(i) &&
                !isHeader(candidate) &&
                slotNamesMoment(adapter.labelOf(candidate), aliases, row.label),
        )
        if (at >= 0) {
            anchorOf.set(r, at)
            anchored.add(at)
            scan = at + 1
        }
    })

    // Pass 2 — emit.
    const out: T[] = []
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
            out.push(hasRefs ? adapter.withRefs(slot, refs) : slot)
            cursor = at + 1
            notes.push({
                label: row.label,
                outcome: "bound-to-slot",
                slot: adapter.labelOf(slot),
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

        // K'dushat HaYom (Saturday) is Always with no booklet page. It clones
        // page-less rather than borrowing a neighbour's number.
        out.push(adapter.make(row.label, row.type ?? "prayer", hasRefs ? refs : undefined))
        notes.push({
            label: row.label,
            outcome: "inserted",
            ...(hasRefs ? {} : { pageless: true }),
        })
    })

    emitBaseUpTo(base.length)
    return { rows: out, notes, book: file.book }
}
