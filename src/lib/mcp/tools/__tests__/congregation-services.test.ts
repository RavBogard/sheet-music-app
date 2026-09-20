import { describe, it, expect } from "vitest"
import { readServicesFromConfig, readStreamFromConfig } from "@/lib/today/config"
import { buildTodayDoc } from "@/lib/today/build-today"

/**
 * B-W2 — the two congregation-config values `today.json` reads.
 *
 * The write tool itself (`update_congregation_services`) is admin-gated and
 * Firestore-backed, so its commit path is emulator work; what is worth pinning
 * here is the READER, because three surfaces share it — the emitter,
 * `get_congregation_context`, and the write tool's own before/after diff. If
 * those three ever disagreed about what the doc says, the diff Daniel confirms
 * would not be the diff that ships.
 */

describe("readServicesFromConfig", () => {
    it("reads a well-formed map", () => {
        expect(
            readServicesFromConfig({
                services: {
                    friday_night: { label: "Erev Shabbat", defaultStartLocal: "18:00" },
                },
            }),
        ).toEqual({
            friday_night: { label: "Erev Shabbat", defaultStartLocal: "18:00" },
        })
    })

    it("falls back to the key when a row has no label", () => {
        const out = readServicesFromConfig({
            services: { shabbat_morning: { defaultStartLocal: "10:00" } },
        })
        expect(out?.shabbat_morning.label).toBe("shabbat_morning")
    })

    it("skips a row with no start time rather than throwing", () => {
        // The congregation doc is hand-edited config, not a validated write
        // path. A half-typed row must degrade to "no start time" — which the
        // emitter handles — not blow up mid-publish.
        const out = readServicesFromConfig({
            services: {
                good: { defaultStartLocal: "18:00" },
                bad: { label: "half-typed" },
                alsoBad: "not an object",
            },
        })
        expect(Object.keys(out ?? {})).toEqual(["good"])
    })

    it("returns null for absent, empty, or wrongly-shaped config", () => {
        expect(readServicesFromConfig(null)).toBeNull()
        expect(readServicesFromConfig({})).toBeNull()
        expect(readServicesFromConfig({ services: {} })).toBeNull()
        expect(readServicesFromConfig({ services: [] })).toBeNull()
        expect(readServicesFromConfig({ services: "nope" })).toBeNull()
    })
})

describe("readStreamFromConfig", () => {
    it("reads url and leadMinutes", () => {
        expect(
            readStreamFromConfig({
                stream: { url: "https://example.org/live", leadMinutes: 15 },
            }),
        ).toEqual({ url: "https://example.org/live", leadMinutes: 15 })
    })

    it("omits leadMinutes when absent or nonsense, leaving the default to apply", () => {
        expect(readStreamFromConfig({ stream: { url: "https://x.org/l" } })).toEqual({
            url: "https://x.org/l",
        })
        expect(
            readStreamFromConfig({ stream: { url: "https://x.org/l", leadMinutes: -1 } }),
        ).toEqual({ url: "https://x.org/l" })
    })

    it("returns null when there is no usable url", () => {
        expect(readStreamFromConfig(null)).toBeNull()
        expect(readStreamFromConfig({ stream: {} })).toBeNull()
        expect(readStreamFromConfig({ stream: { url: "   " } })).toBeNull()
    })
})

describe("config → today.json", () => {
    /** The whole point of the config: it is what turns a date into a time. */
    it("an unconfigured serviceType emits no start time at all", () => {
        const doc = buildTodayDoc({
            setlists: [
                {
                    id: "s1",
                    name: "Erev Shabbat",
                    templateType: "friday_night",
                    eventDate: "2026-09-18T17:00:00.000Z",
                    version: 1,
                },
            ],
            services: readServicesFromConfig({ services: { shabbat_morning: { defaultStartLocal: "10:00" } } }),
            now: new Date("2026-09-16T15:00:00.000Z"),
        })
        expect(doc.services[0]).not.toHaveProperty("startsAt")
    })

    it("configuring that serviceType gives it one", () => {
        const doc = buildTodayDoc({
            setlists: [
                {
                    id: "s1",
                    name: "Erev Shabbat",
                    templateType: "friday_night",
                    eventDate: "2026-09-18T17:00:00.000Z",
                    version: 1,
                },
            ],
            services: readServicesFromConfig({
                services: { friday_night: { defaultStartLocal: "18:00" } },
            }),
            now: new Date("2026-09-16T15:00:00.000Z"),
        })
        expect(doc.services[0].startsAt).toBe("2026-09-18T23:00:00.000Z")
    })
})
