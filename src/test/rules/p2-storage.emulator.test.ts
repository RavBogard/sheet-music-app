// @vitest-environment node
import { assertFails, assertSucceeds, type RulesTestEnvironment } from "@firebase/rules-unit-testing"
import { afterAll, beforeAll, describe, it } from "vitest"

import { A, B, C, ctx, makeEnv, type Persona } from "./personas"

/**
 * Multi-tenant phase 2 — storage.rules (design §4.3) against the Storage
 * emulator. Chart objects carry their tenant in custom metadata `orgId`; an
 * object without it is crc. Reads need member or above in that tenant (po
 * reads all); every client write is refused (the server writes via Admin SDK).
 */
describe("P2 storage.rules — library/** by object tenant", () => {
    let env: RulesTestEnvironment
    const bytes = new Uint8Array([37, 80, 68, 70])

    beforeAll(async () => {
        env = await makeEnv("demo-p2-storage", { storage: true })
        await env.clearStorage()
        await env.withSecurityRulesDisabled(async (c) => {
            const root = c.storage().ref()
            await root.child("library/a.pdf").put(bytes, { contentType: "application/pdf", customMetadata: { orgId: A } })
            await root.child("library/b.pdf").put(bytes, { contentType: "application/pdf", customMetadata: { orgId: B } })
            await root.child("library/legacy.pdf").put(bytes, { contentType: "application/pdf" })
            await root.child("library/nested/dir/a2.pdf").put(bytes, { contentType: "application/pdf", customMetadata: { orgId: A } })
            await root.child("recordings/r.mp3").put(bytes, { contentType: "audio/mpeg", customMetadata: { orgId: A } })
        })
    }, 120_000) // the full emulator run (~100 files) can starve the Storage emulator past the 30 s default

    afterAll(async () => {
        await env.cleanup()
    })

    const read = (p: Persona, path: string) => ctx(env, p).storage().ref(path).getMetadata()
    const download = (p: Persona, path: string) => ctx(env, p).storage().ref(path).getDownloadURL()

    const CAN: Array<[Persona, string]> = [
        ["aMe", "library/a.pdf"],
        ["aMe", "library/legacy.pdf"],
        ["aMe", "library/nested/dir/a2.pdf"],
        ["aMu", "library/a.pdf"],
        ["aAdmin", "library/legacy.pdf"],
        ["bBL", "library/b.pdf"],
        ["bSE", "library/b.pdf"],
        ["dual", "library/a.pdf"],
        ["dual", "library/b.pdf"],
        ["po", "library/a.pdf"],
        ["po", "library/b.pdf"],
        ["po", "library/legacy.pdf"],
        ["oldBL", "library/a.pdf"],
        ["oldBL", "library/legacy.pdf"],
        ["oldAdminBoth", "library/b.pdf"],
    ]
    const CANNOT: Array<[Persona, string]> = [
        ["aMe", "library/b.pdf"],
        ["aAdmin", "library/b.pdf"],
        ["bBL", "library/a.pdf"],
        ["bBL", "library/legacy.pdf"],
        ["bSE", "library/legacy.pdf"],
        ["aPe", "library/a.pdf"],
        ["oldPending", "library/a.pdf"],
        ["oldBL", "library/b.pdf"],
        ["signedOut", "library/a.pdf"],
        ["signedOut", "library/legacy.pdf"],
        ["po", "recordings/r.mp3"],
        ["aAdmin", "recordings/r.mp3"],
    ]

    for (const [p, path] of CAN) {
        it(`${p} reads ${path}`, async () => {
            await assertSucceeds(read(p, path))
            await assertSucceeds(download(p, path))
        })
    }
    for (const [p, path] of CANNOT) {
        it(`${p} cannot read ${path}`, async () => {
            await assertFails(read(p, path))
            await assertFails(download(p, path))
        })
    }

    describe("writes are server-only", () => {
        for (const p of ["po", "aAdmin", "aBL", "bBL"] as Persona[]) {
            it(`${p} cannot upload, overwrite or delete`, async () => {
                const s = ctx(env, p).storage()
                await assertFails(s.ref(`library/new-${p}.pdf`).put(bytes, { customMetadata: { orgId: A } }).then((t) => t))
                await assertFails(s.ref("library/a.pdf").put(bytes, { customMetadata: { orgId: A } }).then((t) => t))
                await assertFails(s.ref("library/a.pdf").updateMetadata({ customMetadata: { orgId: B } }))
                await assertFails(s.ref("library/b.pdf").delete())
            })
        }
    })
})

// Phase 5 lives in this file, not its own: the Storage emulator holds one
// rules set and one default bucket, so two Storage suites in parallel files
// race on clearStorage().
/**
 * Multi-tenant phase 5 — storage.rules widened to shared visibility. An
 * object's `visibleTo` metadata (comma list, written by the visibility job)
 * lists every tenant that may read it; without it the phase-2 rule stands
 * (metadata.orgId, missing = crc).
 */
describe("P5 storage.rules — library/** by visibleTo", () => {
    let env: RulesTestEnvironment
    const bytes = new Uint8Array([37, 80, 68, 70])

    beforeAll(async () => {
        env = await makeEnv("demo-p5-storage", { storage: true })
        await env.clearStorage()
        await env.withSecurityRulesDisabled(async (c) => {
            const root = c.storage().ref()
            const put = (p: string, md: Record<string, string>) => root.child(p).put(bytes, { contentType: "application/pdf", customMetadata: md })
            await put("library/sharedC.pdf", { orgId: C, visibleTo: `${C},${A}` })
            await put("library/privC.pdf", { orgId: C, visibleTo: C })
            await put("library/ownA.pdf", { orgId: A, visibleTo: A })
            await put("library/onlyOrgB.pdf", { orgId: B })
            await put("library/legacy.pdf", {})
            await put("library/unsharedNowC.pdf", { orgId: C, visibleTo: C })
        })
    }, 120_000)

    afterAll(async () => {
        await env.cleanup()
    })

    const read = (p: Persona, path: string) => ctx(env, p).storage().ref(path).getMetadata()

    const CAN: Array<[Persona, string]> = [
        ["aMe", "library/sharedC.pdf"],
        ["aAdmin", "library/sharedC.pdf"],
        ["dual", "library/sharedC.pdf"],
        ["oldBL", "library/sharedC.pdf"],
        ["po", "library/privC.pdf"],
        ["aMe", "library/ownA.pdf"],
        ["aMe", "library/legacy.pdf"],
        ["bBL", "library/onlyOrgB.pdf"],
    ]
    const CANNOT: Array<[Persona, string]> = [
        ["bBL", "library/sharedC.pdf"],
        ["aPe", "library/sharedC.pdf"],
        ["oldPending", "library/sharedC.pdf"],
        ["signedOut", "library/sharedC.pdf"],
        ["aMe", "library/privC.pdf"],
        ["aAdmin", "library/unsharedNowC.pdf"],
        ["bBL", "library/ownA.pdf"],
        ["aMe", "library/onlyOrgB.pdf"],
        ["bBL", "library/legacy.pdf"],
    ]
    for (const [p, path] of CAN) it(`${p} reads ${path}`, async () => void (await assertSucceeds(read(p, path))))
    for (const [p, path] of CANNOT) it(`${p} cannot read ${path}`, async () => void (await assertFails(read(p, path))))
    it("nobody writes library objects from the browser", async () => {
        await assertFails(ctx(env, "aAdmin").storage().ref("library/sharedC.pdf").put(bytes))
        await assertFails(ctx(env, "po").storage().ref("library/new.pdf").put(bytes))
    })
})
