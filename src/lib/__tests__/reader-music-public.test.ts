import { afterEach, describe, expect, it } from "vitest"

import {
    approvedPublicReaderCrosswalk,
    isSafePublicReaderChart,
    MAX_PUBLIC_READER_CHART_BYTES,
    MODEH_ANI_PUBLIC_READER_CHART,
    publicReaderChartDefinition,
} from "@/lib/reader-music-public"

const definition = MODEH_ANI_PUBLIC_READER_CHART
const approvedRow = {
    status: "reviewed",
    publicReaderStatus: "approved",
    orgId: definition.orgId,
    momentId: definition.unitId,
    pieceId: definition.pieceId,
}

describe("public reader chart allowlist", () => {
    afterEach(() => {
        delete process.env.READER_PUBLIC_CHARTS_ENABLED
    })

    it("is default-off and enables only the exact Modeh pilot unit", () => {
        expect(publicReaderChartDefinition(definition.unitId)).toBeNull()
        process.env.READER_PUBLIC_CHARTS_ENABLED = "true"
        expect(publicReaderChartDefinition(definition.unitId)).toEqual(definition)
        expect(
            publicReaderChartDefinition(
                "amidah.oseh-shalom@legacy-shabbat-morning",
            ),
        ).toBeNull()
        expect(publicReaderChartDefinition("upload-arbitrary-file-id")).toBeNull()
    })

    it("requires a second, exact per-crosswalk publication approval", () => {
        expect(approvedPublicReaderCrosswalk(approvedRow, definition)).toEqual({
            orgId: "crc",
            momentId: definition.unitId,
            pieceId: definition.pieceId,
            status: "reviewed",
        })
        for (const patch of [
            { publicReaderStatus: undefined },
            { publicReaderStatus: "held" },
            { status: "draft" },
            { orgId: "brotherslazaroff" },
            { momentId: "amidah.oseh-shalom@legacy-shabbat-morning" },
            { pieceId: "oseh-shalom.nava-tehila" },
        ]) {
            expect(
                approvedPublicReaderCrosswalk(
                    { ...approvedRow, ...patch },
                    definition,
                ),
            ).toBeNull()
        }
    })

    it("accepts only bounded PDF bytes with a PDF signature", () => {
        expect(
            isSafePublicReaderChart(
                "application/pdf",
                Buffer.from("%PDF-1.7 ok"),
                definition,
            ),
        ).toBe(true)
        expect(
            isSafePublicReaderChart(
                "application/pdf; charset=binary",
                Buffer.from("%PDF-1.7 ok"),
                definition,
            ),
        ).toBe(true)

        for (const [contentType, bytes] of [
            ["text/html", Buffer.from("%PDF-1.7 hidden in html")],
            ["application/json", Buffer.from("%PDF-1.7")],
            ["image/png", Buffer.from("%PDF-1.7")],
            ["application/pdf", Buffer.from("<html>not a pdf</html>")],
            ["application/pdf", Buffer.alloc(0)],
            [
                "application/pdf",
                Buffer.alloc(MAX_PUBLIC_READER_CHART_BYTES + 1, 0x25),
            ],
        ] as const) {
            expect(
                isSafePublicReaderChart(contentType, bytes, definition),
            ).toBe(false)
        }
    })
})
