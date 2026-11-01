import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactElement } from "react"

/**
 * Multi-tenant phase 6 (lane 2) — golden captures of every browser surface a
 * feature flag touches, for CRC and Brothers Lazaroff, recorded on the code as
 * it was before the flags were wired (master 96e937d6).
 *
 * Each surface is reduced to a fingerprint (the nav links and their targets,
 * the tab-bar buttons and where "Open setlist" goes, the Manage tabs, the
 * Perform toolbar's monitor buttons, the scheduling-notification toggles, the
 * gig-packet email button, the Drive sync card). The capture taken on the
 * unchanged code (commit 1fefde19, then a vitest snapshot) is
 * `feature-surfaces.today.json` beside this file. Rendering is per tenant
 * (OrgProvider with the tenant's compiled config) and per viewer (signed
 * out, a musician, an admin with mixer access).
 *
 * After the flags were wired: CRC (every flag on) must render exactly the
 * capture. Brothers Lazaroff must render the capture minus only what its own
 * flags switch off (`withFlags` below lists, per flag, the exact UI each one
 * removes) -- so whatever lane 1 sets BL's flags to, this test names every
 * BL difference. A throwaway tenant with one flag off proves that flag's UI
 * goes and nothing else does.
 */

const h = vi.hoisted(() => ({
    auth: {} as Record<string, unknown>,
    monitorAccess: false,
    pathname: "/setlists",
    push: vi.fn(),
}))

vi.mock("@/lib/auth-context", () => ({ useAuth: () => h.auth }))
vi.mock("next/navigation", () => ({
    usePathname: () => h.pathname,
    useRouter: () => ({ push: h.push, back: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    useParams: () => ({ id: "setlist-1" }),
}))
vi.mock("@/hooks/use-monitor-access", () => ({
    useMonitorAccess: () => ({ hasAccess: h.monitorAccess, isAdmin: false, isSoundEngineer: false, hasBusAssigned: false, loading: false }),
}))
vi.mock("@/hooks/use-monitor-connection", () => ({ useMonitorConnection: () => ({ client: null }) }))
// Today every tenant's congregation store carries features {monitor, ai, audio, collaboration} all true.
vi.mock("@/lib/congregation-store", () => ({
    useCongregation: () => ({
        shortName: "Short",
        logoUrl: "",
        features: { monitor: true, ai: true, audio: true, collaboration: true },
    }),
}))
vi.mock("@/lib/library-store", () => ({
    useLibraryStore: (sel?: (s: { allFiles: unknown[] }) => unknown) => (sel ? sel({ allFiles: [] }) : { allFiles: [] }),
}))
const musicState = vi.hoisted(() => ({
    setQueue: () => {},
    queueIndex: 0,
    playbackQueue: [] as unknown[],
    aiState: { isEnabled: false, pageData: {}, scanningPages: [], error: null },
    setAiEnabled: () => {},
    capoFret: null,
    transposition: 0,
    zoom: 1,
    setZoom: () => {},
    fitMode: "width",
    setFitMode: () => {},
    currentSetlistId: null,
    jumpToSong: () => {},
}))
vi.mock("@/lib/store", () => ({
    useMusicStore: Object.assign(
        (sel?: (s: Record<string, unknown>) => unknown) => (typeof sel === "function" ? sel(musicState) : musicState),
        { getState: () => musicState },
    ),
}))
vi.mock("@/hooks/use-library", () => ({ useLibrary: () => ({ refetch: () => {} }) }))
vi.mock("@/components/nav/NotificationBell", () => ({ NotificationBell: () => null }))
vi.mock("@/components/nav/OrgLogo", () => ({ OrgLogo: () => null }))
vi.mock("@/build-info.json", () => ({ default: { version: "test", commit: "x", builtAt: "" } }))
vi.mock("@/components/monitor/QuickMonitorPanel", () => ({ QuickMonitorPanel: () => <div>quick-monitor</div> }))
vi.mock("@/lib/firebase", () => ({
    getDb: () => Promise.reject(new Error("no db in golden")),
    auth: {},
    subscribeWithDb: () => () => {},
}))
// Manage sections other than the tab strip are not under test.
vi.mock("@/components/admin/PeopleSection", () => ({ PeopleSection: () => null }))
vi.mock("@/components/admin/people/AccessAuditLog", () => ({ AccessAuditLog: () => null }))
vi.mock("@/components/admin/SoundSystemSection", () => ({ SoundSystemSection: () => null }))
vi.mock("@/components/library/DuplicateScanner", () => ({ DuplicateScanner: () => null }))
vi.mock("@/components/library/PDFHealthScanner", () => ({ PDFHealthScanner: () => null }))
// Perform toolbar children.
vi.mock("@/components/music/TransposerMenu", () => ({ TransposerMenu: () => null }))
vi.mock("@/components/music/ChordEditBar", () => ({ ChordEditBar: () => null }))
vi.mock("@/components/performance/MetronomeControl", () => ({ MetronomeControl: () => null }))
vi.mock("@/components/performance/SongNavigation", () => ({ SongNavigation: () => null }))
vi.mock("@/components/performance/SetlistDrawer", () => ({ SetlistDrawer: () => null }))
// Settings + print modal data.
vi.mock("@/lib/musician-profile", () => ({
    subscribeToMusicianProfile: (_uid: string, cb: (p: unknown) => void) => {
        cb({})
        return () => {}
    },
    saveMusicianProfile: async () => {},
    fetchTenantMusicianProfiles: async () => [],
    INSTRUMENT_PRESETS: {},
}))
vi.mock("@/lib/api-client", () => ({ apiFetch: async () => ({ ok: false, json: async () => ({}), text: async () => "" }) }))
vi.mock("sonner", () => ({ toast: { success: () => {}, error: () => {}, warning: () => {} } }))
vi.mock("@/components/setlist/PrintModeSelector", () => ({ PrintModeSelector: () => null }))
vi.mock("@/components/setlist/PrintStats", () => ({ PrintStats: () => null }))

import { OrgProvider } from "@/lib/org/org-context"
import { OrgConfigSchema, type OrgFeatures } from "@/lib/org/config-schema"
import { featuresOf } from "@/lib/org/features-client"
import today from "./feature-surfaces.today.json"
import { codeOrgConfig } from "@/lib/org/config-code"
import type { OrgConfig } from "@/lib/org/config-schema"
import { DesktopHeader } from "@/components/nav/DesktopHeader"
import { MobileMenuDrawer } from "@/components/nav/MobileMenuDrawer"
import { MobileTabBar } from "@/components/nav/MobileTabBar"
import ManageClient from "@/app/(main)/manage/ManageClient"
import { PerformanceToolbar } from "@/components/performance/PerformanceToolbar"
import { MusicianProfileSettings } from "@/components/settings/MusicianProfileSettings"
import { PrintModal } from "@/components/setlist/PrintModal"
import { LibraryDataSection } from "@/components/admin/LibraryDataSection"

beforeAll(() => {
    const g = globalThis as unknown as Record<string, unknown>
    if (typeof g.ResizeObserver !== "function") g.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} }
    const proto = Element.prototype as unknown as Record<string, unknown>
    for (const fn of ["scrollIntoView", "hasPointerCapture", "setPointerCapture", "releasePointerCapture"]) {
        if (typeof proto[fn] !== "function") proto[fn] = function () {}
    }
})
afterEach(() => {
    cleanup()
    h.push.mockReset()
    try { sessionStorage.clear() } catch { /* jsdom */ }
})

type Viewer = "signedOut" | "musician" | "admin"
const VIEWERS: Viewer[] = ["signedOut", "musician", "admin"]

function setViewer(v: Viewer) {
    const user = v === "signedOut" ? null : { uid: "u1", displayName: "Pat", email: "p@x.org", photoURL: null }
    const role = v === "signedOut" ? null : v === "admin" ? "admin" : "musician"
    h.auth = {
        user,
        profile: null,
        role,
        loading: false,
        isMember: v !== "signedOut",
        isMusician: v !== "signedOut",
        isBandLeader: v === "admin",
        isAdmin: v === "admin",
        isPlatformOwner: false,
        isSoundEngineer: false,
        signIn: () => {},
        signOut: () => {},
    }
    h.monitorAccess = v === "admin"
}

function inOrg(config: OrgConfig, ui: ReactElement) {
    return render(<OrgProvider orgId={config.id} config={config}>{ui}</OrgProvider>)
}

const links = (root: ParentNode) =>
    Array.from(root.querySelectorAll("a")).map((a) => `${(a.textContent ?? "").trim()} -> ${a.getAttribute("href")}`)

/** The fingerprint of every flag-touched surface for one tenant and viewer. */
async function fingerprint(config: OrgConfig, v: Viewer): Promise<Record<string, unknown>> {
    setViewer(v)
    const out: Record<string, unknown> = {}

    const desk = inOrg(config, <DesktopHeader />)
    out.desktopNav = links(desk.container.querySelector("nav")!)
    desk.unmount()

    inOrg(config, <MobileMenuDrawer open onOpenChange={() => {}} />)
    out.drawer = links(document.body).filter((l) => !l.startsWith("Changelog"))
    cleanup()

    const tab = inOrg(config, <MobileTabBar />)
    out.tabBar = Array.from(tab.container.querySelectorAll("button")).map((b) => b.getAttribute("aria-label"))
    fireEvent.click(screen.getByRole("button", { name: "Open setlist" }))
    await waitFor(() => expect(h.push).toHaveBeenCalled())
    out.openSetlistGoesTo = h.push.mock.calls[0][0]
    tab.unmount()
    h.push.mockReset()

    if (v !== "signedOut") {
        const manage = inOrg(config, <ManageClient serverIsAdmin={v === "admin"} />)
        out.manageTabs = Array.from(manage.container.querySelectorAll('[role="tab"]')).map((t) => (t.textContent ?? "").trim())
        manage.unmount()

        const lib = inOrg(config, <LibraryDataSection />)
        await waitFor(() => expect(lib.container.textContent).toContain("Archived Songs"))
        out.librarySyncCard = (lib.container.textContent ?? "").includes("Library Sync")
        lib.unmount()

        const settings = inOrg(config, <MusicianProfileSettings />)
        await waitFor(() => expect(settings.container.textContent).toContain("Scheduling Notifications"))
        // The toggle names are <label htmlFor> on their switches since the
        // 2026-10-31 a11y fix (they were <span>); the capture is the same text.
        const prefs = Array.from(settings.container.querySelectorAll("span, label"))
            .map((s) => (s.textContent ?? "").trim())
            .filter((t) => t === "Email" || t === "SMS" || t === "Push")
        out.schedulingNotificationToggles = prefs
        settings.unmount()
    }

    const toolbar = inOrg(config, <PerformanceToolbar onHome={() => {}} />)
    out.performMonitorButtons = toolbar.container.querySelectorAll('button[aria-label="Monitor mix"]').length
    toolbar.unmount()

    await act(async () => {
        inOrg(config, <PrintModal setlistName="Gig" tracks={[]} onClose={() => {}} setlistId="setlist-1" />)
    })
    out.emailPacketsButton = !!screen.queryByRole("button", { name: /Email Packet Links to Band/ })
    cleanup()

    return out
}

const CRC = codeOrgConfig("crc")!
const BL = codeOrgConfig("brotherslazaroff")!

type Print = Record<string, unknown>
const without = (list: unknown, item: string) => (list as string[]).filter((x) => x !== item)

/**
 * The capture with the UI of every switched-off flag taken away -- the whole
 * list of what each flag removes from these surfaces.
 */
function withFlags(capture: Print, f: OrgFeatures): Print {
    const out: Print = structuredClone(capture)
    if (!f.mixer) {
        out.desktopNav = without(out.desktopNav, "Monitor -> /monitor")
        out.drawer = without(out.drawer, "Monitor -> /monitor")
        out.tabBar = without(out.tabBar, "Monitor")
        if (out.manageTabs) out.manageTabs = without(out.manageTabs, "Sound")
        out.performMonitorButtons = 0
    }
    if (!f.driveInbox && "librarySyncCard" in out) out.librarySyncCard = false
    if (!f.schedulingEmails && out.schedulingNotificationToggles) {
        out.schedulingNotificationToggles = without(out.schedulingNotificationToggles, "Email")
    }
    if (!f.notifyBand) out.emailPacketsButton = false
    if (!f.perform) {
        const relink = (l: string) => (l === "Setlists -> /perform" ? "Setlists -> /setlists" : l)
        out.desktopNav = (out.desktopNav as string[]).map(relink)
        out.drawer = (out.drawer as string[]).map(relink)
        out.openSetlistGoesTo = "/setlists"
    }
    // todayFeed has no browser UI (the feed is a cron and a public file).
    return out
}

const ALL_ON: OrgFeatures = { mixer: true, driveInbox: true, schedulingEmails: true, todayFeed: true, notifyBand: true, perform: true }
const TODAY = today as Record<"crc" | "brotherslazaroff", Record<Viewer, Print>>

function throwaway(features: Partial<OrgFeatures>, id = "throwaway"): OrgConfig {
    return OrgConfigSchema.parse({ ...CRC, id, domains: { primary: `${id}.vercel.app`, aliases: [] }, features: { ...ALL_ON, ...features } })
}

describe("phase 6 golden: CRC renders exactly as before", () => {
    for (const v of VIEWERS) {
        it(`crc / ${v}`, async () => {
            expect(featuresOf(CRC)).toEqual(ALL_ON)
            expect(await fingerprint(CRC, v)).toEqual(TODAY.crc[v])
        })
    }
})

describe("phase 6 golden: Brothers Lazaroff renders as before minus only its own switched-off flags", () => {
    for (const v of VIEWERS) {
        it(`brotherslazaroff / ${v}`, async () => {
            expect(await fingerprint(BL, v)).toEqual(withFlags(TODAY.brotherslazaroff[v], featuresOf(BL)))
        })
    }
})

describe("phase 6: each flag switched off on a throwaway tenant removes its UI", () => {
    // A throwaway tenant has no mixer whatever its flag says (CRC-only data), so
    // its all-on render is CRC's capture minus the mixer.
    it("throwaway tenant, every flag on: CRC's surfaces minus the mixer", async () => {
        for (const v of VIEWERS) {
            expect(await fingerprint(throwaway({}), v)).toEqual(withFlags(TODAY.crc[v], { ...ALL_ON, mixer: false }))
        }
    })

    it("mixer off on crc itself: Monitor link, Monitor tab, Sound tab and Perform monitor button go", async () => {
        const p = await fingerprint(throwaway({ mixer: false }, "crc"), "admin")
        expect(p.desktopNav).not.toContain("Monitor -> /monitor")
        expect(p.drawer).not.toContain("Monitor -> /monitor")
        expect(p.tabBar).not.toContain("Monitor")
        expect(p.manageTabs).not.toContain("Sound")
        expect(p.performMonitorButtons).toBe(0)
        expect(p).toEqual(withFlags(TODAY.crc.admin, { ...ALL_ON, mixer: false }))
    })

    it("mixer flag on for a tenant other than crc still shows no mixer", async () => {
        const p = await fingerprint(throwaway({ mixer: true }), "admin")
        expect(p.desktopNav).not.toContain("Monitor -> /monitor")
        expect(p.manageTabs).not.toContain("Sound")
        expect(p.performMonitorButtons).toBe(0)
    })

    const cases: Array<[keyof OrgFeatures, (p: Print) => void]> = [
        ["driveInbox", (p) => expect(p.librarySyncCard).toBe(false)],
        ["schedulingEmails", (p) => expect(p.schedulingNotificationToggles).toEqual(["SMS", "Push"])],
        ["notifyBand", (p) => expect(p.emailPacketsButton).toBe(false)],
        ["todayFeed", () => {}],
    ]
    for (const [flag, gone] of cases) {
        it(`${flag} off: its UI goes and nothing else changes`, async () => {
            const f = { ...ALL_ON, mixer: false, [flag]: false }
            for (const v of VIEWERS) {
                const p = await fingerprint(throwaway({ [flag]: false }), v)
                expect(p).toEqual(withFlags(TODAY.crc[v], f))
                if (v === "admin") gone(p)
            }
        })
    }

    it("perform off: the public-listing nav link and the setlist button no longer lead into Perform", async () => {
        for (const v of VIEWERS) {
            const p = await fingerprint(throwaway({ perform: false }), v)
            expect(p).toEqual(withFlags(TODAY.crc[v], { ...ALL_ON, mixer: false, perform: false }))
            expect(p.desktopNav).not.toContain("Setlists -> /perform")
            expect(p.drawer).not.toContain("Setlists -> /perform")
            expect(p.openSetlistGoesTo).toBe("/setlists")
        }
    })
})
