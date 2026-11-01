/**
 * Multi-tenant phase 7 — justified exceptions to the untranslated-string scan.
 *
 * Prefer an inline comment at the string (`// i18n-ignore: <reason>` on the
 * line or the line above, `{/* i18n-ignore: <reason> *\/}` in JSX): it lives
 * next to the code, so lanes never edit this shared file. Use this list only
 * for text that must stay verbatim and cannot carry a comment. Every entry
 * needs a reason; `text` is matched exactly against the finding's text.
 */
export interface AllowEntry {
    file: string
    text: string
    reason: string
}

/** Whole screens kept English by ruling; every literal on them is listed so the scan still notices new ones. */
const MIXER_CRC_ONLY = "Mixer is CRC-only by ruling (R-1012-mt, mixer stays CRC-only); never renders on a non-English tenant"
const TEST_HARNESS = "test harness, not a user screen"

function exempt(file: string, reason: string, texts: string[]): AllowEntry[] {
    return texts.map((text) => ({ file, text, reason }))
}

export const ALLOWLIST: readonly AllowEntry[] = [
    ...exempt("src/app/(main)/monitor/MonitorClient.tsx", MIXER_CRC_ONLY, [
        "Couldn't save starred channels — try again",
        "Sign in to access monitor controls.",
        "You don't have monitor access. Ask a sound engineer or admin to assign you a bus.",
        "Connecting to mixer...",
        "Make sure the bridge server is running on the production PC.",
        "Sound Engineer",
        "You do not have a personal monitor bus assigned to you. Use the tools below to manage the monitor system for the band.",
        "Waiting for mixer data...",
    ]),
    ...exempt("src/app/(main)/monitor/admin/page.tsx", MIXER_CRC_ONLY, [
        "Monitor Config Restricted",
        "Only Sound Engineers can configure monitor buses.",
    ]),
    ...exempt("src/components/monitor/BusAssignmentPanel.tsx", MIXER_CRC_ONLY, [
        "Failed to update bus assignment",
        "Added to Bus",
        "Removed from Bus",
        "Bus Assignments",
        "— Bus",
        "Bus",
        "Remove",
        "Add",
        "All users assigned",
    ]),
    ...exempt("src/components/monitor/ConnectionIndicator.tsx", MIXER_CRC_ONLY, [
        "Mixer offline — last known levels",
    ]),
    ...exempt("src/components/monitor/DefaultChannelPicker.tsx", MIXER_CRC_ONLY, [
        "Failed to save default channels",
        "Default Visible Channels",
        "of",
        "selected",
        "These channels appear in every musician's live monitor popup by default.",
        "Ch",
    ]),
    ...exempt("src/components/monitor/FaderStrip.tsx", MIXER_CRC_ONLY, [
        "Sending to the mixer…",
        "Level confirmed by the mixer",
        "No confirmation — reset to the mixer's level",
        "Refused by the mixer",
        "Level unknown — could not read this from the desk",
        "Level may be out of date — showing last known value",
        "Could not read this level from the desk",
    ]),
    ...exempt("src/components/monitor/MatrixPanel.tsx", MIXER_CRC_ONLY, [
        "Matrix data not available — bridge update may be required.",
        "Matrix Outputs",
        "Matrix",
    ]),
    ...exempt("src/components/monitor/MonitorTabs.tsx", MIXER_CRC_ONLY, [
        "Stale",
        "Live",
        "My Monitor",
        "Bus",
        "My Mix",
        "Channels",
        "Configure",
        "Matrix",
        "Master",
        "My Channels",
        "No channels in your mix yet. Go to the",
        "tab and tap",
        "to add channels.",
        "All Channels",
        "Tap",
        "to add to your mix",
        "Remove from my mix",
        "Add to my mix",
        "default",
        "No channels routed to this bus yet.",
        "No matrix outputs available.",
    ]),
    ...exempt("src/components/monitor/QuickMonitorPanel.tsx", MIXER_CRC_ONLY, [
        "Connecting to mixer...",
        "Mixer offline",
        "No monitor bus assigned",
        "My Monitor",
        "Bus",
        "Syncing…",
        "Stale",
        "Live",
        "Close monitor mix",
        "Master",
        "No channels starred",
    ]),
    ...exempt("src/components/monitor/VerticalFaderStrip.tsx", MIXER_CRC_ONLY, [
        "Sending to the mixer…",
        "Level confirmed by the mixer",
        "Refused by the mixer",
        "No confirmation — reset to the mixer's level",
        "Level unknown — could not read this from the desk",
        "Level may be out of date — showing last known value",
        "Could not read this level from the desk",
        "Mute",
        "Unmute",
    ]),
    ...exempt("src/app/test-login/TestLoginClient.tsx", TEST_HARNESS, [
        "Invalid or expired login link",
        "Test login links are single-use and expire after 5 minutes. Mint a fresh one with create_test_account.",
        "Signing in…",
    ]),
]
