import { describe, expect, it } from "vitest"
import { createHash } from "node:crypto"

import {
    contentHashFor,
    crossCheckMd5,
    hashIsCurrent,
    md5Both,
    sha256Hex,
} from "../content-hash"

/**
 * W4 (R-0903-live-cw-2 §3) — the content-identity primitives.
 *
 * These are the pieces G4 rests on: a hash is never written for bytes that
 * did not verify, and the verification has to compare the right encoding
 * against the right claim or it would fail every Drive row.
 */
describe("content-hash primitives (W4)", () => {
    const bytes = Buffer.from("Hashkivenu, avinu, l'shalom\n", "utf8")

    it("sha256Hex matches node's own digest", () => {
        expect(sha256Hex(bytes)).toBe(
            createHash("sha256").update(bytes).digest("hex"),
        )
        expect(sha256Hex(bytes)).toHaveLength(64)
    })

    it("md5Both returns the SAME digest in hex and base64", () => {
        const { hex, base64 } = md5Both(bytes)
        // The two encodings must be the same bytes, or the cross-check would
        // be comparing different values against Drive and Storage.
        expect(Buffer.from(hex, "hex").toString("base64")).toBe(base64)
    })

    it("contentHashFor carries the size and the source", () => {
        const h = contentHashFor(bytes, "firebase-storage", "2026-09-03T00:00:00.000Z")
        expect(h).toEqual({
            alg: "sha256",
            value: sha256Hex(bytes),
            sizeBytes: bytes.byteLength,
            at: "2026-09-03T00:00:00.000Z",
            source: "firebase-storage",
        })
    })

    describe("crossCheckMd5 — the G4 gate", () => {
        it("reports `checked: false` when the row claims no md5 (not a failure)", () => {
            expect(crossCheckMd5(bytes, {})).toEqual({ checked: false })
            expect(crossCheckMd5(bytes, { driveMd5: "" })).toEqual({
                checked: false,
            })
        })

        it("agrees with a HEX driveMd5", () => {
            const { hex } = md5Both(bytes)
            expect(crossCheckMd5(bytes, { driveMd5: hex })).toEqual({
                checked: true,
                ok: true,
            })
            // Drive's checksums are lowercase hex; accept either case rather
            // than reporting a whole population as mismatched over casing.
            expect(
                crossCheckMd5(bytes, { driveMd5: hex.toUpperCase() }),
            ).toEqual({ checked: true, ok: true })
        })

        it("agrees with a BASE64 Storage md5Hash", () => {
            const { base64 } = md5Both(bytes)
            expect(crossCheckMd5(bytes, { storageMd5Hash: base64 })).toEqual({
                checked: true,
                ok: true,
            })
        })

        it("does NOT compare the wrong encoding against the wrong claim", () => {
            // The bug this guards: comparing Drive's hex against a base64
            // digest would mark every single Drive row as a mismatch, which
            // would look like a systematic download failure and trip the
            // wave's own stop condition on a healthy library.
            const { hex, base64 } = md5Both(bytes)
            const r = crossCheckMd5(bytes, {
                driveMd5: hex,
                storageMd5Hash: base64,
            })
            expect(r).toEqual({ checked: true, ok: true })
        })

        it("FAILS with a detail naming both values when the claim disagrees", () => {
            const r = crossCheckMd5(bytes, {
                driveMd5: "0".repeat(32),
            })
            expect(r.checked).toBe(true)
            if (!r.checked || r.ok) throw new Error("expected a mismatch")
            expect(r.detail).toContain("driveMd5 claims 00000000")
            expect(r.detail).toContain(md5Both(bytes).hex)
        })

        it("reports BOTH claims when both disagree", () => {
            const r = crossCheckMd5(bytes, {
                driveMd5: "0".repeat(32),
                storageMd5Hash: "AAAAAAAAAAAAAAAAAAAAAA==",
            })
            if (!r.checked || r.ok) throw new Error("expected a mismatch")
            expect(r.detail).toContain("driveMd5")
            expect(r.detail).toContain("Storage md5Hash")
        })
    })

    describe("hashIsCurrent — the resumability test", () => {
        const good = contentHashFor(bytes, "upload")

        it("accepts a well-formed hash whose size matches the row", () => {
            expect(hashIsCurrent(good, bytes.byteLength)).toBe(true)
        })

        it("REJECTS a hash whose size disagrees with the row's fileSize", () => {
            // The bytes moved under the row (a re-upload to the same id, a
            // heal). Size is the cheapest signal that a byte read is needed,
            // and it costs no byte read to consult.
            expect(hashIsCurrent(good, bytes.byteLength + 1)).toBe(false)
        })

        it("accepts a well-formed hash when the row records no fileSize", () => {
            // Otherwise every such row would be re-read on every run,
            // forever, and the backfill would never converge.
            expect(hashIsCurrent(good, undefined)).toBe(true)
            expect(hashIsCurrent(good, null)).toBe(true)
        })

        it("rejects absent, malformed, and wrong-algorithm values", () => {
            expect(hashIsCurrent(undefined, 10)).toBe(false)
            expect(hashIsCurrent(null, 10)).toBe(false)
            expect(hashIsCurrent("deadbeef", 10)).toBe(false)
            expect(hashIsCurrent({ alg: "md5", value: "x", sizeBytes: 10 }, 10)).toBe(
                false,
            )
            // A truncated digest is the dangerous one: it looks present.
            expect(
                hashIsCurrent(
                    { alg: "sha256", value: "abc", sizeBytes: 10 },
                    10,
                ),
            ).toBe(false)
            expect(
                hashIsCurrent(
                    { alg: "sha256", value: "a".repeat(64) },
                    10,
                ),
            ).toBe(false)
        })
    })

    it("the two size-equal byte-DIFFERENT pairs from G5 stay different", () => {
        // Both `V'Shamru`/`V'Shamru (Old Skool)` and `Adonai Oz`/`Avinu
        // Malkeinu_trad_Choir_Em` are size-equal in production (50863 and
        // 46235 bytes). Size equality is what the cheap key would have
        // grouped on; sha256 is what tells them apart.
        const a = Buffer.alloc(64, 0x41)
        const b = Buffer.alloc(64, 0x42)
        expect(a.byteLength).toBe(b.byteLength)
        expect(sha256Hex(a)).not.toBe(sha256Hex(b))
    })
})
