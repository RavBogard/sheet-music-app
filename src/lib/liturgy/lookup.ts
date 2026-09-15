import fixedFriday from "@/data/templates/fixed-liturgy.crc-friday.json"
import fixedSaturday from "@/data/templates/fixed-liturgy.crc-saturday.json"
import fixedMaariv from "@/data/templates/fixed-liturgy.shabbat-maariv.json"
import fixedShacharit from "@/data/templates/fixed-liturgy.shabbat-shacharit.json"
import pagemapFriday from "@/data/books/crc-friday.json"
import pagemapSaturday from "@/data/books/crc-saturday.json"
import rowsFriday from "@/data/templates/template-rows.friday.json"
import rowsSaturday from "@/data/templates/template-rows.saturday.json"
import { foldLiturgyName } from "./fold"
import { bindsToName, confirmedBindings } from "./confirmed"

/**
 * The liturgy LOOKUP TABLE — name to identity, per book.
 *
 * Ruling 2 as Daniel reinterpreted it on 2026-09-15 ("bind, don't add"): the
 * service is whatever he puts in the setlist; the system's job is to know what
 * each row IS, not to tell him what belongs in it. So the confirmed
 * fixed-liturgy files are not row lists any more — they are this table, and
 * nothing in this module ever generates a row.
 *
 * READ IN PLACE. The handoff offered a move to
 * `src/data/liturgy/liturgy-map.<book>.json`; the files stay where they are,
 * at `src/data/templates/fixed-liturgy.<book>.json`, because the RULINGS
 * addendum that records Daniel's sitting names that exact path as the artifact
 * he confirmed. Moving them would make the ruling's own citation stale and buy
 * nothing: what gives a file its meaning is what reads it, and what reads it
 * is here.
 *
 * WHAT MAY NEVER LIVE HERE. Names, unit ids and page numbers only — no
 * liturgical text, in any language. That is the standing constraint, and this
 * is the module most tempted to break it.
 *
 * Identity vs pages, per Ruling 8:
 *   - `unitId` is BINDING IDENTITY and comes from the draft feed.
 *   - `folio` is a page number and comes from the LEGACY CRC booklet, which
 *     governs every service until a Shirei volume for it is released. A draft
 *     folio is provisional and is never published, so an entry keyed on a
 *     draft book carries its folio for identity work only.
 */

export interface LiturgyLookupEntry {
    /** Book slug this entry's `folio` belongs to. */
    book: string
    /** Canonical display label — Daniel's spelling from the confirmed rows. */
    label: string
    /** Draft-feed unit id: binding identity across books. Absent when none. */
    unitId?: string
    /** Printed page in `book`. Absent for a moment the book does not print. */
    folio?: number
    /** Every spelling that resolves here, canonical label first. */
    aliases: string[]
    /**
     * `confirmed` — a row Daniel ruled on, 2026-09-15.
     * `pagemap` — a booklet entry no confirmed row claimed; identity for a
     * name Daniel might still type, never a proposal.
     */
    source: "confirmed" | "pagemap"
}

interface FixedRow {
    label: string
    type?: string
    fixed?: boolean
    liturgyRefs?: Record<string, { unitId?: string; folio?: number }>
}

interface FixedFile {
    book: string
    pairedBook?: string
    rows: FixedRow[]
    bookletEntryNotes?: Record<string, string>
}

interface PagemapEntry {
    name: string
    aliases: string[]
    page: number
}

const FIXED: Record<string, FixedFile> = {
    "crc-friday": fixedFriday as FixedFile,
    "crc-saturday": fixedSaturday as FixedFile,
    "shabbat-maariv": fixedMaariv as FixedFile,
    "shabbat-shacharit": fixedShacharit as FixedFile,
}

const PAGEMAPS: Record<string, PagemapEntry[]> = {
    "crc-friday": (pagemapFriday as { entries: PagemapEntry[] }).entries,
    "crc-saturday": (pagemapSaturday as { entries: PagemapEntry[] }).entries,
}

/** The family files that carry Daniel's `settings` rulings, by book. */
const SETTINGS_FILES = [rowsFriday, rowsSaturday] as unknown as Array<{
    book: string
    settings?: Array<{ label: string; of?: string }>
}>

export { foldLiturgyName }

/** `crc-friday entry “Candle Blessing” p.5` -> `Candle Blessing`. */
function bookletEntryName(note: string): string | null {
    const m = note.match(/[“"]([^”"]+)[”"]/)
    return m ? m[1] : null
}

/** `setting of V'ahavta — Daniel …` / `reading; translation of Aleinu — …` */
function settingTarget(of: string | undefined): string | null {
    if (!of) return null
    const m = of.match(/(?:setting|translation) of\s+([^—(]+)/i)
    return m ? m[1].trim() : null
}

/** Daniel's `settings` rules for one book, with their targets resolved. */
function settingRules(book: string): Array<{ label: string; target: string }> {
    const out: Array<{ label: string; target: string }> = []
    for (const fam of SETTINGS_FILES) {
        if (fam.book !== book) continue
        for (const s of fam.settings ?? []) {
            const target = settingTarget(s.of)
            if (target) out.push({ label: s.label, target })
        }
    }
    return out
}

function addAlias(entry: LiturgyLookupEntry, alias: string | null | undefined) {
    if (!alias) return
    const trimmed = alias.trim()
    if (!trimmed) return
    const folded = foldLiturgyName(trimmed)
    if (!folded) return
    if (entry.aliases.some((a) => foldLiturgyName(a) === folded)) return
    entry.aliases.push(trimmed)
}

function buildTable(book: string): LiturgyLookupEntry[] {
    const file = FIXED[book]
    if (!file) return []
    const paired = file.pairedBook

    const entries: LiturgyLookupEntry[] = []
    file.rows.forEach((row, i) => {
        const own = row.liturgyRefs?.[book]
        // Identity comes from the draft feed even when the page comes from the
        // booklet: for `crc-friday` the unit id lives on the paired
        // `shabbat-maariv` ref, because the legacy booklet has no unit ids.
        const unitId =
            own?.unitId ??
            (paired ? row.liturgyRefs?.[paired]?.unitId : undefined)

        const entry: LiturgyLookupEntry = {
            book,
            label: row.label,
            aliases: [],
            source: "confirmed",
        }
        if (unitId) entry.unitId = unitId
        if (typeof own?.folio === "number") entry.folio = own.folio
        addAlias(entry, row.label)

        // The booklet prints several of these under a different name than the
        // one Daniel uses ("Kriyat Sh'ma" for "The Sh'ma"). The sitting
        // recorded each of those as a note; they are aliases, not corrections.
        const note = file.bookletEntryNotes?.[`${i + 1}:${row.label}`]
        if (note) addAlias(entry, bookletEntryName(note))

        entries.push(entry)
    })

    // Pagemap names and aliases, folded onto the confirmed entry that already
    // claims that name. A booklet entry no confirmed row claims becomes its
    // own `pagemap` entry: identity for a name Daniel may type, never a row.
    for (const pm of PAGEMAPS[book] ?? []) {
        const names = [pm.name, ...pm.aliases]
        const host = entries.find(
            (e) =>
                e.source === "confirmed" &&
                names.some((n) =>
                    e.aliases.some((a) => foldLiturgyName(a) === foldLiturgyName(n)),
                ),
        )
        if (host) {
            for (const n of names) addAlias(host, n)
            continue
        }
        const own: LiturgyLookupEntry = {
            book,
            label: pm.name,
            folio: pm.page,
            aliases: [],
            source: "pagemap",
        }
        for (const n of names) addAlias(own, n)
        entries.push(own)
    }

    // A "setting" is a named musical setting or translation OF another moment
    // (Thou Shalt Love is a setting of V'ahavta). Daniel ruled these are never
    // rows of their own, so they resolve as aliases of what they set.
    for (const { label, target } of settingRules(book)) {
        const host = entries.find((e) =>
            e.aliases.some((a) => foldLiturgyName(a) === foldLiturgyName(target)),
        )
        if (host) addAlias(host, label)
    }

    applyConfirmed(book, entries)

    return entries
}

/**
 * A spelling Daniel confirmed that no entry in the book could host.
 *
 * Reported, never swallowed: an unhosted binding is a page he ruled on that
 * nothing will ever carry, and the only honest place to say so is out loud.
 * `confirmed-bindings.test.ts` asserts the list is empty.
 */
export interface ConfirmedBindingProblem {
    book: string
    spelling: string
    bindsTo: string
    folio: number | null
    reason: "no-entry-on-that-page" | "ambiguous-page" | "spelling-is-another-moments-name"
}

const PROBLEMS: ConfirmedBindingProblem[] = []

/**
 * Fold Daniel's confirmed spellings onto the entries they name.
 *
 * KEYED ON THE PAGE. A confirmation says "this spelling means the moment on
 * page N of this booklet", so the candidates are the entries that print page
 * N and the name only has to pick among those. That is what lets "Closing
 * Blessing" reach the concluding Birkat Kohanim at p.100 instead of the
 * page-less one inside the Amidah, and it is the reading the RULINGS addendum
 * spells out.
 *
 * THE BOOKLET SOMETIMES PRINTS A MOMENT UNDER ITS SETTING'S NAME. CRC's
 * booklets print the Amidah's opening line as "Sanctuary", the setting they
 * sing it to; `template-rows.*.json` already records Sanctuary as a setting OF
 * Adonai S'fatai, and that target had no entry to attach to. Daniel ruled the
 * moment is Adonai S'fatai and Sanctuary is how it is printed, so the entry
 * takes his name and keeps the booklet's as an alias — which also resolves the
 * setting, and with it every "sanctuary chords" spelling in the library.
 *
 * EXCLUSIVE. A confirmed spelling is stripped from every other entry in the
 * book: he ruled what it means, and a spelling matching two entries on two
 * pages binds to neither (`assemble` drops a tie across pages to plausible,
 * correctly). The one thing never stripped is another entry's own LABEL —
 * that would delete a moment's name to satisfy a nickname, so it is reported
 * as a problem instead.
 */
function applyConfirmed(book: string, entries: LiturgyLookupEntry[]): void {
    for (const c of confirmedBindings(book)) {
        const core = bindsToName(c.bindsTo)
        const folded = foldLiturgyName(core)
        const names = (e: LiturgyLookupEntry) =>
            e.aliases.some((a) => foldLiturgyName(a) === folded)

        // When the name does not appear on the page, the booklet may be
        // printing the moment under the name of its SETTING. Daniel's
        // `settings` rules already say which setting belongs to which moment,
        // so that mapping — not a guess — picks the entry.
        const settingNames = settingRules(book)
            .filter((s) => foldLiturgyName(s.target) === folded)
            .map((s) => foldLiturgyName(s.label))
        const namesBySetting = (e: LiturgyLookupEntry) =>
            e.aliases.some((a) => settingNames.includes(foldLiturgyName(a)))

        let host: LiturgyLookupEntry | undefined
        if (typeof c.folio === "number") {
            const onPage = entries.filter((e) => e.folio === c.folio)
            host =
                onPage.find(names) ??
                onPage.find(namesBySetting) ??
                (onPage.length === 1 ? onPage[0] : undefined)
            if (!host) {
                PROBLEMS.push({
                    book,
                    spelling: c.spellings[0] ?? core,
                    bindsTo: c.bindsTo,
                    folio: c.folio,
                    reason: onPage.length ? "ambiguous-page" : "no-entry-on-that-page",
                })
                continue
            }
        } else {
            host = entries.find(names)
            if (!host) {
                PROBLEMS.push({
                    book,
                    spelling: c.spellings[0] ?? core,
                    bindsTo: c.bindsTo,
                    folio: null,
                    reason: "no-entry-on-that-page",
                })
                continue
            }
        }

        if (!names(host)) {
            host.label = core
            host.source = "confirmed"
        }
        addAlias(host, core)
        for (const spelling of c.spellings) addAlias(host, spelling)

        for (const other of entries) {
            if (other === host) continue
            for (const spelling of c.spellings) {
                const f = foldLiturgyName(spelling)
                if (!f) continue
                if (foldLiturgyName(other.label) === f) {
                    PROBLEMS.push({
                        book,
                        spelling,
                        bindsTo: c.bindsTo,
                        folio: c.folio,
                        reason: "spelling-is-another-moments-name",
                    })
                    continue
                }
                const at = other.aliases.findIndex((a) => foldLiturgyName(a) === f)
                if (at >= 0) other.aliases.splice(at, 1)
            }
        }
    }
}

/** Confirmed spellings that could not be placed. Built lazily with the tables. */
export function confirmedBindingProblems(): ConfirmedBindingProblem[] {
    for (const book of liturgyLookupBooks()) liturgyLookup(book)
    return PROBLEMS
}

const TABLES = new Map<string, LiturgyLookupEntry[]>()

/** The lookup table for one book. Empty array for a book with no table. */
export function liturgyLookup(book: string): LiturgyLookupEntry[] {
    if (!TABLES.has(book)) TABLES.set(book, buildTable(book))
    return TABLES.get(book) as LiturgyLookupEntry[]
}

/** Books this table covers. */
export function liturgyLookupBooks(): string[] {
    return Object.keys(FIXED)
}

/**
 * Settings whose target could not be resolved in their own book.
 *
 * Reported rather than swallowed: an unresolved setting means a spelling
 * Daniel uses will not bind, and the only honest place to say so is out loud.
 */
export function unresolvedSettings(): Array<{
    book: string
    label: string
    of?: string
}> {
    const out: Array<{ book: string; label: string; of?: string }> = []
    for (const fam of SETTINGS_FILES) {
        const table = liturgyLookup(fam.book)
        for (const s of fam.settings ?? []) {
            const target = settingTarget(s.of)
            const found =
                !!target &&
                table.some((e) =>
                    e.aliases.some(
                        (a) => foldLiturgyName(a) === foldLiturgyName(target),
                    ),
                )
            if (!found) out.push({ book: fam.book, label: s.label, of: s.of })
        }
    }
    return out
}
