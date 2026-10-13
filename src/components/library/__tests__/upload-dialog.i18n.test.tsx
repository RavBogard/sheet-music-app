import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, screen } from "@testing-library/react"

/** Phase 7 i18n: every UploadDialog string comes through t(). */

vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: { uid: "u1" } }) }))
vi.mock("@tanstack/react-query", () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
vi.mock("@/lib/library-cache", () => ({ broadcastCacheInvalidation: vi.fn() }))
vi.mock("@/lib/api-client", () => ({ apiFetch: vi.fn() }))
vi.mock("@/lib/setlist-firebase", () => ({}))
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

import { renderPseudo, expectNoUntranslatedText } from "@/test-utils/i18n"
import type { Setlist } from "@/lib/setlist-firebase"
import { UploadDialog } from "../UploadDialog"

const SETLISTS = [{ id: "s1", name: "Test Setlist A" }] as unknown as Setlist[]
// Data: file name, auto-filled title, collection names, setlist name, key names (C#, Bbm…).
// "Close" is the shared Dialog close button (src/components/ui/dialog.tsx, not this lane's file).
const ALLOW: Array<string | RegExp> = ["Close", "test-song-a.pdf", "Test Setlist A", "CRC Charts", "Shireinu", "Nava Tehilah", /^[A-G][#b]?m?$/]

function openWithFile(rtl: boolean) {
    renderPseudo(<UploadDialog setlists={SETLISTS} />, { rtl })
    expectNoUntranslatedText(document.body, { allow: ALLOW })
    fireEvent.click(screen.getByRole("button"))
    // Drop zone.
    expectNoUntranslatedText(document.body, { allow: ALLOW })
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(input, { target: { files: [new File(["x".repeat(4096)], "test-song-a.pdf", { type: "application/pdf" })] } })
    // Metadata form.
    expect(document.getElementById("upload-collection")).not.toBeNull()
    expect(document.getElementById("upload-setlist")).not.toBeNull()
    expectNoUntranslatedText(document.body, { allow: ALLOW })
}

describe("UploadDialog i18n (pseudo-locale)", () => {
    afterEach(() => cleanup())

    it("qps: drop zone and metadata form come through t()", () => {
        openWithFile(false)
    })

    it("qps-rtl: renders rtl with no untranslated text", () => {
        openWithFile(true)
        expect(document.querySelector('[dir="rtl"]')).not.toBeNull()
    })
})
