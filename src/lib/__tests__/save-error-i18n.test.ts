/**
 * Multi-tenant phase 7 — plain (non-React) client code translates through the
 * language the root provider primed.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))
vi.mock("sonner", () => ({ toast: { error: toastError } }))
vi.mock("@/lib/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }))

import { messagesFor, primeAllMessages } from "@/i18n/catalogues"
import { clearPrimedMessages, primeMessages } from "@/i18n/message-cache"
import { isPseudoWrapped } from "@/i18n/pseudo"
import { plainT, reportSaveError } from "@/lib/save-error"

describe("plainT / reportSaveError (phase 7)", () => {
    afterEach(() => {
        clearPrimedMessages()
        primeAllMessages()
        toastError.mockClear()
    })

    it("is English on the server and in tests (complete catalogues primed)", () => {
        expect(plainT()("appSync.syncPausedTitle")).toBe("Sync paused")
    })

    it("uses the language the browser provider primed", () => {
        clearPrimedMessages()
        primeMessages("qps-rtl", messagesFor("qps-rtl"))
        expect(isPseudoWrapped(plainT()("appSync.reload"))).toBe(true)
        reportSaveError(new Error("x"), "track details", { label: "LABEL" })
        expect(isPseudoWrapped(toastError.mock.calls[0][0])).toBe(true)
        expect(toastError.mock.calls[0][0]).toContain("LABEL")
    })
})
