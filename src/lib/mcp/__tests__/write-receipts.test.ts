import { describe, expect, it } from "vitest"

import { writeInputHash, writeReceiptId } from "../write-receipts"

describe("MCP write receipt identity", () => {
    it("fingerprints equivalent object payloads independent of key insertion order", () => {
        expect(
            writeInputHash({ name: "Service", nested: { b: 2, a: 1 } }),
        ).toBe(
            writeInputHash({ nested: { a: 1, b: 2 }, name: "Service" }),
        )
    })

    it("keeps array order and changed values significant", () => {
        expect(writeInputHash({ recipients: ["a", "b"] })).not.toBe(
            writeInputHash({ recipients: ["b", "a"] }),
        )
        expect(writeInputHash({ note: "first" })).not.toBe(
            writeInputHash({ note: "second" }),
        )
    })

    it("scopes the same caller key by tool, org, and uid", () => {
        const base = writeReceiptId("create_setlist", "leader", "crc", "retry-1")
        expect(writeReceiptId("publish_setlist", "leader", "crc", "retry-1")).not.toBe(base)
        expect(writeReceiptId("create_setlist", "other", "crc", "retry-1")).not.toBe(base)
        expect(writeReceiptId("create_setlist", "leader", "bl", "retry-1")).not.toBe(base)
    })
})
