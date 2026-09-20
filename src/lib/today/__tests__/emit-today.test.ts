import { describe, it, expect } from "vitest"
import {
    buildTodayDoc,
    chicagoDateString,
    chicagoStartOfDayMs,
    startsAtFor,
    type TodaySetlistInput,
} from "../build-today"
import { TODAY_CACHE_CONTROL, todayStoragePath } from "../types"

/**
 * B-W1 — `today.json`.
 *
 * The guard at the bottom of this file is the point of the whole suite: it
 * walks a built document for keys and content that must never leave this repo.
 * `today.json` is public, anonymous and CORS `*`, so a field added carelessly
 * to `TodayService` would publish it to the world on the next deploy. The
 * standing constraints it enforces: liturgical text never enters .live (ids,
 * names and pages only), and chart bytes never leave it.
 */

const NOW = new Date("2026-09-16T15:00:00.000Z") // Tue 16 Sep, 10:00 Chicago (CDT)

function setlist(over: Partial<TodaySetlistInput> = {}): TodaySetlistInput {
    return {
        id: "s1",
        name: "Shir Shabbat — September 18",
        templateType: "friday_night",
        eventDate: "2026-09-18T17:00:00.000Z", // Fri 18 Sep, noon Chicago
        book: "shabbat-maariv",
        rabbi: "Rabbi Daniel Bogard",
        version: 7,
        startFolio: 2,
        ...over,
    }
}

const SERVICES = {
    friday_night: { label: "Erev Shabbat", defaultStartLocal: "18:00" },
    shabbat_morning: { label: "Shabbat Morning", defaultStartLocal: "10:00" },
}

describe("buildTodayDoc — envelope", () => {
    it("emits exactly the envelope the reader parses", () => {
        const doc = buildTodayDoc({ setlists: [setlist()], services: SERVICES, now: NOW })
        expect(Object.keys(doc).sort()).toEqual([
            "generatedAt",
            "schemaVersion",
            "services",
        ])
        expect(doc.schemaVersion).toBe(1)
        expect(doc.generatedAt).toBe(NOW.toISOString())
        expect(Array.isArray(doc.services)).toBe(true)
    })

    it("omits absent fields rather than nulling them", () => {
        const doc = buildTodayDoc({
            setlists: [
                setlist({
                    templateType: undefined,
                    book: undefined,
                    rabbi: undefined,
                    startFolio: null,
                }),
            ],
            services: null,
            now: NOW,
        })
        const s = doc.services[0]
        expect(s).not.toHaveProperty("serviceType")
        expect(s).not.toHaveProperty("book")
        expect(s).not.toHaveProperty("rabbi")
        expect(s).not.toHaveProperty("startFolio")
        expect(s).not.toHaveProperty("startsAt")
        expect(s).not.toHaveProperty("stream")
        expect(s).not.toHaveProperty("publishedAt")
        expect(s).not.toHaveProperty("readerBook")
    })
})

describe("buildTodayDoc — selection", () => {
    /**
     * R2-f (Daniel, 2026-09-15): CRC does not use publish. A setlist is live
     * when it exists. That gate is exactly why `/today.json` answered 404
     * through Yom Kippur week, when all five machzor setlists carried
     * `publishedAt: null`.
     *
     * R-0919-audit-3 finished the job: the field is gone, and `today.json`
     * never carries it. The assertion stays because it is the regression
     * guard — if a publish concept ever comes back, this is where it shows.
     */
    it("reads every setlist, and never emits a publishedAt", () => {
        const doc = buildTodayDoc({
            setlists: [setlist({ id: "never-published" })],
            services: SERVICES,
            now: NOW,
        })
        expect(doc.services.map((s) => s.setlistId)).toEqual(["never-published"])
        expect(doc.services[0]).not.toHaveProperty("publishedAt")
    })

    it("excludes test traffic, which is the only exclusion left", () => {
        const doc = buildTodayDoc({
            setlists: [
                setlist({ id: "real" }),
                setlist({ id: "fixture", isTest: true }),
            ],
            services: SERVICES,
            now: NOW,
        })
        expect(doc.services.map((s) => s.setlistId)).toEqual(["real"])
    })

    it("keeps today through +7 days and drops what is outside", () => {
        const doc = buildTodayDoc({
            setlists: [
                // 21:30 Chicago on 15 Sep — yesterday evening, despite the
                // UTC date reading 16 Sep. The window is a Chicago day.
                setlist({ id: "yesterday", eventDate: "2026-09-16T02:30:00.000Z" }),
                setlist({ id: "today", eventDate: "2026-09-16T18:00:00.000Z" }),
                setlist({ id: "in-7d", eventDate: "2026-09-23T17:00:00.000Z" }),
                setlist({ id: "in-8d", eventDate: "2026-09-24T17:00:00.000Z" }),
            ],
            services: SERVICES,
            now: NOW,
        })
        expect(doc.services.map((s) => s.setlistId)).toEqual(["today", "in-7d"])
    })

    it("keeps a service already under way today", () => {
        // 08:00 Chicago on the emit day — earlier than `now`, still today.
        const doc = buildTodayDoc({
            setlists: [setlist({ id: "this-morning", eventDate: "2026-09-16T13:00:00.000Z" })],
            services: SERVICES,
            now: NOW,
        })
        expect(doc.services.map((s) => s.setlistId)).toEqual(["this-morning"])
    })

    it("drops rows with no parseable eventDate rather than guessing one", () => {
        const doc = buildTodayDoc({
            setlists: [
                setlist({ id: "undated", eventDate: undefined }),
                setlist({ id: "junk", eventDate: "not a date" }),
            ],
            services: SERVICES,
            now: NOW,
        })
        expect(doc.services).toEqual([])
    })

    it("orders soonest first", () => {
        const doc = buildTodayDoc({
            setlists: [
                setlist({
                    id: "saturday",
                    eventDate: "2026-09-19T15:00:00.000Z",
                    templateType: "shabbat_morning",
                }),
                setlist({ id: "friday", eventDate: "2026-09-18T17:00:00.000Z" }),
            ],
            services: SERVICES,
            now: NOW,
        })
        expect(doc.services.map((s) => s.setlistId)).toEqual(["friday", "saturday"])
    })
})

describe("buildTodayDoc — start times", () => {
    it("builds startsAt from the config's per-serviceType wall clock", () => {
        const doc = buildTodayDoc({ setlists: [setlist()], services: SERVICES, now: NOW })
        // 18:00 Chicago on 18 Sep is CDT (UTC-5) → 23:00Z.
        expect(doc.services[0].startsAt).toBe("2026-09-18T23:00:00.000Z")
        expect(doc.services[0].eventDate).toBe("2026-09-18")
    })

    it("lets the setlist's own startsAtLocal win", () => {
        const doc = buildTodayDoc({
            setlists: [setlist({ startsAtLocal: "19:30" })],
            services: SERVICES,
            now: NOW,
        })
        expect(doc.services[0].startsAt).toBe("2026-09-19T00:30:00.000Z")
    })

    it("omits startsAt when nothing supplies a time", () => {
        const doc = buildTodayDoc({ setlists: [setlist()], services: null, now: NOW })
        expect(doc.services[0]).not.toHaveProperty("startsAt")
    })

    it("respects DST — the same wall clock in December is an hour later in UTC", () => {
        const december = new Date("2026-12-15T15:00:00.000Z")
        const doc = buildTodayDoc({
            setlists: [
                setlist({
                    eventDate: "2026-12-18T18:00:00.000Z",
                }),
            ],
            services: SERVICES,
            now: december,
        })
        // 18:00 Chicago in December is CST (UTC-6) → 00:00Z the next day.
        expect(doc.services[0].startsAt).toBe("2026-12-19T00:00:00.000Z")
    })

    it("startsAtFor refuses a malformed time instead of inventing midnight", () => {
        expect(startsAtFor("2026-09-18", "25:00")).toBeNull()
        expect(startsAtFor("2026-09-18", "6pm")).toBeNull()
        expect(startsAtFor("2026-09-18", null)).toBeNull()
    })
})

/**
 * R2-e — the book-slug crosswalk. See `src/lib/today/reader-book.ts` for why
 * the two vocabularies differ and why that is not a bug in either of them.
 */
describe("buildTodayDoc — readerBook", () => {
    it("splits the one printed machzor by service, the way the reader shelves it", () => {
        const cases: Array<[string, string]> = [
            ["kol-nidre", "crc-kol-nidre"],
            ["kol-nidre-alt", "crc-kol-nidre"],
            ["yom-kippur-morning", "crc-yk-morning"],
            ["yizkor", "crc-yizkor"],
            ["neilah", "crc-neilah"],
        ]
        for (const [serviceType, expected] of cases) {
            const doc = buildTodayDoc({
                setlists: [
                    setlist({ book: "crc-machzor-2008", templateType: serviceType }),
                ],
                services: SERVICES,
                now: NOW,
            })
            expect(doc.services[0].book, serviceType).toBe("crc-machzor-2008")
            expect(doc.services[0].readerBook, serviceType).toBe(expected)
        }
    })

    it("sends the two Rosh Hashanah morning types to different shelves (R4-d)", () => {
        // Daniel, 2026-09-15: the regular RH morning service opens the legacy
        // machzor volume; the alternative service and Second Day — the setlists
        // typed `rosh-hashanah-morning` — open Shirei Tshuvah, the one released
        // volume. The PAGE is the legacy booklet's on both, which is why this
        // only shows up in `readerBook` and never in `book` or a folio.
        const cases: Array<[string, string]> = [
            ["rosh-hashanah-day", "crc-rh-morning"],
            ["rosh-hashanah-morning", "shirei-tshuvah"],
        ]
        for (const [templateType, expected] of cases) {
            const doc = buildTodayDoc({
                setlists: [setlist({ book: "crc-machzor-2008", templateType })],
                services: SERVICES,
                now: NOW,
            })
            expect(doc.services[0].book, templateType).toBe("crc-machzor-2008")
            expect(doc.services[0].readerBook, templateType).toBe(expected)
        }
    })

    it("maps the two legacy booklets whatever the service is", () => {
        const doc = buildTodayDoc({
            setlists: [
                setlist({ id: "f", book: "crc-friday" }),
                setlist({ id: "s", book: "crc-saturday", templateType: "bnei_mitzvah_saturday" }),
            ],
            services: SERVICES,
            now: NOW,
        })
        const byId = Object.fromEntries(
            doc.services.map((x) => [x.setlistId, x.readerBook]),
        )
        expect(byId).toEqual({
            f: "legacy-shabbat-evening",
            s: "legacy-shabbat-morning",
        })
    })

    it("NEVER names a draft volume, which is the easy wrong answer", () => {
        // `shabbat-maariv` and `shabbat-shacharit` are the only two slugs both
        // vocabularies already share, and Ruling 8 forbids surfacing either.
        for (const book of ["shabbat-maariv", "shabbat-shacharit"]) {
            const doc = buildTodayDoc({
                setlists: [setlist({ book })],
                services: SERVICES,
                now: NOW,
            })
            expect(doc.services[0].book, book).toBe(book)
            expect(doc.services[0], book).not.toHaveProperty("readerBook")
        }
    })

    it("says nothing rather than guessing, for a machzor service it does not know", () => {
        const doc = buildTodayDoc({
            setlists: [
                setlist({ book: "crc-machzor-2008", templateType: "friday_night" }),
                setlist({ id: "b", book: "crc-machzor-2008", templateType: undefined }),
            ],
            services: SERVICES,
            now: NOW,
        })
        for (const s of doc.services) expect(s).not.toHaveProperty("readerBook")
    })
})

describe("buildTodayDoc — stream", () => {
    it("defaults stream.startsAt to five minutes before the service", () => {
        const doc = buildTodayDoc({
            setlists: [setlist()],
            services: SERVICES,
            stream: { url: "https://example.org/live" },
            now: NOW,
        })
        expect(doc.services[0].stream).toEqual({
            url: "https://example.org/live",
            startsAt: "2026-09-18T22:55:00.000Z",
        })
    })

    it("honours a configured leadMinutes", () => {
        const doc = buildTodayDoc({
            setlists: [setlist()],
            services: SERVICES,
            stream: { url: "https://example.org/live", leadMinutes: 30 },
            now: NOW,
        })
        expect(doc.services[0].stream?.startsAt).toBe("2026-09-18T22:30:00.000Z")
    })

    it("emits the url with no startsAt when the service has no start time", () => {
        const doc = buildTodayDoc({
            setlists: [setlist()],
            services: null,
            stream: { url: "https://example.org/live" },
            now: NOW,
        })
        expect(doc.services[0].stream).toEqual({ url: "https://example.org/live" })
    })
})

describe("Chicago day arithmetic", () => {
    it("names the calendar day in Chicago, not UTC", () => {
        // 02:30Z on 19 Sep is still the evening of 18 Sep in Chicago.
        expect(chicagoDateString(Date.parse("2026-09-19T02:30:00.000Z"))).toBe("2026-09-18")
    })

    it("starts the day at Chicago midnight", () => {
        const ms = chicagoStartOfDayMs(Date.parse("2026-09-18T20:00:00.000Z"))
        expect(new Date(ms).toISOString()).toBe("2026-09-18T05:00:00.000Z")
    })
})

describe("storage contract", () => {
    it("keys the path by org so two tenants never share a file", () => {
        expect(todayStoragePath("crc")).toBe("public/today/crc.json")
        expect(todayStoragePath("tbi")).toBe("public/today/tbi.json")
    })

    it("pins the cache posture shared by the object and the route", () => {
        expect(TODAY_CACHE_CONTROL).toBe(
            "public, max-age=60, s-maxage=60, stale-while-revalidate=600",
        )
    })
})

/**
 * THE GUARD. Everything above describes what the document should contain; this
 * describes what it must never contain, by walking the built object rather than
 * by inspecting the type. A field added to `TodayService` that happens to carry
 * a chart id, a note, or a line of Hebrew fails here before it is deployed.
 */
describe("forbidden-key guard", () => {
    const FORBIDDEN_KEYS = [
        "tracks",
        "fileId",
        "fileName",
        "notes",
        "songId",
        "chartUrl",
        "audioFileId",
        "description",
        "honors",
        "publishedSnapshot",
        "musicians",
    ]
    const HEBREW = /[֐-׿]/

    /** Every key path and every string value in the document. */
    function walk(node: unknown, path: string, keys: string[], strings: Array<[string, string]>) {
        if (Array.isArray(node)) {
            node.forEach((v, i) => walk(v, `${path}[${i}]`, keys, strings))
            return
        }
        if (node && typeof node === "object") {
            for (const [k, v] of Object.entries(node)) {
                keys.push(k)
                walk(v, `${path}.${k}`, keys, strings)
            }
            return
        }
        if (typeof node === "string") strings.push([path, node])
    }

    /**
     * A document built from a setlist carrying EVERY dangerous field, to prove
     * the builder drops them rather than relying on the caller not to pass them.
     */
    const doc = buildTodayDoc({
        setlists: [
            {
                ...setlist(),
                // Deliberate contamination — none of this may survive.
                ...({
                    tracks: [{ fileId: "upload-abc", title: "Modeh Ani", notes: "capo 3" }],
                    fileId: "upload-abc",
                    fileName: "Modeh Ani (Cm).pdf",
                    notes: "Bar Mitzvah — family requests",
                    songId: "song-1",
                    musicians: [{ name: "Randy", instrument: "guitar" }],
                    publishedSnapshot: { tracks: [] },
                    description: "מודה אני",
                } as Partial<TodaySetlistInput>),
            },
        ],
        services: SERVICES,
        stream: { url: "https://example.org/live" },
        now: NOW,
    })

    it("has services to inspect (the guard would pass vacuously otherwise)", () => {
        expect(doc.services.length).toBe(1)
    })

    it("carries no forbidden key at any depth", () => {
        const keys: string[] = []
        const strings: Array<[string, string]> = []
        walk(doc, "$", keys, strings)
        const found = FORBIDDEN_KEYS.filter((f) => keys.includes(f))
        expect(found, "today.json is public and CORS *").toEqual([])
    })

    it("carries no Hebrew in any string — liturgical text never enters .live", () => {
        const keys: string[] = []
        const strings: Array<[string, string]> = []
        walk(doc, "$", keys, strings)
        const hebrew = strings.filter(([, v]) => HEBREW.test(v))
        expect(hebrew).toEqual([])
    })

    it("exposes only the agreed key set on a service", () => {
        // An allow-list, not a deny-list: a new field must be added here
        // deliberately, which is the moment to ask whether it may be public.
        const allowed = [
            "setlistId",
            "name",
            "serviceType",
            "eventDate",
            "startsAt",
            "book",
            "startFolio",
            "rabbi",
            "stream",
            "publishedAt",
            "readerBook",
            "version",
        ]
        for (const s of doc.services) {
            for (const k of Object.keys(s)) expect(allowed).toContain(k)
        }
    })
})
