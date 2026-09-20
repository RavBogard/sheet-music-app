#!/usr/bin/env node
/**
 * Regenerate trimmed feed-tier book snapshots from the shireishabbat Typst
 * pipeline's JSON feeds.
 *
 * The full feeds carry every block of liturgical text (287KB–1.05MB each).
 * The outline layer only needs "which unit is on which printed page", so we
 * keep {id, name, folios} per unit and drop everything else.
 *
 * Snapshots are committed to git on purpose: the setlist path must never
 * depend on the shireishabbat repo being present, built, or deployed.
 *
 * TWO THINGS THIS SCRIPT MUST NOT DO (R-0902-live-cw-2, R-0831-live-pagemap-1):
 *
 *   1. It must not compute `pages`. `pages` is the PRINTED page count and a
 *      book continues past its last prayer — Shirei Tshuvah's last unit is on
 *      folio 182 and the book is 184 printed pages. A `maxFolio` would write
 *      182 over 184 and silently shorten a printed book. The recorded value in
 *      registry.json is authoritative; this script ASSERTS against it.
 *
 *   2. It must not read an unpinned build. `dist/` is whatever was last built
 *      locally; `dist-app/` is the licensed carrier a printed volume was
 *      pressed from. A PRINTED volume pins the `printing.gitSha` it may be
 *      regenerated from, and a mismatch is a hard refusal — a printed volume's
 *      pin is its press commit, never HEAD.
 *
 *      An ALPHA DRAFT has no press commit to pin to, and pinning one anyway
 *      was backwards: it froze the two Shabbat drafts at the commit they
 *      happened to be at and refused every later build of them, including the
 *      one that answers the folio-145 question. Ruling 8 (2026-09-15) settles
 *      which books are which — Shirei Tshuvah is the only released volume —
 *      and R2-b drops the pin for `shabbat-maariv` and `shabbat-shacharit`
 *      accordingly. The guard stays armed where it means something.
 *
 * Usage: npm run sync:books [-- --repo <path>] [--feed-dir <name>] [--check]
 *        --check writes nothing and reports drift instead.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join, resolve } from "node:path"

const DEFAULT_REPO = "C:/Users/dsbog/shireishabbat"
const OUT_DIR = resolve(process.cwd(), "src", "data", "books")
/** The moments artifact, produced by shireishabbat's build/tools/emit_moments.py. */
const MOMENTS_FEED = "moments.json"
const MOMENTS_OUT = join(OUT_DIR, "moments.json")
const REGISTRY = join(OUT_DIR, "registry.json")
const EXPECTED_SCHEMA_VERSION = 1

/** The pinned carrier. `dist/` is an unpinned local build — see the header. */
const DEFAULT_FEED_DIR = "dist-app"

const VOLUMES = [
    {
        slug: "shabbat-maariv",
        feed: "shabbat-maariv-feed.json",
        title: "Shirei Shabbat — Friday Night",
        // Alpha draft, not a printed volume (Ruling 8 / R2-b). No press commit
        // exists, so there is nothing honest to pin to.
        pin: null,
    },
    {
        slug: "shabbat-shacharit",
        feed: "shabbat-shacharit-feed.json",
        title: "Shirei Shabbat — Shabbat Morning",
        // Alpha draft — see shabbat-maariv above.
        pin: null,
    },
    {
        slug: "shirei-tshuvah",
        feed: "shirei-tshuvah-feed.json",
        title: "Shirei Tshuvah — Rosh Hashanah",
        pin: "21417d9-LICENSED",
    },
]

function flag(name) {
    const i = process.argv.indexOf(name)
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null
}

const repoPath = () => flag("--repo") ?? DEFAULT_REPO
const feedDirName = () => flag("--feed-dir") ?? DEFAULT_FEED_DIR
const isCheck = () => process.argv.includes("--check")

/** The printed page count for a volume, from the authoritative registry. */
function recordedPages(registry, slug) {
    const entry = registry.find((r) => r.slug === slug)
    if (!entry) throw new Error(`${slug}: no registry.json entry. \`pages\` has no authoritative source.`)
    if (!Number.isInteger(entry.pages) || entry.pages <= 0) {
        throw new Error(`${slug}: registry.json records pages=${JSON.stringify(entry.pages)}, not a positive integer.`)
    }
    return entry.pages
}

function trim(feed, vol, pages) {
    if (feed.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
        throw new Error(
            `${vol.slug}: feed schemaVersion ${feed.schemaVersion} != expected ${EXPECTED_SCHEMA_VERSION}. ` +
                `The feed contract changed — review build/schema/feed.schema.json before re-running.`,
        )
    }

    // V2 — the pin. A printed volume is regenerated from its press commit or
    // not at all. This is what stops an unpinned build reaching src/data/books.
    // A draft (`pin: null`) has no press commit and is regenerated freely.
    const sha = feed.printing?.gitSha ?? null
    if (vol.pin !== null && sha !== vol.pin) {
        throw new Error(
            `${vol.slug}: feed is built from ${JSON.stringify(sha)}, pinned to ${JSON.stringify(vol.pin)}. ` +
                `Refusing to regenerate a pinned volume from an unpinned build (R-0831-live-pagemap-1).`,
        )
    }

    const units = []
    let maxFolio = 0
    for (const u of feed.units ?? []) {
        const folios = (u.folios ?? []).filter((f) => Number.isInteger(f)).sort((a, b) => a - b)
        if (folios.length === 0) continue
        for (const f of folios) if (f > maxFolio) maxFolio = f
        units.push({ id: u.id, name: u.name ?? u.id, folios })
    }
    if (units.length === 0) throw new Error(`${vol.slug}: feed produced zero units`)

    // V1 — `pages` is asserted, never computed. An identity that stays true as
    // a book changes: the last prayer cannot fall past the last printed page.
    if (maxFolio > pages) {
        throw new Error(
            `${vol.slug}: feed's last unit is on folio ${maxFolio}, past the recorded ${pages} printed pages. ` +
                `Either the recorded page count is stale or this is the wrong build — not resolvable here.`,
        )
    }

    return { book: { slug: vol.slug, title: vol.title, tier: "feed", pages, units }, maxFolio }
}

/**
 * A press pin with its licence marker removed.
 *
 * `.live` pins a printed volume as `6f61874-LICENSED`; the feed's own
 * `printing.gitSha` carries the same string, and the moments producer copies it
 * verbatim into `sources[].gitSha`. Normalising BOTH sides means the guard can
 * never refuse over a marker that is present on one side only — the thing being
 * compared is the commit.
 */
function bareSha(v) {
    return typeof v === "string" ? v.replace(/-LICENSED$/, "") : v
}

/**
 * Consume `dist-app/moments.json` into a trimmed `src/data/books/moments.json`.
 *
 * WHAT A MOMENT IS. One liturgical moment — Mi Chamocha — printed in several
 * books at several pages. The artifact keys on the unit-id STEM, so a single
 * moment gathers its occurrences across every book that prints it. That is what
 * lets a setlist row survive a change of book: `momentForUnit` turns this book's
 * unit into a moment, `occurrencesForMoment` finds that moment in the new one.
 *
 * NO TEXT, EVER. The artifact carries ids, display names, kinds and page
 * numbers. Liturgical text never enters this repo, and the trim below keeps
 * exactly three fields per occurrence, so nothing can arrive by accident.
 *
 * THE PIN GUARD. A printed volume's derived data generates from its press
 * commit, never HEAD (R-0831-live-pagemap-1). The book snapshots in this repo
 * were trimmed from feeds built at a specific commit; consuming a moments file
 * built from a DIFFERENT commit would pair this repo's page numbers with another
 * build's unit ids, silently. So every PINNED book's pin must equal the `gitSha`
 * the artifact recorded for it, or the step refuses and writes nothing. A draft
 * (`pin: null`, R2-b) still needs a source row — pairing blind is the thing
 * being refused, and that is true of a draft too — but its sha is free.
 *
 * Pure — no filesystem, so `scripts/__tests__/sync-books-moments.test.ts` can
 * drive every branch from fixtures.
 */
export function trimMoments(artifact, volumes, knownBooks, remap = (o) => o) {
    if (artifact.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
        throw new Error(
            `moments.json schemaVersion ${artifact.schemaVersion} != expected ${EXPECTED_SCHEMA_VERSION}.`,
        )
    }
    const sources = Array.isArray(artifact.sources) ? artifact.sources : []
    for (const vol of volumes) {
        const src = sources.find((x) => x.book === vol.slug)
        if (!src) {
            throw new Error(
                `moments.json carries no source row for '${vol.slug}'. ` +
                    `This repo's ${vol.slug}.json was trimmed from that feed; refusing to pair them blind.`,
            )
        }
        if (vol.pin !== null && bareSha(src.gitSha) !== bareSha(vol.pin)) {
            throw new Error(
                `${vol.slug}: moments.json was built from ${JSON.stringify(src.gitSha)}, ` +
                    `this repo pins ${JSON.stringify(vol.pin)}. Refusing — a printed volume's ` +
                    `derived artifacts generate from its press commit, never HEAD ` +
                    `(R-0831-live-pagemap-1).`,
            )
        }
    }

    // Occurrences in books this repo does not carry are dropped: `.live` cannot
    // reference a page in a book with no registry entry, and keeping them would
    // multiply the file for nothing.
    const moments = []
    let occurrenceCount = 0
    for (const m of artifact.moments ?? []) {
        const occurrences = []
        const seen = new Set()
        for (const raw of m.occurrences ?? []) {
            const o = remap(raw)
            if (!o) continue
            if (!knownBooks.has(o.book)) continue
            if (seen.has(`${o.book}|${o.unitId}`)) continue
            seen.add(`${o.book}|${o.unitId}`)
            const folios = (o.folios ?? []).filter((f) => Number.isInteger(f))
            occurrences.push({ book: o.book, unitId: o.unitId, folios })
        }
        if (occurrences.length === 0) continue
        occurrenceCount += occurrences.length
        moments.push({
            id: m.id,
            display: { en: m.display?.en ?? m.id },
            kind: m.kind ?? null,
            aliases: Array.isArray(m.aliases) ? m.aliases : [],
            occurrences,
        })
    }
    if (moments.length === 0) {
        throw new Error(
            "moments.json produced zero moments for the books this repo carries — " +
                "that is a wrong artifact, not an empty one.",
        )
    }

    return {
        trimmed: {
            schemaVersion: artifact.schemaVersion,
            builtAt: artifact.builtAt ?? null,
            sources: sources
                .filter((x) => knownBooks.has(x.book) || MACHZOR_VOLUMES.has(x.book))
                .map((x) => ({ book: x.book, gitSha: x.gitSha, pinValue: x.pinValue ?? null })),
            moments,
        },
        occurrenceCount,
    }
}

/**
 * The six per-service feeds that ARE the one printed 2008 machzor.
 *
 * shireishabbat models them as six volumes because a davener davens from one
 * service; `.live` registers the printed object, which is one book. Neither is
 * wrong (R2-e), and the mapping between them is what lets a machzor row reach
 * a moment id at all — without it every occurrence in these six is dropped as
 * "a book this repo does not carry", and a Kol Nidre row has no identity the
 * cue log could ever be matched on.
 */
const MACHZOR_VOLUMES = new Set([
    "crc-erev-rh",
    "crc-rh-morning",
    "crc-kol-nidre",
    "crc-yk-morning",
    "crc-yizkor",
    "crc-neilah",
])
const MACHZOR_BOOK = "crc-machzor-2008"

/**
 * Fold a machzor volume's occurrence into the printed book.
 *
 * THE FOLIO IS REPLACED, NOT KEPT. The feed's `folios` are that service
 * booklet's own numbering — Kol Nidre's Bar'chu is folio 8 there and page 100
 * in the printed volume. Carrying the booklet number under the printed book's
 * slug would be a wrong page wearing a right name, so the page comes from
 * `crc-machzor-2008.json`, which took it from the same capture's
 * `printedFolio`. A unit the pagemap does not know is dropped rather than
 * guessed.
 */
function machzorRemapper(printedPageByUnitId) {
    return (o) => {
        if (!MACHZOR_VOLUMES.has(o.book)) return o
        const page = printedPageByUnitId.get(o.unitId)
        if (!Number.isInteger(page)) return null
        return { book: MACHZOR_BOOK, unitId: o.unitId, folios: [page] }
    }
}

function syncMoments(dist, dirName, check) {
    const path = join(dist, MOMENTS_FEED)
    if (!existsSync(path)) {
        // Absence is a normal state: the artifact is gitignored in shireishabbat
        // and only exists after a build there. Say so loudly and leave the
        // committed file alone rather than emptying it.
        console.log(
            `\nmoments: ${MOMENTS_FEED} is not in ${dirName}/ — skipped; ` +
                `src/data/books/moments.json left as it is.\n` +
                `         Run build/build-app.sh in shireishabbat to produce it.`,
        )
        return
    }
    const knownBooks = new Set(
        JSON.parse(readFileSync(REGISTRY, "utf8")).map((r) => r.slug),
    )
    const machzorPath = join(OUT_DIR, `${MACHZOR_BOOK}.json`)
    const printedPageByUnitId = new Map()
    if (existsSync(machzorPath)) {
        for (const e of JSON.parse(readFileSync(machzorPath, "utf8")).entries ?? []) {
            if (e.unitId && Number.isInteger(e.page)) printedPageByUnitId.set(e.unitId, e.page)
        }
    }
    const { trimmed, occurrenceCount } = trimMoments(
        JSON.parse(readFileSync(path, "utf8")),
        VOLUMES,
        knownBooks,
        machzorRemapper(printedPageByUnitId),
    )
    const next = JSON.stringify(trimmed, null, 4) + "\n"
    const prev = existsSync(MOMENTS_OUT) ? readFileSync(MOMENTS_OUT, "utf8") : null
    if (!check) writeFileSync(MOMENTS_OUT, next, "utf8")
    console.table([
        {
            artifact: "moments.json",
            moments: trimmed.moments.length,
            occurrences: occurrenceCount,
            books: trimmed.sources.length,
            drift: drift(prev, next),
        },
    ])
}

/**
 * Drift, ignoring the line endings git gave the working copy.
 *
 * This script writes LF. On a Windows checkout `core.autocrlf` hands the
 * working copy back with CRLF, so a byte compare calls a file DIFFERS that is
 * identical in every commit either version would produce. That false alarm now
 * reaches a reader — `emit-machzor-book.mjs` ends by printing this verdict —
 * so the comparison is on content, which is the thing anyone actually means.
 */
function drift(prev, next) {
    if (prev === null) return "new"
    return prev.replace(/\r\n/g, "\n") === next ? "none" : "DIFFERS"
}

function main() {
    const repo = repoPath()
    const dirName = feedDirName()
    const dist = join(repo, dirName)
    if (!existsSync(dist)) {
        console.error(`shireishabbat ${dirName}/ not found at ${dist}. Pass --repo <path>.`)
        process.exit(1)
    }
    const registry = JSON.parse(readFileSync(REGISTRY, "utf8"))
    const check = isCheck()
    const summary = []
    for (const vol of VOLUMES) {
        const feedPath = join(dist, vol.feed)
        if (!existsSync(feedPath)) {
            console.error(`missing feed: ${feedPath}`)
            process.exit(1)
        }
        const pages = recordedPages(registry, vol.slug)
        const { book, maxFolio } = trim(JSON.parse(readFileSync(feedPath, "utf8")), vol, pages)
        const outPath = join(OUT_DIR, `${vol.slug}.json`)
        const next = JSON.stringify(book, null, 4) + "\n"
        const prev = existsSync(outPath) ? readFileSync(outPath, "utf8") : null
        if (!check) writeFileSync(outPath, next, "utf8")
        summary.push({
            slug: book.slug,
            units: book.units.length,
            maxFolio,
            pages: book.pages,
            drift: drift(prev, next),
        })
    }
    console.table(summary)
    syncMoments(dist, dirName, check)
    if (check) console.log(`\n--check: nothing written. Source ${dirName}/, pins verified, pages asserted.`)
}

// Importable for tests without running the sync: `main()` touches the
// filesystem, `trimMoments` is pure.
const invokedDirectly =
    process.argv[1] &&
    import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())
if (invokedDirectly) main()
