import { describe, expect, it } from "vitest"
import { checkIdentity, formValues, IDENTITY_FIELDS, kindAt, textToRecord } from "../identity-fields"
import { testConfig } from "./helpers"

describe("identity form generated from OrgConfigSchema", () => {
    it("reads each field's input kind and choices from the schema", () => {
        expect(kindAt("name")).toEqual({ kind: "text" })
        expect(kindAt("vocabulary.mode")).toEqual({ kind: "enum", options: ["shul", "band"] })
        expect(kindAt("locale.language")).toEqual({ kind: "enum", options: ["en", "he"] })
        expect(kindAt("branding.colors.light")).toEqual({ kind: "record" })
        expect(kindAt("branding.nope")).toBeNull()
    })

    it("every listed field resolves in the schema", () => {
        for (const f of IDENTITY_FIELDS) expect(kindAt(f.path), f.path).not.toBeNull()
    })

    it("validates with the schema and maps the message to the field", () => {
        const c = testConfig()
        const v = { ...formValues(c), name: "", "branding.shortName": "" }
        const r = checkIdentity(c, v)
        expect(Object.keys(r.errors).sort()).toEqual(["branding.shortName", "name"])
    })

    it("sends each changed top-level section whole, so a shallow merge loses nothing", () => {
        const c = testConfig()
        const r = checkIdentity(c, { ...formValues(c), "branding.tagline": "Hello", "branding.colors.light": "--brand: #123456" })
        expect(r.errors).toEqual({})
        expect(r.changed).toEqual(["branding.tagline", "branding.colors.light"])
        expect(Object.keys(r.patch)).toEqual(["branding"])
        const b = r.patch.branding as Record<string, unknown>
        expect(b.tagline).toBe("Hello")
        expect(b.appName).toBe(c.branding.appName)
        expect(b.colors).toEqual({ light: { "--brand": "#123456" }, dark: {} })
    })

    it("no change, no patch", () => {
        const c = testConfig()
        expect(checkIdentity(c, formValues(c)).changed).toEqual([])
    })

    it("parses colour lines", () => {
        expect(textToRecord("a: 1\n\nbad line\n b : x:y ")).toEqual({ a: "1", b: "x:y" })
    })
})
