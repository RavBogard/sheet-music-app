#!/usr/bin/env node
/**
 * Propose the fixed-liturgy rows for the two weekly service templates.
 *
 * "Fixed liturgy" is the part of the service the congregation says every week
 * straight from the book — Bar'chu, the Sh'ma, Hashkiveinu, Aleinu — as
 * opposed to the songs the band plays from charts. A-W2 of
 * PLAN-CODE-LIVE-INTEGRATION-2026-09-14.md: the ORDER of that liturgy comes
 * from the book's own feed, never from anyone's memory.
 *
 * WHAT IT DOES. Walks each feed-tier book's `units[]` IN FEED ORDER, keeps the
 * units named in `scripts/fixed-liturgy.json`, and for each one resolves the
 * printed page in BOTH books of that service: the feed book (folio + stable
 * unitId) and the congregation's own pagemap book (folio only — pagemap tiers
 * have no unit ids).
 *
 * WHAT IT REFUSES TO DO. The pagemap match is EXACT-ONLY, on a name or alias,
 * after the same normalization `src/lib/books/lookup.ts` uses. Substring
 * matching — which `lookupBookPage` offers as its 'medium' tier — produces
 * real false hits on this corpus: "Nishmat Kol Chai" contains the letters of
 * "Sh'ma" ("ni-SHMA-t"), and would take the Sh'ma's page. Anything short of an
 * unambiguous exact hit is reported as AMBIGUOUS with its candidates and left
 * for Daniel. A wrong page here prints on the rabbi's lectern sheet.
 *
 * THIS SCRIPT DECIDES NOTHING. It writes proposals to `work/` for Daniel to
 * confirm in a sitting. The confirmed files land at
 * `src/data/templates/fixed-liturgy.<book>.json` and A-W3 consumes those.
 *
 * Usage: node scripts/emit-fixed-liturgy.mjs [--out <dir>]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { join, resolve } from "node:path"

const BOOKS_DIR = resolve(process.cwd(), "src", "data", "books")
const ALLOWLIST = resolve(process.cwd(), "scripts", "fixed-liturgy.json")

/**
 * Fold case, strip punctuation, collapse whitespace.
 *
 * A byte-for-byte port of `norm()` in src/lib/books/lookup.ts. It is a port
 * rather than an import because this is a plain .mjs script and that module is
 * TypeScript; `scripts/__tests__/emit-fixed-liturgy.test.ts` asserts the two
 * agree over every entry of every shipped book, so the duplication cannot
 * drift silently.
 */
export function norm(s) {
    return s
        .toLowerCase()
        .replace(/['’`"]/g, "")
        .replace(/[^a-z0-9֐-׿]+/g, " ")
        .trim()
        .replace(/\s+/g, " ")
}

/** A unit id with its `@book` suffix removed. */
export function stemOf(unitId) {
    const at = unitId.indexOf("@")
    return at === -1 ? unitId : unitId.slice(0, at)
}

/**
 * Exact name/alias hit for `name` in a pagemap book.
 *
 * Returns `{ status: 'exact', page }` only when every exact hit agrees on a
 * page — two settings of the same prayer printed at the same spot are safe;
 * two that disagree are the ambiguity this whole script exists to surface.
 */
export function matchPagemap(pagemapBook, name) {
    const q = norm(name)
    if (!q) return { status: "none", candidates: [] }
    const exact = []
    const partial = []
    for (const e of pagemapBook.entries ?? []) {
        const cands = [norm(e.name), ...(e.aliases ?? []).map(norm)]
        if (cands.some((c) => c === q)) exact.push(e)
        else if (cands.some((c) => c.includes(q) || q.includes(c))) partial.push(e)
    }
    if (exact.length) {
        const pages = [...new Set(exact.map((e) => e.page))]
        if (pages.length === 1) return { status: "exact", page: pages[0], candidates: exact }
        return { status: "ambiguous", candidates: exact }
    }
    if (partial.length) return { status: "ambiguous", candidates: partial }
    return { status: "none", candidates: [] }
}

function loadBook(slug) {
    return JSON.parse(readFileSync(join(BOOKS_DIR, slug + ".json"), "utf8"))
}

/** Build the proposal for one service (one feed book + one pagemap book). */
export function buildProposal(service, feedBook, pagemapBook) {
    const wanted = new Map(service.stems.map((s) => [s.stem, s]))
    const seen = new Set()
    const rows = []

    for (const unit of feedBook.units ?? []) {
        const stem = stemOf(unit.id)
        const want = wanted.get(stem)
        if (!want) continue
        if (seen.has(stem)) {
            // The same stem twice in one feed (e.g. a reserve reprise). The
            // first occurrence is the service's; the later one is not.
            rows.push({
                skipped: "duplicate-stem",
                stem,
                label: unit.name,
                feedUnitId: unit.id,
                feedFolio: unit.folios[0],
            })
            continue
        }
        seen.add(stem)

        const pm = matchPagemap(pagemapBook, unit.name)
        rows.push({
            stem,
            label: unit.name,
            type: want.type ?? "prayer",
            fixed: true,
            feedUnitId: unit.id,
            feedFolio: unit.folios[0],
            feedFolios: unit.folios,
            pagemapStatus: pm.status,
            pagemapFolio: pm.status === "exact" ? pm.page : null,
            pagemapCandidates: pm.candidates.map((c) => ({ name: c.name, page: c.page })),
            note: want.note ?? null,
        })
    }

    // The two books do not always agree on ORDER. crc-friday prints Adon Olam
    // at p.43 and the Closing Blessing at p.45, where the feed runs Priestly
    // Blessing then Adon Olam. Feed order is the proposal's spine, so any row
    // whose pagemap page goes BACKWARDS is a place the congregation's own book
    // disagrees — exactly the kind of thing Daniel should see, not a bug to
    // paper over by re-sorting.
    let lastPage = 0
    for (const r of rows) {
        if (r.skipped || r.pagemapFolio === null) continue
        r.pagemapOutOfOrder = r.pagemapFolio < lastPage
        lastPage = r.pagemapFolio
    }

    const missing = [...wanted.keys()].filter((s) => !seen.has(s))
    return { rows, missing }
}

/** The `liturgyRefs` shape A-W3 merges into the template defaults. */
function toSlotRows(rows, feedSlug, pagemapSlug) {
    return rows
        .filter((r) => !r.skipped)
        .map((r) => {
            const liturgyRefs = {
                [feedSlug]: { unitId: r.feedUnitId, folio: r.feedFolio },
            }
            if (r.pagemapFolio !== null) {
                liturgyRefs[pagemapSlug] = { folio: r.pagemapFolio }
            }
            return { label: r.label, type: r.type, fixed: true, liturgyRefs }
        })
}

function table(rows, bookKey) {
    const head =
        "| # | Label | Folio | Unit id | Pagemap match |\n|--:|---|--:|---|---|"
    const body = rows
        .filter((r) => !r.skipped)
        .map((r, i) => {
            const folio = bookKey === "feed" ? r.feedFolio : (r.pagemapFolio ?? "—")
            const unitId = bookKey === "feed" ? "`" + r.feedUnitId + "`" : "—"
            let match = ""
            if (bookKey === "pagemap") {
                if (r.pagemapStatus === "exact")
                    match = r.pagemapOutOfOrder
                        ? "exact — **but this book prints it EARLIER than the row above**"
                        : "exact"
                else if (r.pagemapStatus === "none") match = "**no entry in this book**"
                else
                    match =
                        "**AMBIGUOUS** — " +
                        r.pagemapCandidates.map((c) => c.name + " p." + c.page).join("; ")
            } else {
                match = r.note ? r.note : ""
            }
            return "| " + (i + 1) + " | " + r.label + " | " + folio + " | " + unitId + " | " + match + " |"
        })
        .join("\n")
    return head + "\n" + body
}

function main() {
    const outArg = process.argv.indexOf("--out")
    const outDir = resolve(
        process.cwd(),
        outArg !== -1 ? process.argv[outArg + 1] : "work",
    )
    mkdirSync(outDir, { recursive: true })

    const config = JSON.parse(readFileSync(ALLOWLIST, "utf8"))
    const out = { generatedAt: new Date().toISOString(), services: {} }

    for (const [key, service] of Object.entries(config.services)) {
        const feedBook = loadBook(service.feedBook)
        const pagemapBook = loadBook(service.pagemapBook)
        const { rows, missing } = buildProposal(service, feedBook, pagemapBook)

        const kept = rows.filter((r) => !r.skipped)
        const ambiguous = kept.filter((r) => r.pagemapStatus === "ambiguous")
        const absent = kept.filter((r) => r.pagemapStatus === "none")
        const outOfOrder = kept.filter((r) => r.pagemapOutOfOrder)

        for (const [bookKey, slug] of [
            ["feed", service.feedBook],
            ["pagemap", service.pagemapBook],
        ]) {
            const sections = []
            sections.push("# Fixed liturgy — " + service.label + " — `" + slug + "`")
            sections.push("")
            sections.push(
                "Generated by `scripts/emit-fixed-liturgy.mjs` from `src/data/books/" +
                    slug +
                    ".json`. Order is the feed book's own unit order — not a remembered sequence.",
            )
            sections.push("")
            sections.push(
                "**" +
                    kept.length +
                    " rows.** " +
                    (bookKey === "pagemap"
                        ? ambiguous.length +
                          " ambiguous, " +
                          absent.length +
                          " with no entry in this book, " +
                          outOfOrder.length +
                          " where this book's order disagrees with the feed."
                        : "Every row carries a stable unit id."),
            )
            sections.push("")
            sections.push(table(rows, bookKey))
            sections.push("")

            if (
                bookKey === "pagemap" &&
                (ambiguous.length || absent.length || outOfOrder.length)
            ) {
                sections.push("## Needs a ruling")
                sections.push("")
                for (const r of outOfOrder) {
                    sections.push(
                        "- **" +
                            r.label +
                            "** — `" +
                            slug +
                            "` prints it at p." +
                            r.pagemapFolio +
                            ", before the row above it. The two books order this part of the service differently; the proposal follows the feed.",
                    )
                }
                for (const r of ambiguous) {
                    sections.push(
                        "- **" +
                            r.label +
                            "** — no unambiguous entry. Candidates: " +
                            r.pagemapCandidates.map((c) => c.name + " p." + c.page).join("; "),
                    )
                }
                for (const r of absent) {
                    sections.push(
                        "- **" +
                            r.label +
                            "** — this book has no entry. The row clones page-less under `" +
                            slug +
                            "` unless a page is supplied.",
                    )
                }
                sections.push("")
            }

            if (missing.length) {
                sections.push("## Allow-listed but not found in the feed")
                sections.push("")
                for (const m of missing) sections.push("- `" + m + "`")
                sections.push("")
            }

            const candidates = service.candidates ?? []
            if (candidates.length) {
                sections.push("## Not seeded — candidates for Daniel")
                sections.push("")
                for (const c of candidates) {
                    sections.push("- `" + c.stem + "`" + (c.why ? " — " + c.why : ""))
                }
                sections.push("")
            }

            const path = join(outDir, "fixed-liturgy-proposal-" + slug + ".md")
            writeFileSync(path, sections.join("\n"), "utf8")
            console.log("wrote " + path)
        }

        out.services[key] = {
            label: service.label,
            feedBook: service.feedBook,
            pagemapBook: service.pagemapBook,
            rowCount: kept.length,
            ambiguous: ambiguous.map((r) => ({
                label: r.label,
                candidates: r.pagemapCandidates,
            })),
            absentFromPagemap: absent.map((r) => r.label),
            pagemapOrderDisagreements: outOfOrder.map((r) => ({
                label: r.label,
                pagemapFolio: r.pagemapFolio,
            })),
            missingFromFeed: missing,
            rows: toSlotRows(rows, service.feedBook, service.pagemapBook),
        }
    }

    const jsonPath = join(outDir, "fixed-liturgy-proposal.json")
    writeFileSync(jsonPath, JSON.stringify(out, null, 2) + "\n", "utf8")
    console.log("wrote " + jsonPath)
}

const invokedDirectly =
    process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())
if (invokedDirectly) main()
