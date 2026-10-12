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
 * gig-packet email button, the Drive sync card) and stored in the snapshot
 * beside this file. Rendering is per tenant (OrgProvider with the tenant's
 * compiled config) and per viewer (signed out, a musician, an admin with
 * mixer access).
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
        const prefs = Array.from(settings.container.querySelectorAll("span"))
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

describe("phase 6 golden: flag-touched surfaces as they render today", () => {
    for (const [name, config] of [["crc", CRC], ["brotherslazaroff", BL]] as const) {
        for (const v of VIEWERS) {
            it(`${name} / ${v}`, async () => {
                expect(await fingerprint(config, v)).toMatchSnapshot()
            })
        }
    }
})
