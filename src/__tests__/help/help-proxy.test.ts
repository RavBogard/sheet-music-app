import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import { proxy } from "@/proxy"

/** The Help guides are public: a musician on a signed-out iPad can open them. */

const get = (path: string) => proxy(new NextRequest(new URL(`http://localhost${path}`)))

describe("proxy: /help is public", () => {
    it.each(["/help", "/help/michael", "/help/drew", "/help/before", "/help/after"])("%s needs no sign-in", async (path) => {
        const res = await get(path)
        expect(res.headers.get("location")).toBeNull()
    })

    it("a sibling path is still gated", async () => {
        const res = await get("/helpdesk")
        expect(res.headers.get("location")).toBe("http://localhost/login")
    })
})
