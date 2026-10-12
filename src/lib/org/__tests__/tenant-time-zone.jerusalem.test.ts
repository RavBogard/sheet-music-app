import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"

/**
 * Multi-tenant phase 1 — a third tenant in Asia/Jerusalem (primeTestOrg) gets
 * its own wall clock and service days on every surface the CRC golden covers
 * (tenant-time-zone.golden.test.ts). Same instants: 03:30Z on 6 June is late
 * Friday in Chicago but Saturday morning in Jerusalem.
 */

vi.mock("@/lib/firebase-admin", () => ({ initAdmin: () => true, getFirestore: () => ({}) }))
vi.mock("@/lib/pdf/service-sheet-pdf", () => ({ renderServiceSheetPdf: vi.fn() }))

import { primeTestOrg } from "@/lib/org/__tests__/test-org-config"
import { clearPrimedOrgConfigs } from "@/lib/org/config-cache"
import { orgTimeZone, orgCalendar, FALLBACK_TIME_ZONE } from "@/lib/org/locale"
import { parseEventDate } from "@/lib/parse-event-date"
import { eventDayOf, overridesApply, applyTonight, type OverridesDoc } from "@/lib/performance/tonight"
import { buildTodayDoc } from "@/lib/today/build-today"
import { selectLatestReaderMusic } from "@/lib/reader-music"
import { toEventDateLabel } from "@/lib/mcp/tools/service-sheet"

const ORG = "testshul"
const LATE_FRIDAY = "2026-06-06T03:30:00.000Z" // Sat 6 Jun 06:30 Jerusalem

beforeEach(() => {
    primeTestOrg()
})
afterEach(() => clearPrimedOrgConfigs())

describe("tenant locale helpers", () => {
    it("reads the primed tenant, then the code tables, then CRC's zone", () => {
        expect(orgTimeZone(ORG)).toBe("Asia/Jerusalem")
        expect(orgCalendar(ORG)).toBe("israel")
        expect(orgTimeZone("crc")).toBe("America/Chicago")
        expect(orgTimeZone("brotherslazaroff")).toBe("America/Chicago")
        expect(orgCalendar("crc")).toBe("diaspora")
        expect(orgTimeZone("unknown-tenant")).toBe(FALLBACK_TIME_ZONE)
        expect(orgTimeZone(undefined)).toBe("America/Chicago")
        clearPrimedOrgConfigs()
        expect(orgTimeZone(ORG)).toBe(FALLBACK_TIME_ZONE)
    })
})

describe("Asia/Jerusalem tenant", () => {
    it("parseEventDate reads naive inputs as Jerusalem wall clock (DST-aware)", () => {
        expect(parseEventDate("2026-05-30", ORG).toDate().toISOString()).toBe("2026-05-30T09:00:00.000Z")
        expect(parseEventDate("2026-01-10T10:00", ORG).toDate().toISOString()).toBe("2026-01-10T08:00:00.000Z")
        expect(parseEventDate("2026-05-30T10:00:00.000Z", ORG).toDate().toISOString()).toBe("2026-05-30T10:00:00.000Z")
    })

    it("tonight: the service day and its expiry are Jerusalem days", () => {
        expect(eventDayOf(LATE_FRIDAY, ORG)).toBe("2026-06-06")
        const doc: OverridesDoc = {
            rows: { r1: { fileId: "f2", songId: "f2", title: "Swap", key: null, mimeType: null, plannedFileId: "f1", swappedBy: "u", swappedAt: 0 } },
            eventDay: "2026-06-06",
            rev: 1,
            updatedAt: 0,
            updatedBy: "u",
        }
        expect(overridesApply(doc, "2026-06-06", Date.parse("2026-06-06T20:30:00Z"), ORG)).toBe(true)
        expect(overridesApply(doc, "2026-06-06", Date.parse("2026-06-06T21:30:00Z"), ORG)).toBe(false)
        const rows = [{ id: "r1", fileId: "f1", songId: "f1", title: "Plan" }]
        expect(applyTonight(rows, doc, "2026-06-06", Date.parse("2026-06-06T20:30:00Z"), ORG)[0].fileId).toBe("f2")
    })

    it("today.json windows and starts in Jerusalem", () => {
        const doc = buildTodayDoc({
            setlists: [
                { id: "late-thu", name: "Thu late", templateType: "friday_night", eventDate: "2026-06-05T04:30:00.000Z" },
                { id: "fri", name: "Fri", templateType: "friday_night", eventDate: LATE_FRIDAY, version: 3 },
                { id: "sat", name: "Sat", templateType: "shabbat_morning", eventDate: "2026-06-06T15:00:00.000Z", startsAtLocal: "10:30" },
            ],
            services: { friday_night: { label: "Erev", defaultStartLocal: "18:00" } },
            stream: null,
            now: new Date("2026-06-05T15:00:00.000Z"),
            org: ORG,
        })
        expect(doc.services.map((s) => [s.setlistId, s.eventDate, s.startsAt])).toEqual([
            ["late-thu", "2026-06-05", "2026-06-05T15:00:00.000Z"],
            ["sat", "2026-06-06", "2026-06-06T07:30:00.000Z"],
            ["fri", "2026-06-06", "2026-06-06T15:00:00.000Z"],
        ])
    })

    it("reader music last-used date is the Jerusalem day", async () => {
        const sel = await selectLatestReaderMusic(
            [{ id: "s1", orgId: ORG, isTest: false, eventDate: { toDate: () => new Date(LATE_FRIDAY) } }],
            { orgId: ORG, momentId: "m", pieceId: "p", status: "reviewed" },
            Date.parse("2026-06-10T00:00:00Z"),
            {
                getTracksForSetlist: async () => [{ id: "t1", orgId: ORG, songId: "song1", fileId: "f1", title: "T", readerMusic: { momentId: "m", pieceId: "p" } }] as any,
                isBindingAuthorized: async () => true,
            },
        )
        expect(sel.status === "available" && sel.binding.lastUsedDate).toBe("2026-06-06")
    })

    it("service sheet header prints the Jerusalem day", () => {
        expect(toEventDateLabel({ toDate: () => new Date(LATE_FRIDAY) }, ORG)).toBe("June 6, 2026")
    })
})
