/**
 * v4.3 B01 — reportSaveError helper tests.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const { toastError, loggerWarn } = vi.hoisted(() => ({
    toastError: vi.fn(),
    loggerWarn: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: { error: toastError } }))
vi.mock("@/lib/logger", () => ({ logger: { warn: loggerWarn, error: vi.fn(), info: vi.fn() } }))

import { reportSaveError } from "@/lib/save-error"

describe("reportSaveError (B01)", () => {
    beforeEach(() => {
        toastError.mockClear()
        loggerWarn.mockClear()
    })

    it("logs and toasts on default call", () => {
        reportSaveError(new Error("boom"), "transposition")
        expect(loggerWarn).toHaveBeenCalledTimes(1)
        expect(loggerWarn.mock.calls[0][0]).toContain("transposition failed")
        expect(toastError).toHaveBeenCalledWith("Couldn't save transposition — try again")
    })

    it("logs but does NOT toast when silent", () => {
        reportSaveError(new Error("boom"), "dashboard prefetch", { silent: true })
        expect(loggerWarn).toHaveBeenCalledTimes(1)
        expect(toastError).not.toHaveBeenCalled()
    })

    it("works as a .catch handler on a rejected promise", async () => {
        const p = Promise.reject(new Error("nope"))
        await p.catch(err => reportSaveError(err, "track details"))
        expect(toastError).toHaveBeenCalledWith("Couldn't save track details — try again")
    })

    it("returns undefined", () => {
        expect(reportSaveError(new Error("x"), "thing")).toBeUndefined()
    })
})
