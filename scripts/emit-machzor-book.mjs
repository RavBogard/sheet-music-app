#!/usr/bin/env node
/**
 * Regenerate `src/data/books/crc-machzor-2008.json` — the whole printed volume,
 * service-scoped (R4-c as reversed by Daniel, 2026-09-15).
 *
 * WHY THIS EXISTS. The 2026-09-11 order that first registered this book mapped
 * Rosh Hashanah MORNING only (pp.38–92) and deferred the rest, because across
 * the whole volume 49 prayer names repeat at different folios — Bar'chu alone
 * prints at 9, 45, 100 and 136 — and a whole-book pagemap keyed on bare names
 * would resolve one name to several pages. That is the silent-wrong-page
 * failure the floor guard was written about.
 *
 * The missing piece was never the data. It was the SCOPE. A setlist always
 * knows which service it is, and within one service every name is unique. So
 * each entry now carries the service it serves, the lookup narrows to the
 * service before it ranks anything, and the ambiguity that deferred five
 * services simply does not arise.
 *
 * NOTHING IS TYPED BY HAND. Every page comes from a capture: the per-service
 * feeds in shireishabbat's `dist-app/` carry `printedFolio` on every unit —
 * the page in the PRINTED 2008 machzor, as distinct from `folios`, which is
 * that service booklet's own numbering. 209 units across six services tile
 * pages 1–215.
 *
 * THE CURATED ALIASES SURVIVE. Daniel checked the 57 Rosh Hashanah morning
 * entries against the printed book in September; the feed's own unit names are
 * machine-cased ("Blessing Before", "Reading 1", "Service"). So a curated entry
 * keeps its name and aliases and merely GAINS its unit id and service; the feed
 * supplies names only where there was no curated entry to keep.
 *
 * Usage: node scripts/emit-machzor-book.mjs [--repo <path>] [--check]
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs"
import { join, resolve } from "node:path"

const DEFAULT_REPO = "C:/Users/dsbog/shireishabbat"
const FEED_DIR = "dist-app"
const OUT = resolve(process.cwd(), "src", "data", "books", "crc-machzor-2008.json")
const REGISTRY = resolve(process.cwd(), "src", "data", "books", "registry.json")

/**
 * The six per-service feeds of the printed volume, in printed order.
 *
 * `legacy-slichot` is deliberately absent: its eight units carry no
 * `printedFolio` at all, because Selichot is a separate handout and not part of
 * this bound volume. Inventing pages for it is exactly what this script exists
 * not to do.
 */
const SERVICES = [
    { service: "crc-erev-rh", feed: "crc-erev-rh-feed.json" },
    { service: "crc-rh-morning", feed: "crc-rh-morning-feed.json" },
    { service: "crc-kol-nidre", feed: "crc-kol-nidre-feed.json" },
    { service: "crc-yk-morning", feed: "crc-yk-morning-feed.json" },
    { service: "crc-yizkor", feed: "crc-yizkor-feed.json" },
    { service: "crc-neilah", feed: "crc-neilah-feed.json" },
]

function flag(name) {
    const i = process.argv.indexOf(name)
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : null
}

/** Fold to the same shape `lookupBookPage` folds to, so a collision here is a collision there. */
function norm(s) {
    return String(s ?? "")
        .toLowerCase()
        .replace(/['\u2019`"]/g, "")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ")
}

/** `torah.blessing-before-the-torah@crc-rh-morning` -> `blessing before the torah`. */
function unitWords(id) {
    const stem = String(id).split("@")[0]
    const last = stem.includes(".") ? stem.slice(stem.indexOf(".") + 1) : stem
    return last.replace(/-/g, " ")
}

function titleCase(s) {
    return s.replace(/\b[a-z]/g, (c) => c.toUpperCase())
}

/** Every folded spelling a curated entry answers to. */
function curatedKeys(c) {
    return [c.name, ...(c.aliases ?? [])].map(norm).filter(Boolean)
}

/** Every folded spelling a feed unit offers. */
function unitKeys(u) {
    return [u.shortName, u.name, unitWords(u.id)].map(norm).filter(Boolean)
}

/**
 * Pair the curated entries on a page with that page's feed units.
 *
 * Page equality alone is not enough — three moments share p.39 — and the feed's
 * machine-cased names are close to Daniel's but rarely identical: he wrote
 * "Mi Shebeirach" where the feed has "Mi Shebeirach Healing", "Eitz Chayim"
 * where the feed has "Torah Eitz Chayim". So the pairing runs in three rounds
 * of decreasing confidence and stops rather than guessing:
 *
 *   1. an exact folded name or alias in common;
 *   2. one folded name containing the other (four characters or more, so
 *      "Avot" cannot swallow a page);
 *   3. one curated entry and one unit left on the page, which can only be each
 *      other.
 *
 * A curated entry still unpaired is not dropped. It is a SECOND NAME Daniel
 * gave to something the feed models as one unit — p.43 is "Psukei d'Zimrah" to
 * the feed and also "Kol HaN'shamah" to him — so its spellings fold into the
 * page's entry as aliases, and only an unpaired entry on a page with no unit
 * at all is a refusal.
 */
function pairPage(curated, units) {
    const pairs = new Map()
    const freeC = [...curated]
    const freeU = [...units]
    const take = (c, u) => {
        pairs.set(u.id, c)
        freeC.splice(freeC.indexOf(c), 1)
        freeU.splice(freeU.indexOf(u), 1)
    }

    for (const round of ["exact", "contains"]) {
        let moved = true
        while (moved) {
            moved = false
            outer: for (const c of [...freeC]) {
                const ck = curatedKeys(c)
                for (const u of [...freeU]) {
                    const uk = unitKeys(u)
                    const hit =
                        round === "exact"
                            ? ck.some((a) => uk.includes(a))
                            : ck.some((a) =>
                                  uk.some(
                                      (b) =>
                                          a.length >= 4 &&
                                          b.length >= 4 &&
                                          (a.includes(b) || b.includes(a)),
                                  ),
                              )
                    if (hit) {
                        take(c, u)
                        moved = true
                        break outer
                    }
                }
            }
        }
    }
    if (freeC.length === 1 && freeU.length === 1) take(freeC[0], freeU[0])

    return { pairs, leftover: freeC }
}

/**
 * Spelling variants the congregation actually types.
 *
 * `Haftorah` for `Haftarah` is not a nickname, it is the other standard
 * transliteration, and David types it. Without it "Blessing Before Haftorah"
 * scored closer to "Blessing Before The Torah" — five pages and one aliyah
 * away — than to the haftarah blessing it names. That is the whole
 * silent-wrong-page failure in one row, so the variant is data, not a matcher
 * special case.
 */
const SPELLING_VARIANTS = [[/haftarah/gi, "Haftorah"]]

/**
 * DANIEL'S RULINGS, applied on top of the capture.
 *
 * This is the one place a page or a name does not come straight from the feed,
 * and it exists because the capture can be wrong about the printed book and
 * Daniel can read the printed book. A ruling is not a hand-typed page: it is a
 * decision, recorded with its id, that the generator applies deterministically
 * so a regeneration never loses it.
 *
 * EVERY ENTRY HERE IS MEANT TO DIE. When shireishabbat corrects the capture,
 * the override stops changing anything and the script says so on stdout —
 * "matches the capture, delete it" — which is the signal to remove the line.
 * That is why an override that agrees with the feed is reported rather than
 * silently passing.
 */
const RULINGS = {
    /**
     * R5-a — Un'taneh Tokef is p.147. The capture files p.148's unit under the
     * name: 148 is B'rosh Hashanah, which the feed does not yet model as its
     * own unit. Splitting it is shireishabbat's half of round 5; until then the
     * page is the part .live can be right about, and David's typed 147 stands.
     */
    page: [
        {
            unitId: "amidah.untaneh-tokef@crc-yk-morning",
            page: 147,
            ruling: "R5-a",
        },
    ],
    /**
     * R5-d — the volume prints Shehecheyanu twice in Kol Nidre, at 97 and 99,
     * and the feed gives both units the same `shortName`. Daniel ruled the bare
     * name to the first. The loser keeps its own full feed name, so the name
     * resolves to one page instead of stopping as ambiguous.
     */
    name: [
        {
            service: "crc-kol-nidre",
            name: "Shehecheyanu",
            unitId: "erev-yk.erev-maariv-shehecheyanu@crc-kol-nidre",
            ruling: "R5-d",
        },
    ],
}

/**
 * A leading qualifier the feed adds and nobody says out loud.
 *
 * Inside the Neilah booklet every unit is called "Neila something", because
 * the feed's names have to be unique across the whole volume. Scoped to one
 * service that prefix is pure noise, and it is what kept "Chatzi Kaddish" at
 * 62 — plausible, unbindable — against a page named "Neila Chatzi Kaddish".
 * A word that begins two or more of a service's names is treated as such a
 * qualifier and the bare remainder is offered as well; anything it collides
 * with is pruned later, so a qualifier that turns out to matter costs nothing.
 */
function qualifierWords(units) {
    const counts = new Map()
    for (const u of units) {
        for (const n of [u.shortName, u.name].filter(Boolean)) {
            const first = norm(n).split(" ")[0]
            if (!first || first.length < 4) continue
            counts.set(first, (counts.get(first) ?? 0) + 1)
        }
    }
    return new Set([...counts.entries()].filter(([, c]) => c >= 2).map(([w]) => w))
}

function main() {
    const repo = flag("--repo") ?? DEFAULT_REPO
    const check = process.argv.includes("--check")
    const dist = join(repo, FEED_DIR)
    if (!existsSync(dist)) {
        console.error(`shireishabbat ${FEED_DIR}/ not found at ${dist}. Pass --repo <path>.`)
        process.exit(1)
    }

    const prev = JSON.parse(readFileSync(OUT, "utf8"))
    const registry = JSON.parse(readFileSync(REGISTRY, "utf8"))
    const recorded = registry.find((r) => r.slug === "crc-machzor-2008")
    if (!recorded || !Number.isInteger(recorded.pages)) {
        throw new Error("registry.json records no page count for crc-machzor-2008.")
    }

    const curatedByPage = new Map()
    for (const e of prev.entries ?? []) {
        if (!curatedByPage.has(e.page)) curatedByPage.set(e.page, [])
        curatedByPage.get(e.page).push(e)
    }

    const entries = []
    const report = []
    const folded = []
    const orphaned = []
    const ruledApplied = []
    const ruledMoot = []
    let maxFolio = 0

    for (const { service, feed } of SERVICES) {
        const path = join(dist, feed)
        if (!existsSync(path)) {
            console.error(`missing feed: ${path}`)
            process.exit(1)
        }
        const data = JSON.parse(readFileSync(path, "utf8"))
        if (data.volume !== service) {
            throw new Error(`${feed}: volume is '${data.volume}', expected '${service}'.`)
        }
        let carried = 0
        let fromFeed = 0
        const units = data.units ?? []
        for (const u of units) {
            const ruled = RULINGS.page.find((r) => r.unitId === u.id)
            if (ruled) {
                if (u.printedFolio === ruled.page) {
                    ruledMoot.push(`${ruled.ruling} ${u.id} p.${ruled.page}`)
                } else {
                    ruledApplied.push(
                        `${ruled.ruling} ${u.id}: capture ${u.printedFolio} -> ruled ${ruled.page}`,
                    )
                    u.printedFolio = ruled.page
                }
            }
            if (!Number.isInteger(u.printedFolio)) {
                throw new Error(
                    `${service}: unit '${u.id}' carries no printedFolio. Every page must come ` +
                        `from a capture; there is nothing honest to write for this unit.`,
                )
            }
            if (u.printedFolio > maxFolio) maxFolio = u.printedFolio
        }

        const byPage = new Map()
        for (const u of units) {
            if (!byPage.has(u.printedFolio)) byPage.set(u.printedFolio, [])
            byPage.get(u.printedFolio).push(u)
        }

        const qualifiers = qualifierWords(units)
        const pairedByUnit = new Map()
        const extraByPage = new Map()
        for (const [page, pageUnits] of byPage) {
            const { pairs, leftover } = pairPage(curatedByPage.get(page) ?? [], pageUnits)
            for (const [id, c] of pairs) pairedByUnit.set(id, c)
            if (leftover.length) extraByPage.set(page, leftover)
        }

        for (const u of units) {
            const page = u.printedFolio
            const feedNames = [u.shortName, u.name, titleCase(unitWords(u.id))].filter(
                (n) => typeof n === "string" && n.trim(),
            )
            // The bare name, once the service's own qualifier is dropped.
            // Held apart from the feed's real names: a derived alias is a
            // guess about what someone will type, and the pass below throws
            // out the ones that guess at another moment.
            const derived = []
            for (const n of feedNames) {
                const words = n.split(/\s+/)
                if (words.length < 2) continue
                if (!qualifiers.has(norm(words[0]))) continue
                const rest = words.slice(1).join(" ")
                if (norm(rest).length >= 5) derived.push(rest)
            }
            const curated = pairedByUnit.get(u.id)
            let name
            let aliases
            if (curated) {
                carried += 1
                name = curated.name
                aliases = [...(curated.aliases ?? []), ...feedNames]
            } else {
                fromFeed += 1
                name = feedNames[0]
                aliases = feedNames.slice(1)
            }
            // A second name Daniel gave to this page folds in as aliases, once,
            // onto the page's first unit.
            const extra = extraByPage.get(page)
            if (extra && byPage.get(page)[0].id === u.id) {
                for (const e of extra) {
                    aliases.push(e.name, ...(e.aliases ?? []))
                    folded.push(`p.${page} '${e.name}' -> '${name}'`)
                }
                extraByPage.delete(page)
            }
            // Standard transliteration variants of whatever we ended up with.
            for (const a of [name, ...aliases]) {
                for (const [pattern, to] of SPELLING_VARIANTS) {
                    if (pattern.test(a)) aliases.push(a.replace(pattern, to))
                    pattern.lastIndex = 0
                }
            }
            const seen = new Set([norm(name)])
            const dedup = []
            for (const a of aliases) {
                const k = norm(a)
                if (!k || seen.has(k)) continue
                seen.add(k)
                dedup.push(a)
            }
            entries.push({ name, aliases: dedup, page, service, unitId: u.id, derived })
        }
        // A derived alias that names — or is named by — a DIFFERENT moment in
        // this service is thrown away. Stripping "Haftarah" from "Haftarah
        // Reading" leaves "Reading", which is inside "Torah Reading Day 1" and
        // promptly sent a Torah reading to the haftarah's page. The collision
        // pruner below cannot catch that one: the two strings are not equal,
        // only fatally similar.
        const mine = entries.filter((e) => e.service === service)
        const otherNames = new Map(mine.map((e) => [e, mine.filter((o) => o !== e).map((o) => norm(o.name))]))
        for (const e of mine) {
            const others = otherNames.get(e) ?? []
            const keep = e.derived.filter((d) => {
                const k = norm(d)
                return !others.some((o) => o.includes(k) || k.includes(o))
            })
            const seen = new Set([norm(e.name), ...e.aliases.map(norm)])
            for (const d of keep) {
                if (seen.has(norm(d))) continue
                seen.add(norm(d))
                e.aliases.push(d)
            }
            delete e.derived
        }

        // A name Daniel ruled to one of two units that share it. The owner takes
        // the bare name; whoever else is wearing it in this service falls back
        // to its own full feed name, which the feed keeps unique. Without this
        // the collision pass below would leave both — correctly, but the
        // lookup then stops as ambiguous on a name that has an answer.
        for (const r of RULINGS.name.filter((r) => r.service === service)) {
            const owner = mine.find((e) => e.unitId === r.unitId)
            if (!owner) throw new Error(`${r.ruling}: no unit '${r.unitId}' in ${service}.`)
            const k = norm(r.name)
            for (const e of mine) {
                if (e === owner || norm(e.name) !== k) continue
                const fallback = e.aliases.find((a) => norm(a) !== k)
                if (!fallback) {
                    throw new Error(
                        `${r.ruling}: '${e.unitId}' has no other name to fall back to.`,
                    )
                }
                e.aliases = [e.name, ...e.aliases].filter((a) => a !== fallback && norm(a) !== k)
                e.name = fallback
                ruledApplied.push(`${r.ruling} ${service}: '${r.name}' -> p.${owner.page}`)
            }
            if (norm(owner.name) !== k) {
                owner.aliases = [owner.name, ...owner.aliases].filter((a) => norm(a) !== k)
                owner.name = r.name
            }
        }

        for (const [page, left] of extraByPage) {
            for (const e of left) orphaned.push(`p.${page} ${e.name}`)
        }
        report.push({ service, units: units.length, curated: carried, fromFeed })
    }

    // A curated entry no page could take would be a page Daniel verified and
    // this script silently dropped. Refuse rather than lose it.
    if (orphaned.length) {
        throw new Error(
            `${orphaned.length} curated entries matched no feed page and would be dropped: ` +
                `${orphaned.join("; ")}. Resolve by hand — a verified page is never discarded ` +
                `by a regeneration.`,
        )
    }

    // The page-keyed pairing above cannot see an entry whose page no longer has
    // any unit on it — a ruling that MOVES a unit empties its old page, and the
    // curated entry sitting there would vanish without a word. Identity does
    // not move, so check identity: every unit the previous file knew about is
    // still in this one.
    const nowByUnit = new Set(entries.map((e) => e.unitId))
    const lost = (prev.entries ?? [])
        .filter((e) => e.unitId && !nowByUnit.has(e.unitId))
        .map((e) => `${e.unitId} ('${e.name}' p.${e.page})`)
    if (lost.length) {
        throw new Error(
            `${lost.length} units in the previous book are absent from this one: ${lost.join("; ")}.`,
        )
    }

    if (maxFolio > recorded.pages) {
        throw new Error(
            `last unit is on folio ${maxFolio}, past the recorded ${recorded.pages} printed pages.`,
        )
    }

    // Within one service a name must resolve to one page, or the scope has not
    // bought what it was introduced to buy.
    //
    // An ALIAS that lands on two pages is dropped: most are the unit-id stem
    // this script derived, and "Niggun" standing for both the opening and the
    // concluding niggun is noise this script created, not a fact about the
    // book. A NAME on two pages is left alone and reported — the volume really
    // does print Shehecheyanu twice in Kol Nidre, and the lookup's own answer
    // to that (two exact hits, different folios, confidence 'low') is the
    // correct one: stop and ask, never guess a page.
    const collisions = []
    let prunedAliases = 0
    for (const { service } of SERVICES) {
        const mine = entries.filter((x) => x.service === service)
        const pagesFor = new Map()
        for (const e of mine) {
            for (const k of [norm(e.name), ...e.aliases.map(norm)]) {
                if (!k) continue
                if (!pagesFor.has(k)) pagesFor.set(k, new Set())
                pagesFor.get(k).add(e.page)
            }
        }
        const ambiguous = new Set(
            [...pagesFor.entries()].filter(([, p]) => p.size > 1).map(([k]) => k),
        )
        for (const e of mine) {
            const before = e.aliases.length
            e.aliases = e.aliases.filter((a) => !ambiguous.has(norm(a)))
            prunedAliases += before - e.aliases.length
        }
        for (const k of ambiguous) {
            const onName = mine.filter((e) => norm(e.name) === k)
            if (onName.length > 1) {
                collisions.push(
                    `${service}: name '${k}' at ${onName.map((e) => e.page).join(" and ")}`,
                )
            }
        }
    }

    entries.sort((a, b) => a.page - b.page || a.name.localeCompare(b.name))
    const next =
        JSON.stringify(
            {
                slug: prev.slug,
                title: prev.title,
                tier: prev.tier,
                pages: recorded.pages,
                entries,
            },
            null,
            4,
        ) + "\n"

    const before = readFileSync(OUT, "utf8")
    if (!check) writeFileSync(OUT, next, "utf8")
    console.table(report)
    console.log(
        `aliases pruned ${prunedAliases}, entries ${entries.length} (was ${prev.entries.length}), pages ${recorded.pages}, ` +
            `maxFolio ${maxFolio}, drift ${before === next ? "none" : "DIFFERS"}`,
    )
    if (ruledApplied.length) {
        console.log(`\nRULINGS APPLIED (${ruledApplied.length}):`)
        for (const r of ruledApplied) console.log("  " + r)
    }
    if (ruledMoot.length) {
        console.log(
            `\nRULINGS THAT NOW MATCH THE CAPTURE (${ruledMoot.length}) — delete them from RULINGS:`,
        )
        for (const r of ruledMoot) console.log("  " + r)
    }
    if (folded.length) {
        console.log(`\nCURATED SECOND NAMES FOLDED IN AS ALIASES (${folded.length}):`)
        for (const f of folded) console.log("  " + f)
    }
    if (collisions.length) {
        console.log(`\nWITHIN-SERVICE NAME COLLISIONS (${collisions.length}):`)
        for (const c of collisions) console.log("  " + c)
    } else {
        console.log("no within-service name collisions")
    }
    if (check) console.log("\n--check: nothing written.")
}

main()
