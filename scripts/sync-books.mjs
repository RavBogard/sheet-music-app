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
 * Usage: npm run sync:books [-- --repo <path-to-shireishabbat>]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join, resolve } from "node:path"

const DEFAULT_REPO = "C:\\Users\\dsbog\\shireishabbat"
const OUT_DIR = resolve(process.cwd(), "src", "data", "books")
const EXPECTED_SCHEMA_VERSION = 1

const VOLUMES = [
    { slug: "shabbat-maariv", feed: "shabbat-maariv-feed.json", title: "Shirei Shabbat — Friday Night" },
    { slug: "shabbat-shacharit", feed: "shabbat-shacharit-feed.json", title: "Shirei Shabbat — Shabbat Morning" },
    { slug: "shirei-tshuvah", feed: "shirei-tshuvah-feed.json", title: "Shirei Tshuvah — Rosh Hashanah" },
]

function repoPath() {
    const i = process.argv.indexOf("--repo")
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : DEFAULT_REPO
}

function trim(feed, vol) {
    if (feed.schemaVersion !== EXPECTED_SCHEMA_VERSION) {
        throw new Error(
            `${vol.slug}: feed schemaVersion ${feed.schemaVersion} != expected ${EXPECTED_SCHEMA_VERSION}. ` +
                `The feed contract changed — review build/schema/feed.schema.json before re-running.`,
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
    return { slug: vol.slug, title: vol.title, tier: "feed", pages: maxFolio, units }
}

function main() {
    const repo = repoPath()
    const dist = join(repo, "dist")
    if (!existsSync(dist)) {
        console.error(`shireishabbat dist/ not found at ${dist}. Pass --repo <path>.`)
        process.exit(1)
    }
    const summary = []
    for (const vol of VOLUMES) {
        const feedPath = join(dist, vol.feed)
        if (!existsSync(feedPath)) {
            console.error(`missing feed: ${feedPath}`)
            process.exit(1)
        }
        const book = trim(JSON.parse(readFileSync(feedPath, "utf8")), vol)
        writeFileSync(join(OUT_DIR, `${vol.slug}.json`), JSON.stringify(book, null, 4) + "\n", "utf8")
        summary.push({ slug: book.slug, units: book.units.length, pages: book.pages })
    }
    console.table(summary)
    console.log("\nUpdate src/data/books/registry.json `pages` if any value changed above.")
}

main()
