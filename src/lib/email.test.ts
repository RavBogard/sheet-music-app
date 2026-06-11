import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

/**
 * v11.4-02 (D8 item 4): publish/packet emails brand by the publishing org.
 * These assert:
 *  - CRC (default / unspecified org) email HTML + from-line are byte-identical
 *    to the pre-phase hardcodes (AC-1).
 *  - Brothers Lazaroff emails carry BL from-name, header color, wordmark image,
 *    and footer (AC-2).
 * Pure-lib unit test — no real Resend send (the client is mocked).
 */

// Hoisted spy so the resend mock factory can reference it.
const { sendSpy } = vi.hoisted(() => ({ sendSpy: vi.fn() }))
vi.mock("resend", () => ({
    Resend: vi.fn(() => ({ emails: { send: sendSpy } })),
}))

import { buildSetlistEmailHtml, sendSetlistEmail } from "@/lib/email"

const baseParams = {
    to: "musician@example.com",
    recipientName: "Alex",
    setlistName: "Shabbat Morning",
    eventDate: "June 13, 2026",
    setlistUrl: "https://centralreform.live/perform/setlist/s1",
    packetUrl: "https://centralreform.live/api/setlist/print/public?setlistId=s1",
    songs: ["Oseh Shalom", "Mi Chamocha"],
    publisherName: "Rabbi Daniel",
}

describe("buildSetlistEmailHtml — org branding (D8 item 4)", () => {
    it("AC-1: CRC (no org) renders the byte-identical header, footer, and NO image", () => {
        const html = buildSetlistEmailHtml(baseParams)
        // Header: CRC dark indigo, text-only (no wordmark image).
        expect(html).toContain('<td style="background:#1a1a2e;padding:24px 32px;">')
        expect(html).not.toContain("<img")
        // Footer: exact CRC string.
        expect(html).toContain("CRC Music — Central Reform Congregation")
        // No BL branding leaked in.
        expect(html).not.toContain("#04201f")
        expect(html).not.toContain("Brothers Lazaroff")
    })

    it("explicit org:'crc' is identical to omitting org (byte-identical default)", () => {
        expect(buildSetlistEmailHtml({ ...baseParams, org: "crc" })).toBe(
            buildSetlistEmailHtml(baseParams),
        )
    })

    it("AC-2: Brothers Lazaroff renders BL header color, wordmark image, and footer", () => {
        const html = buildSetlistEmailHtml({ ...baseParams, org: "brotherslazaroff" })
        expect(html).toContain('<td style="background:#04201f;padding:24px 32px;">')
        // Absolute wordmark URL with the BL base host.
        expect(html).toContain(
            'src="https://brotherslazaroff.live/brands/brotherslazaroff/wordmark.png"',
        )
        expect(html).toContain('alt="Brothers Lazaroff"')
        // Footer is BL; the CRC footer is gone.
        expect(html).toContain(
            '<p style="margin:0;color:#999;font-size:12px;text-align:center;">Brothers Lazaroff</p>',
        )
        expect(html).not.toContain("Central Reform Congregation")
    })
})

describe("sendSetlistEmail — branded from-line", () => {
    beforeEach(() => {
        process.env.RESEND_API_KEY = "test-key"
        sendSpy.mockReset()
        sendSpy.mockResolvedValue({ data: { id: "msg-1" }, error: null })
    })
    afterEach(() => {
        delete process.env.RESEND_API_KEY
    })

    it("AC-1: CRC from-line is 'CRC Music <noreply@centralreform.live>'", async () => {
        await sendSetlistEmail(baseParams)
        expect(sendSpy).toHaveBeenCalledTimes(1)
        expect(sendSpy.mock.calls[0][0].from).toBe(
            "CRC Music <noreply@centralreform.live>",
        )
    })

    it("AC-2: BL from-name is 'Brothers Lazaroff' (address falls back to the verified sender)", async () => {
        await sendSetlistEmail({ ...baseParams, org: "brotherslazaroff" })
        expect(sendSpy).toHaveBeenCalledTimes(1)
        const from: string = sendSpy.mock.calls[0][0].from
        expect(from.startsWith("Brothers Lazaroff <")).toBe(true)
        // No dedicated BL sender env set → shared verified centralreform.live sender.
        expect(from).toBe("Brothers Lazaroff <noreply@centralreform.live>")
    })

    it("AC-2: BL honors RESEND_FROM_EMAIL_BROSLAZ when set", async () => {
        process.env.RESEND_FROM_EMAIL_BROSLAZ = "noreply@brotherslazaroff.live"
        try {
            await sendSetlistEmail({ ...baseParams, org: "brotherslazaroff" })
            expect(sendSpy.mock.calls[0][0].from).toBe(
                "Brothers Lazaroff <noreply@brotherslazaroff.live>",
            )
        } finally {
            delete process.env.RESEND_FROM_EMAIL_BROSLAZ
        }
    })
})
