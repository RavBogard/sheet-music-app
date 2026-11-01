import { describe, it, expect, vi } from "vitest"

/**
 * Multi-tenant phase 1 GOLDEN — today's time-zone behaviour for crc and
 * brotherslazaroff (both America/Chicago). Written against the code BEFORE the
 * per-tenant zone change and never edited to make it pass afterwards.
 *
 * The instants straddle Chicago midnight (03:30Z on 6 June = 22:30 CDT on
 * 5 June) so a zone change is visible. Every call passes the org as a trailing
 * argument; the pre-change code ignores it, the post-change code resolves it.
 */

vi.mock("@/lib/firebase-admin", () => ({ initAdmin: () => true, getFirestore: () => ({}) }))
vi.mock("@/lib/pdf/service-sheet-pdf", () => ({ renderServiceSheetPdf: vi.fn() }))

import { parseEventDate, chicagoWallClockToUtcMs } from "@/lib/parse-event-date"
import { chicagoDay, eventDayOf, overridesApply, applyTonight, type OverridesDoc } from "@/lib/performance/tonight"
import { buildTodayDoc } from "@/lib/today/build-today"
import { selectLatestReaderMusic } from "@/lib/reader-music"
import { toEventDateLabel } from "@/lib/mcp/tools/service-sheet"

const ORGS = ["crc", "brotherslazaroff"] as const
const LATE_FRIDAY = "2026-06-06T03:30:00.000Z" // Fri 5 Jun 22:30 Chicago

const call = (fn: (...a: any[]) => any, ...args: any[]) => fn(...args)

describe.each(ORGS)("golden time zone — %s", (org) => {
    it("parseEventDate: naive and date-only inputs are Chicago wall clock", () => {
        expect(call(parseEventDate, "2026-05-30", org).toDate().toISOString()).toBe("2026-05-30T17:00:00.000Z")
        expect(call(parseEventDate, "2026-01-10T10:00", org).toDate().toISOString()).toBe("2026-01-10T16:00:00.000Z")
        expect(call(parseEventDate, "2026-05-30T10:00:00.000Z", org).toDate().toISOString()).toBe("2026-05-30T10:00:00.000Z")
        expect(new Date(chicagoWallClockToUtcMs(2026, 6, 5, 18, 0, 0, 0)).toISOString()).toBe("2026-06-05T23:00:00.000Z")
    })

    it("tonight: service day and expiry are Chicago calendar days", () => {
        expect(chicagoDay(Date.parse(LATE_FRIDAY))).toBe("2026-06-05")
        expect(call(eventDayOf, LATE_FRIDAY, org)).toBe("2026-06-05")
        expect(call(eventDayOf, "2026-06-05", org)).toBe("2026-06-05")
        const doc: OverridesDoc = {
            rows: { r1: { fileId: "f2", songId: "f2", title: "Swap", key: null, mimeType: null, plannedFileId: "f1", swappedBy: "u", swappedAt: 0 } },
            eventDay: "2026-06-05",
            rev: 1,
            updatedAt: 0,
            updatedBy: "u",
        }
        expect(call(overridesApply, doc, "2026-06-05", Date.parse("2026-06-06T04:30:00Z"), org)).toBe(true)
        expect(call(overridesApply, doc, "2026-06-05", Date.parse("2026-06-06T05:30:00Z"), org)).toBe(false)
        const rows = [{ id: "r1", fileId: "f1", songId: "f1", title: "Plan" }]
        const applied = call(applyTonight, rows, doc, "2026-06-05", Date.parse("2026-06-06T04:30:00Z"), org)
        expect(applied[0].fileId).toBe("f2")
        expect(call(applyTonight, rows, doc, "2026-06-05", Date.parse("2026-06-06T05:30:00Z"), org)).toBe(rows)
    })

    it("today.json: event day, window and startsAt are Chicago", () => {
        const doc = buildTodayDoc({
            setlists: [
                { id: "late-thu", name: "Thu late", templateType: "friday_night", eventDate: "2026-06-05T04:30:00.000Z" },
                { id: "fri", name: "Fri", templateType: "friday_night", eventDate: LATE_FRIDAY, version: 3 },
                { id: "sat", name: "Sat", templateType: "shabbat_morning", eventDate: "2026-06-06T15:00:00.000Z", startsAtLocal: "10:30" },
            ],
            services: { friday_night: { label: "Erev", defaultStartLocal: "18:00" } },
            stream: { url: "https://stream.example/live", leadMinutes: 10 },
            now: new Date("2026-06-05T15:00:00.000Z"),
            org,
        } as any)
        expect(doc).toEqual({
            schemaVersion: 1,
            generatedAt: "2026-06-05T15:00:00.000Z",
            services: [
                {
                    setlistId: "fri",
                    name: "Fri",
                    eventDate: "2026-06-05",
                    serviceType: "friday_night",
                    startsAt: "2026-06-05T23:00:00.000Z",
                    stream: { url: "https://stream.example/live", startsAt: "2026-06-05T22:50:00.000Z" },
                    version: 3,
                    // BET-6: additive, CRC only; every key above is unchanged.
                    ...(org === "crc" ? { occasion: "regular" } : {}),
                },
                {
                    setlistId: "sat",
                    name: "Sat",
                    eventDate: "2026-06-06",
                    serviceType: "shabbat_morning",
                    startsAt: "2026-06-06T15:30:00.000Z",
                    stream: { url: "https://stream.example/live", startsAt: "2026-06-06T15:20:00.000Z" },
                    version: 1,
                    ...(org === "crc" ? { occasion: "regular" } : {}),
                },
            ],
        })
    })

    it("reader music: last-used date is the Chicago day", async () => {
        const sel = await selectLatestReaderMusic(
            [{ id: "s1", orgId: org, isTest: false, eventDate: { toDate: () => new Date(LATE_FRIDAY) } }],
            { orgId: org, momentId: "m", pieceId: "p", status: "reviewed" },
            Date.parse("2026-06-10T00:00:00Z"),
            {
                getTracksForSetlist: async () =>
                    [{ id: "t1", orgId: org, songId: "song1", fileId: "f1", title: "T", readerMusic: { momentId: "m", pieceId: "p" } }] as any,
                isBindingAuthorized: async () => true,
            },
        )
        expect(sel.status).toBe("available")
        if (sel.status === "available") {
            expect(sel.binding.lastUsedDate).toBe("2026-06-05")
            expect(sel.binding.lastUsedLabel).toBe("Last used 2026-06-05")
        }
    })

    it("service sheet: header date is the Chicago day", () => {
        expect(call(toEventDateLabel, { toDate: () => new Date(LATE_FRIDAY) }, org)).toBe("June 5, 2026")
        expect(call(toEventDateLabel, "2026-06-05", org)).toBe("2026-06-05")
    })
})
