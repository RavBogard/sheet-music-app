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
 *      pressed from. Each volume pins the `printing.gitSha` it may be
 *      regenerated from, and a mismatch is a hard refusal — a printed volume's
 *      pin is its press commit, never HEAD.
 *
 * Usage: npm run sync:books [-- --repo <path>] [--feed-dir <name>] [--check]
 *        --check writes nothing and reports drift instead.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join, resolve } from "node:path"

const DEFAULT_REPO = "C:/Users/dsbog/shireishabbat"
const OUT_DIR = resolve(process.cwd(), "src", "data", "books")
const REGISTRY = join(OUT_DIR, "registry.json")
const EXPECTED_SCHEMA_VERSION = 1

/** The pinned carrier. `dist/` is an unpinned local build — see the header. */
const DEFAULT_FEED_DIR = "dist-app"

const VOLUMES = [
    {
        slug: "shabbat-maariv",
        feed: "shabbat-maariv-feed.json",
        title: "Shirei Shabbat — Friday Night",
        pin: "6f61874-LICENSED",
    },
    {
        slug: "shabbat-shacharit",
        feed: "shabbat-shacharit-feed.json",
        title: "Shirei Shabbat — Shabbat Morning",
        pin: "6f61874-LICENSED",
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
    const sha = feed.printing?.gitSha ?? null
    if (sha !== vol.pin) {
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
            drift: prev === null ? "new" : prev === next ? "none" : "DIFFERS",
        })
    }
    console.table(summary)
    if (check) console.log(`\n--check: nothing written. Source ${dirName}/, pins verified, pages asserted.`)
}

main()
