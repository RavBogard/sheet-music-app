import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, screen } from "@testing-library/react"

/** Phase 7 i18n: CreationWizard (new setlist dialog) comes through t(), in every offer-strip state. */

let wizardState: Record<string, unknown> = {}
const noop = () => {}
function makeWizard(over: Record<string, unknown>) {
    return {
        selectedTemplate: null, setSelectedTemplate: noop, templateKeys: [],
        name: "", setName: noop, eventDate: null, setEventDate: noop,
        rabbi: "", setRabbi: noop, tracks: [], setTracks: noop, addSongsFromFiles: noop,
        musicians: [], setMusicians: noop, mode: "scratch", setMode: noop,
        inferredServiceType: null, cloneSource: null, cloneSourceLoading: false,
        canCreate: false, creating: false, create: async () => {}, reset: noop,
        ...over,
    }
}

vi.mock("@/hooks/use-creation-wizard", () => ({ useCreationWizard: () => wizardState }))
vi.mock("@/lib/congregation-store", () => ({
    useCongregation: () => ({ scheduling: { rabbiProfiles: [{ name: "Rabbi Test" }] } }),
}))

import { renderPseudo, renderWithI18n, expectNoUntranslatedText } from "@/test-utils/i18n"
import { CreationWizard } from "../CreationWizard"

const DATE = new Date(2026, 2, 6)
const STATES: Array<Record<string, unknown>> = [
    {},
    { eventDate: DATE, inferredServiceType: "friday_night", cloneSourceLoading: true },
    { eventDate: DATE, inferredServiceType: "friday_night", cloneSource: { id: "s1", name: "Test Setlist A", eventDate: new Date(2026, 1, 27) }, mode: "clone", canCreate: true },
    { eventDate: DATE, inferredServiceType: "shabbat_morning", mode: "template" },
    { eventDate: DATE, inferredServiceType: "friday_night", creating: true },
]

// "Close" is the shared ui/dialog close button (not this lane's file); "·" is a separator glyph.
const ALLOW: Array<string | RegExp> = ["Close", "·"]

function renderStates(rtl: boolean) {
    let last
    for (const s of STATES) {
        wizardState = makeWizard(s)
        last = renderPseudo(<CreationWizard open onOpenChange={() => {}} />, { rtl })
        expectNoUntranslatedText(document.body, { allow: ALLOW })
        if (s !== STATES[STATES.length - 1]) cleanup()
    }
    return last!
}

describe("CreationWizard i18n (pseudo-locale)", () => {
    afterEach(() => cleanup())

    it("qps: every state comes through t()", () => {
        renderStates(false)
    })

    it("qps-rtl: renders rtl with no untranslated text", () => {
        const r = renderStates(true)
        expect(r.container.querySelector('[dir="rtl"]')).not.toBeNull()
    })

    it("en: clone offer and tenant vocabulary keep today's English", () => {
        wizardState = makeWizard(STATES[2])
        renderWithI18n(<CreationWizard open onOpenChange={() => {}} />)
        expect(screen.getByText("Clone last Erev Shabbat")).toBeTruthy()
        expect(screen.getByText("(Feb 27)")).toBeTruthy()
        expect(screen.getByText("March 6th, 2026")).toBeTruthy()
        expect(screen.getByText("New Setlist")).toBeTruthy()
        expect(screen.getByText("Clone Setlist")).toBeTruthy()
        cleanup()
        wizardState = makeWizard({ eventDate: DATE, inferredServiceType: "friday_night" })
        renderWithI18n(<CreationWizard open onOpenChange={() => {}} />)
        expect(screen.getByText("No prior Erev Shabbat to clone yet — pick a template or start from scratch below.")).toBeTruthy()
        expect(screen.getByPlaceholderText("e.g., Shabbat Morning, Friday Night...")).toBeTruthy()
        expect(screen.getByText("Create Setlist")).toBeTruthy()
    })
})
