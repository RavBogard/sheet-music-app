import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it, vi } from "vitest"

import { orgString } from "@/lib/org/strings"

/**
 * Multi-tenant phase 1 golden — the social image (opengraph-image.tsx and the
 * twitter-image.tsx re-export). Deliberately NOT made request-aware in phase 1:
 *
 *  - Next's metadata-image loader appends the file's content hash to the
 *    og:image / twitter:image URL in every page's <head>
 *    (`/opengraph-image?f2e911431ae8cc06`, golden/http-before/{crc,brotherslazaroff}/binaries.txt),
 *    so ANY edit to opengraph-image.tsx changes CRC's and BL's HTML bytes.
 *  - The image route is behind the auth proxy today (307 → /login on both
 *    hosts), so a per-tenant image would not be served publicly anyway.
 *  - The static `alt` export is baked at build; a per-tenant alt needs
 *    generateImageMetadata, which changes the URL shape (`/opengraph-image/<id>`).
 *
 * Before phase 7 the image was pinned byte-identical. It is now request-aware
 * through generateImageMetadata (a per-tenant alt), which changes CRC's and
 * BL's og:image URL (`/opengraph-image/card?<hash>`) but not the alt text or the
 * image: this test proves crc and BL still get exactly CRC's three literals.
 */
vi.mock("next/og", () => ({ ImageResponse: class {} }))
const state = { org: "crc" }
vi.mock("next/headers", () => ({ headers: async () => new Map([["x-org-id", state.org]]) }))
vi.mock("@/lib/org/get-org-config", () => ({ getOrgConfig: async () => null }))

const SRC = path.join(process.cwd(), "src", "app", "opengraph-image.tsx")
const CRLF = new RegExp(String.fromCharCode(13, 10), "g")
/** LF-normalised (as on the Linux build) so the pin does not depend on the checkout's line endings. */
const source = () => readFileSync(SRC, "utf8").replace(CRLF, String.fromCharCode(10))

describe("multi-tenant golden: social image", () => {
    it("size and type are unchanged; twitter re-exports the OpenGraph image", async () => {
        const og = await import("@/app/opengraph-image")
        const tw = await import("@/app/twitter-image")
        expect(og.size).toEqual({ width: 1200, height: 630 })
        expect(og.contentType).toBe("image/png")
        expect(tw.default).toBe(og.default)
        expect(tw.generateImageMetadata).toBe(og.generateImageMetadata)
    })

    for (const org of ["crc", "brotherslazaroff"]) {
        it(`${org}: alt, monogram and title are CRC's literals, as before`, async () => {
            state.org = org
            const og = await import("@/app/opengraph-image")
            const [meta] = await og.generateImageMetadata()
            expect(meta.alt).toBe("Central Reform Congregation — Digital Sheet Music Library")
            expect(orgString(org, "og.monogram")).toBe("CRC")
            expect(orgString(org, "og.title")).toBe("Central Reform Congregation")
            expect(source()).not.toContain("Central Reform")
        })
    }
})
