import { describe, expect, it } from "vitest"
import { OPS_TOOLS, forSurface, surfaceFor } from "../surfaces"

/**
 * Audit item (p) — the split of the 144-tool surface.
 *
 * The risk in a split is not that a tool lands on the wrong server. It is that
 * a tool lands on NEITHER and nobody notices until Daniel reaches for it mid-
 * week and it is simply not in the menu. So the assertions here are about the
 * partition itself: every tool on exactly one surface, nothing dropped, and a
 * brand-new tool defaulting to authoring rather than vanishing.
 */

function fakeServer() {
    const registered: string[] = []
    const server = {
        registerTool(name: string, _config?: unknown, _handler?: unknown) {
            registered.push(name)
            return { name }
        },
        somethingElse: () => "untouched",
    }
    return { server, registered }
}

describe("surfaceFor — the partition", () => {
    it("routes a backfill, a dedupe, a bridge restart and a credential to ops", () => {
        for (const t of [
            "backfill_content_hash",
            "dedupe_library",
            "bridge_restart",
            "mint_admin_bearer",
            "dump_collection_size",
            "cleanup_all_test_data",
        ]) {
            expect(surfaceFor(t), t).toBe("ops")
        }
    })

    it("keeps the week's work on authoring", () => {
        for (const t of [
            "create_setlist",
            "add_track_to_setlist",
            "reorder_setlist",
            "upload_chart",
            "search_library",
            "lookup_book_page",
            "list_musicians",
            "assign_musician",
            "notify_band",
        ]) {
            expect(surfaceFor(t), t).toBe("authoring")
        }
    })

    it("keeps the live mixing surface on authoring while bridge housekeeping goes to ops", () => {
        // A sound engineer touches these during a service; restarting the
        // bridge is not something anyone does with the band on stage.
        for (const t of ["list_monitor_buses", "get_mix", "set_send_level", "set_bus_fader"]) {
            expect(surfaceFor(t), t).toBe("authoring")
        }
        for (const t of ["bridge_restart", "bridge_resync", "bridge_get_log"]) {
            expect(surfaceFor(t), t).toBe("ops")
        }
    })

    it("keeps editing a library row on authoring even though the AI review queue is ops", () => {
        expect(surfaceFor("edit_library_entry")).toBe("authoring")
        expect(surfaceFor("edit_enrichment")).toBe("ops")
        expect(surfaceFor("list_review_queue")).toBe("ops")
    })

    it("sends an unknown tool to authoring — a new tool must not vanish", () => {
        expect(surfaceFor("some_tool_added_next_year")).toBe("authoring")
    })
})

describe("forSurface — registration is filtered, nothing else is", () => {
    it("an authoring server registers the authoring tool and drops the ops one", () => {
        const { server, registered } = fakeServer()
        const filtered = forSurface(server as never, "authoring")
        filtered.registerTool("create_setlist", {}, async () => ({ content: [] }))
        filtered.registerTool("backfill_content_hash", {}, async () => ({ content: [] }))
        expect(registered).toEqual(["create_setlist"])
    })

    it("an ops server is the exact complement", () => {
        const { server, registered } = fakeServer()
        const filtered = forSurface(server as never, "ops")
        filtered.registerTool("create_setlist", {}, async () => ({ content: [] }))
        filtered.registerTool("backfill_content_hash", {}, async () => ({ content: [] }))
        expect(registered).toEqual(["backfill_content_hash"])
    })

    it("every tool reaches exactly one of the two servers", () => {
        const names = [
            "create_setlist",
            "backfill_content_hash",
            "list_musicians",
            "bridge_restart",
            "get_mix",
            "mint_setlist_reader_bearer",
            "brand_new_tool",
        ]
        const a = fakeServer()
        const o = fakeServer()
        for (const n of names) {
            forSurface(a.server as never, "authoring").registerTool(n, {}, async () => ({ content: [] }))
            forSurface(o.server as never, "ops").registerTool(n, {}, async () => ({ content: [] }))
        }
        // No tool on both, no tool on neither.
        expect([...a.registered, ...o.registered].sort()).toEqual([...names].sort())
        expect(a.registered.filter((n) => o.registered.includes(n))).toEqual([])
    })

    it("passes every other property straight through to the real server", () => {
        const { server } = fakeServer()
        const filtered = forSurface(server as never, "ops") as unknown as {
            somethingElse: () => string
        }
        expect(filtered.somethingElse()).toBe("untouched")
    })
})

describe("OPS_TOOLS — the list itself", () => {
    it("has no duplicates and is not accidentally empty or enormous", () => {
        expect(OPS_TOOLS.size).toBe(47)
    })

    it("keeps the hygiene sweeps that still find live drift", () => {
        for (const t of [
            "backfill_content_hash",
            "backfill_heal_metadata",
            "backfill_track_mimetype",
            "backfill_library_index",
            "backfill_setlist_test_flag",
        ]) {
            expect(OPS_TOOLS.has(t), t).toBe(true)
        }
    })

    it("has retired the one true one-shot", () => {
        expect(OPS_TOOLS.has("seed_legacy_dedupe_run")).toBe(false)
    })
})
