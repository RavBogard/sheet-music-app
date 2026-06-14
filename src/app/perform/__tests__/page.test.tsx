import { describe, it, expect, vi, beforeEach } from "vitest"

// Cycle-12 F-C12-001 regression — the SSR-prefetched `initialSetlists`
// prop is the byte-equivalent of what crosses the RSC wire boundary to the
// anonymous browser (Next serializes the prop into `__next_f.push` chunks
// during SSR). Asserting on the prop at the page-component level is
// equivalent to asserting on the raw HTML body for the purposes of this
// fix: if the prop carries no `isTest:true` row, no test-uid-owned row,
// and ≤MAX_PUBLIC_SERVICES rows, the wire payload carries the same. This
// also keeps the test framework-friction-free (no preview deploy, no
// Playwright bootstrap, no fixture seed/cleanup) per the supervisor's
// "if SSR-bytes test framework adds friction > ~30 min" escape clause.

// `getAllSetlists` is the seam — mock it to return a synthetic leaky 44-row
// payload that mirrors the structure that triggered F-C12-001 (a c12 fixture
// clone, full hydrated track trees, owner UIDs, ownerName strings, and band-
// member personal emails) so the test fails if the SSR filter is bypassed
// or relocated back to the client useMemo.
const getAllSetlistsMock = vi.fn()
vi.mock("@/lib/server-setlists", () => ({
    getAllSetlists: (opts: unknown) => getAllSetlistsMock(opts),
}))

// PublicSetlistListing imports `useAuth` + `useWakeLock` + Firestore via its
// hooks; we render PerformPage as a JSX tree (NOT as a mounted React tree),
// so the client subtree never executes. Still mock the modules that get
// hoisted by ESM resolution so the component import doesn't blow up at
// load time.
vi.mock("@/lib/firebase", () => ({
    db: {},
    getDb: vi.fn(async () => ({})),
    subscribeWithDb: vi.fn(() => () => {}),
    auth: {},
    googleProvider: {},
}))
vi.mock("@/lib/auth-context", () => ({
    useAuth: () => ({ user: null, loading: false, signIn: vi.fn() }),
}))

// v11-04-01: the page now reads the Edge-resolved `x-org-id` header to scope the
// SSR fetch per tenant. Mock `next/headers` so PerformPage can run outside a real
// request scope; default the probe org to crc (the regression assertions below
// are org-agnostic — they exercise the wire-slice filter, not tenant routing).
let mockOrgHeader: string | null = "crc"
vi.mock("next/headers", () => ({
    headers: async () => new Headers(mockOrgHeader ? { "x-org-id": mockOrgHeader } : {}),
}))

// `isTestUid` is the test-uid-prefix detector that splitPublicSetlists relies on
// for the belt-and-braces filter (Cycle-2 SEC-004 + Cycle-7). Don't mock it
// here — the real implementation is what we want to exercise.

const makeRow = (overrides: Partial<Record<string, unknown>>) => ({
    id: overrides.id ?? "00000000-0000-0000-0000-000000000000",
    name: overrides.name ?? "Generic Setlist",
    eventDate: overrides.eventDate ?? "2026-06-15T10:00:00Z",
    date: overrides.date ?? "2026-05-20T12:00:00Z",
    isTest: overrides.isTest ?? false,
    ownerId: overrides.ownerId ?? "real-user-uid-12345",
    ownerName: overrides.ownerName ?? "Real User",
    tracks: overrides.tracks ?? [],
    trackCount: overrides.trackCount ?? 0,
    songCount: overrides.songCount ?? 0,
})

// Member-email substrings that the cowork run found leaking in the real
// SSR payload. The test asserts these never reappear in JSON.stringify of
// the prop the page renders.
const LEAKED_MEMBER_EMAILS = [
    "andrewwarshauer@gmail.com",
    "benjamminreece@gmail.com",
    "brynsentnor@gmail.com",
    "davidlazaroff@gmail.com",
    "engineer.brodsky@gmail.com",
]

// v11.3-04-03 streaming refactor: PerformPage now returns
// `<Suspense fallback={…}><PerformListing/></Suspense>`, so the SSR wire slice
// (`initialSetlists`) is a prop of the INNER async `PerformListing`, not of
// PerformPage's top-level element. `PerformListing` isn't exported (page files
// only export the default + route config), so we reach it through the Suspense
// element's `children.type` and invoke it to read the slice it builds — the same
// `selectVisiblePublicSetlists` boundary filter, just relocated into the child.
type WireRow = { id?: string; isTest?: boolean; ownerId?: string; [k: string]: unknown }
async function renderInitialSetlists(): Promise<WireRow[]> {
    const { default: PerformPage } = await import("@/app/perform/page")
    const tree = PerformPage() as unknown as {
        props: { children: { type: () => Promise<{ props: { initialSetlists: WireRow[] } }> } }
    }
    const listing = await tree.props.children.type()
    return listing.props.initialSetlists
}

describe("perform/page.tsx — F-C12-001 SSR wire-bytes regression", () => {
    beforeEach(() => {
        getAllSetlistsMock.mockReset()
    })

    it("drops isTest:true rows from the SSR-prefetched initialSetlists prop", async () => {
        // 1 c12-fixture clone (isTest:true) + 4 real upcoming services.
        // Pre-fix, all 5 would cross the wire; post-fix the fixture is gone.
        const c12FixtureId = "811adcf7-f9b6-40b2-8144-c13a4af998ce"
        getAllSetlistsMock.mockResolvedValue([
            makeRow({
                id: c12FixtureId,
                name: "[CYCLE12-saturday] c12 Bnei Mitzvah readiness probe",
                isTest: true,
                eventDate: "2026-05-30T10:00:00Z",
                ownerName: "Daniel Bogard",
            }),
            makeRow({ id: "real-1", name: "Kabbalat Shabbat", eventDate: "2026-05-29T18:00:00Z" }),
            makeRow({ id: "real-2", name: "Shabbat Morning", eventDate: "2026-05-30T10:00:00Z" }),
            makeRow({ id: "real-3", name: "Erev Shavuot", eventDate: "2026-06-01T18:00:00Z" }),
            makeRow({ id: "real-4", name: "Shavuot Morning", eventDate: "2026-06-02T10:00:00Z" }),
        ])

        const prop = await renderInitialSetlists()

        expect(prop.some((r) => r.id === c12FixtureId)).toBe(false)
        expect(prop.some((r) => r.isTest === true)).toBe(false)
        expect(JSON.stringify(prop)).not.toContain('"isTest":true')
        // No isTest:"true" stringified variants either.
        expect(JSON.stringify(prop)).not.toMatch(/\[CYCLE12-/)
    })

    it("drops test-uid-owned rows even when isTest is absent (Cycle-7 belt-and-braces)", async () => {
        // Legacy seed without isTest set, owned by a test-prefixed uid.
        getAllSetlistsMock.mockResolvedValue([
            makeRow({
                id: "legacy-test-row",
                name: "[probe] cycle-7 fixture",
                ownerId: "test-c7-probe-001",
                eventDate: "2026-05-30T10:00:00Z",
            }),
            makeRow({ id: "real-1", name: "Kabbalat Shabbat", eventDate: "2026-05-29T18:00:00Z" }),
        ])

        const prop = await renderInitialSetlists()

        expect(prop.some((r) => r.id === "legacy-test-row")).toBe(false)
        expect(prop.some((r) => (r.ownerId ?? "").startsWith("test-"))).toBe(false)
    })

    it("caps the SSR-prefetched prop at MAX_PUBLIC_SERVICES (=5) rows", async () => {
        // 8 real upcoming services. Pre-fix the wire would carry all 8 (in
        // fact up to 50); post-fix exactly 5 cross the boundary.
        const rows = Array.from({ length: 8 }, (_, i) =>
            makeRow({
                id: `real-${i}`,
                name: `Future Service ${i}`,
                eventDate: `2026-06-${String(i + 1).padStart(2, "0")}T18:00:00Z`,
            }),
        )
        getAllSetlistsMock.mockResolvedValue(rows)

        const prop = await renderInitialSetlists()

        expect(prop.length).toBe(5)
    })

    it("strips member personal emails and other unrelated rows from the wire payload", async () => {
        // 44-row mixed payload — 1 leaky fixture + 5 visible + 38 noise rows
        // (each owner-tagged with a band-member personal Gmail in `ownerName`
        // OR a `lastModifiedBy` field — the same shape the real prod payload
        // surfaced in the cowork run). Pre-fix all 44 cross the wire; post-fix
        // only the 5 visible upcoming services do, and none of the noise
        // emails appear in the JSON.stringify of the prop.
        const visible = Array.from({ length: 5 }, (_, i) =>
            makeRow({
                id: `visible-${i}`,
                name: `Visible Service ${i}`,
                eventDate: `2026-06-${String(i + 1).padStart(2, "0")}T18:00:00Z`,
            }),
        )
        const noise = LEAKED_MEMBER_EMAILS.flatMap((email, i) =>
            Array.from({ length: 8 }, (_, j) =>
                makeRow({
                    id: `noise-${i}-${j}`,
                    name: `Past Service`,
                    // Past — well outside the visible upcoming window.
                    eventDate: `2025-01-${String((j % 28) + 1).padStart(2, "0")}T18:00:00Z`,
                    ownerName: email,
                    // Pretend the past noise rows have full hydrated tracks
                    // exposing the email in nested fields too — the real prod
                    // payload had ~298 songId entries across 17 hydrated rows.
                    tracks: [{ id: `t-${i}-${j}`, lastModifiedBy: email, notes: `set by ${email}` }],
                }),
            ),
        )
        getAllSetlistsMock.mockResolvedValue([...visible, ...noise])

        const prop = await renderInitialSetlists()
        const serialized = JSON.stringify(prop)

        expect(prop.length).toBe(5)
        for (const email of LEAKED_MEMBER_EMAILS) {
            expect(serialized).not.toContain(email)
        }
        // Sanity: the 5 visible service names ARE present.
        expect(serialized).toContain("Visible Service 0")
        expect(serialized).toContain("Visible Service 4")
    })

    it("forwards an empty array when getAllSetlists returns []", async () => {
        getAllSetlistsMock.mockResolvedValue([])
        expect(await renderInitialSetlists()).toEqual([])
    })

    it("v11-04-01: scopes the SSR fetch to the host's tenant (passes the coerced org)", async () => {
        mockOrgHeader = "brotherslazaroff"
        getAllSetlistsMock.mockResolvedValue([])
        await renderInitialSetlists()
        expect(getAllSetlistsMock).toHaveBeenCalledWith({ limit: 50, org: "brotherslazaroff" })
        mockOrgHeader = "crc" // restore default for any later cases
    })
})
