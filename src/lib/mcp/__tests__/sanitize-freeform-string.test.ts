import { describe, it, expect } from "vitest"
import { sanitizeFreeformString } from "@/lib/mcp/server-tracks-write"

// F-015: MCP-boundary sanitization for user-supplied freeform string fields
// (notes / title / leadMusician / referenceLink). Strips null bytes + C0/C1
// control characters that corrupt display or break downstream parsers, while
// preserving all printable Unicode (Hebrew, emoji, accents) and the three
// benign whitespace controls (tab, LF, CR).
describe("sanitizeFreeformString", () => {
    it("strips null bytes", () => {
        expect(sanitizeFreeformString("Shalom\x00Rav")).toBe("ShalomRav")
        expect(sanitizeFreeformString("\x00\x00")).toBe("")
    })

    it("strips C0 control characters (except tab/LF/CR)", () => {
        // 0x01–0x08, 0x0B, 0x0C, 0x0E–0x1F
        const dirty = "a\x01b\x07c\x0Bd\x0Ce\x1Ff"
        expect(sanitizeFreeformString(dirty)).toBe("abcdef")
    })

    it("strips DEL (0x7F) and C1 controls (0x80–0x9F)", () => {
        const dirty = "x\x7Fy\x80z\x9Fw"
        expect(sanitizeFreeformString(dirty)).toBe("xyzw")
    })

    it("preserves benign whitespace controls: tab, LF, CR", () => {
        const text = "line1\tcol2\nline2\r\nline3"
        expect(sanitizeFreeformString(text)).toBe(text)
    })

    it("preserves printable Unicode: Hebrew, accents, emoji", () => {
        expect(sanitizeFreeformString("לֵךְ דּוֹדִי")).toBe("לֵךְ דּוֹדִי")
        expect(sanitizeFreeformString("café")).toBe("café")
        expect(sanitizeFreeformString("set 🎵 list")).toBe("set 🎵 list")
    })

    it("is a no-op on clean ASCII and the empty string", () => {
        expect(sanitizeFreeformString("Lecha Dodi (Carlebach)")).toBe(
            "Lecha Dodi (Carlebach)",
        )
        expect(sanitizeFreeformString("")).toBe("")
    })

    it("strips a mixed payload but keeps the legible remainder", () => {
        // simulated paste of a smuggled null + bell into a notes field
        const dirty = "Capo 2\x00\x07; key of G\x1F"
        expect(sanitizeFreeformString(dirty)).toBe("Capo 2; key of G")
    })
})
