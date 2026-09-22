import { describe, it, expect } from "vitest"
import { normalizeSurface } from "@/lib/web-vitals"

/**
 * `surface` is meant to name a ROUTE. When it names a visit instead, the
 * summary fragments: a 30-day read produced 40-odd keys of which ~35 were
 * individual tracks at 2–6 samples each, which in turn pushed the routes
 * anyone was asking about below the summary's top-N cut.
 *
 * The ordering test is the one that matters. The first implementation chained
 * `.replace` calls, so the track rule rewrote to
 * `/perform/setlist/[id]/track/[trackId]` and the setlist rule that ran next
 * matched `[id]` as its own `[^/]+` and collapsed it straight back.
 */
describe("normalizeSurface", () => {
    it("keeps a track on the track route — not folded into the setlist route", () => {
        expect(
            normalizeSurface(
                "/perform/setlist/e7cf1877-c0f8-4dbd-8e6a-f39c5b0af0b5/track/01231cc7-fa6d-452e-950d-e01150a6c782",
            ),
        ).toBe("/perform/setlist/[id]/track/[trackId]")
    })

    it("collapses a setlist id", () => {
        expect(normalizeSurface("/perform/setlist/D7fsXnxhmS9U0QC7UNnG")).toBe(
            "/perform/setlist/[id]",
        )
        expect(normalizeSurface("/setlists/296022d0-520e-425a-8076-fcdcd10dd46a")).toBe(
            "/setlists/[id]",
        )
    })

    it("collapses a chart opened directly, Drive id or upload id alike", () => {
        expect(normalizeSurface("/perform/1VSB3wRDJN_1nvab8nyNG3W65QXup2YQV")).toBe(
            "/perform/[fileId]",
        )
        expect(
            normalizeSurface("/perform/upload-bef8b711-2764-42ed-954d-31abbb722c19"),
        ).toBe("/perform/[fileId]")
    })

    it("collapses a QR code", () => {
        expect(normalizeSurface("/qr/M29NK7")).toBe("/qr/[code]")
        expect(normalizeSurface("/qr/FABJJP")).toBe("/qr/[code]")
    })

    it("leaves routes that carry no id alone", () => {
        for (const p of ["/perform", "/setlists", "/library", "/login", "/", "/schedule"]) {
            expect(normalizeSurface(p)).toBe(p)
        }
    })

    it("maps a whole sample of real observed paths onto a small set of routes", () => {
        // These are the surface keys the live sink actually held on 2026-09-22.
        const observed = [
            "/perform/setlist/[id]/track/caa77706-5d13-4282-857c-229f02408a2e",
            "/perform/setlist/[id]/track/93573b04-8d07-4f59-8233-994ad0705383",
            "/perform/setlist/[id]/track/track-1788641415659-upload-94531082-4b5f-4215-bfbd-d6d7b6d624e0-0",
            "/perform/upload-e3f9ef79-e77e-4746-9968-412fb08a0002",
            "/perform/1AZumqP1QVsv_1AQRi6DeO4RfBcP5mlkg",
            "/perform/077a95a9-da4a-4703-97c5-77c6bebeb5f6",
            "/qr/DDFYQ6",
            "/perform",
            "/library",
        ]
        expect(new Set(observed.map(normalizeSurface))).toEqual(
            new Set([
                "/perform/setlist/[id]/track/[trackId]",
                "/perform/[fileId]",
                "/qr/[code]",
                "/perform",
                "/library",
            ]),
        )
    })
})
