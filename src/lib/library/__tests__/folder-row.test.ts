import { describe, it, expect } from "vitest"
import { isFolderMime } from "../folder-row"

describe("isFolderMime", () => {
    it("is true only for the Drive folder mime type", () => {
        expect(isFolderMime("application/vnd.google-apps.folder")).toBe(true)
        expect(isFolderMime("application/pdf")).toBe(false)
        expect(isFolderMime(undefined)).toBe(false)
    })
})
