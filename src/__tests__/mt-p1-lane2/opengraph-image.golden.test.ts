import { readFileSync } from "node:fs"
import { createHash } from "node:crypto"
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
 * This pins the source and proves the tenant catalogue already reproduces the
 * three CRC literals, so a later phase can switch to orgString(...) knowing
 * crc/BL output stays the same.
 */
vi.mock("next/og", () => ({ ImageResponse: class {} }))

const SRC = path.join(process.cwd(), "src", "app", "opengraph-image.tsx")
const CRLF = new RegExp(String.fromCharCode(13, 10), "g")
/** LF-normalised (as on the Linux build) so the pin does not depend on the checkout's line endings. */
const source = () => readFileSync(SRC, "utf8").replace(CRLF, String.fromCharCode(10))
const NL = String.fromCharCode(10)

describe("multi-tenant P1 golden: social image", () => {
    it("source file is byte-identical (keeps the og:image ?hash on every page)", () => {
        const sha = createHash("sha256").update(source()).digest("hex")
        expect(sha).toBe("8de131af2c81aec5d5e57b80903c9468d3486e96fda5560a28e5ea503c9bcd85")
    })

    it("static exports are CRC's", async () => {
        const og = await import("@/app/opengraph-image")
        const tw = await import("@/app/twitter-image")
        expect(og.alt).toBe("Central Reform Congregation — Digital Sheet Music Library")
        expect(og.size).toEqual({ width: 1200, height: 630 })
        expect(og.contentType).toBe("image/png")
        expect(tw.alt).toBe(og.alt)
        expect(tw.default).toBe(og.default)
    })

    for (const org of ["crc", "brotherslazaroff"]) {
        it(`${org}: the catalogue reproduces the hardcoded alt / monogram / title`, () => {
            const src = source()
            expect(orgString(org, "og.alt")).toBe("Central Reform Congregation — Digital Sheet Music Library")
            expect(src).toContain(`export const alt = '${orgString(org, "og.alt")}'`)
            expect(src).toContain(`>${NL}                                ${orgString(org, "og.monogram")}${NL}`)
            expect(src).toContain(`>${NL}                            ${orgString(org, "og.title")}${NL}`)
        })
    }
})
