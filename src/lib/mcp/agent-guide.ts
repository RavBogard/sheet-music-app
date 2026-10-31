import fs from "node:fs"
import { featuresOf } from "@/lib/org/features-client"
import path from "node:path"
import { logger } from "@/lib/logger"
import type { OrgConfig, OrgFeatures } from "@/lib/org/config-schema"
import { STRING_BASE, interpolate, tokensFor } from "@/lib/org/strings-base"
import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import type { OrgId } from "@/lib/org/types"
import { SERVICE_TYPE_CATALOG } from "@/lib/templates/service-types"

/**
 * Multi-tenant phase 4 — the MCP `instructions` each tenant's connector reads.
 *
 * Two modes (config `agentGuideMode`):
 *
 *   verbatim  — the tenant's guide is served exactly as written: its
 *               `agentGuide` text, or, when that is empty, the bundled
 *               `.paul/AGENT-GUIDE.md`. That file is CRC's own guide (Daniel,
 *               the rabbis, the booklets, the family repos run through every
 *               section), so CRC is served it unchanged, byte-for-byte what it
 *               was served before phase 4 (golden test).
 *   generated — a short header of facts from the tenant's config (name, kind,
 *               authors, service types, vocabulary, time zone, language,
 *               features), then the tenant's own `agentGuide` text, then the
 *               shared core below. Every tenant but CRC.
 *
 * A config without the field (an `orgs/{id}` document seeded before phase 4)
 * reads as verbatim for crc and generated for everyone else, so CRC's
 * instructions cannot change on a config-source switch.
 */

/**
 * W-01 Task 6 (moved from build-handler.ts): `.paul/AGENT-GUIDE.md`, read once
 * at module load. next.config.ts traces it into the /api/mcp function. Failure
 * is non-fatal: no instructions, exactly as before.
 */
function loadLegacyGuide(): string | undefined {
    try {
        const candidates = [
            path.join(process.cwd(), ".paul", "AGENT-GUIDE.md"),
            path.join(process.cwd(), "sheet-music-app", ".paul", "AGENT-GUIDE.md"),
        ]
        for (const p of candidates) {
            if (fs.existsSync(p)) return fs.readFileSync(p, "utf8")
        }
    } catch (err) {
        logger.warn("[mcp] failed to load AGENT-GUIDE.md for instructions", err)
    }
    return undefined
}

export const LEGACY_AGENT_GUIDE: string | undefined = loadLegacyGuide()

/**
 * The tenant-neutral core: the propose → confirm → commit policy every tenant's
 * agent follows, with no tenant's people, services or books in it. Only tools
 * on the authoring surface are named.
 */
export const AGENT_GUIDE_CORE = `## How to work here

You are a trustworthy collaborator, not a fast typist. The most important
thing is not to commit a large change silently in one turn. Stage first, show
your confidence, let the author confirm, then commit. These rules are standing
policy and override any instinct to just ship it.

## When to ask and when to proceed

Every chart match you propose carries a \`confidence\` taken from the library
row's \`titleSpecificity\`:

| confidence | titleSpecificity | typical title                         |
|------------|------------------|---------------------------------------|
| high       | >= 0.7           | a title with a clarifier, "Title (Arranger)" |
| medium     | 0.5–0.7          | a distinctive title with no clarifier |
| low        | < 0.5            | a generic title several charts share  |

- \`high\` → commit.
- \`medium\` → commit, and list the row in your summary so the author sees it.
- \`low\` and \`siblingsInCatalog > 1\` → stop and ask. Show the alternatives
  from \`search_library\` and let the author pick.
- \`low\` and \`siblingsInCatalog === 1\` → commit, and point the row out at
  the end.
- \`flags: ['no_library_record']\` → never commit. Ask, or search the library.

## Propose, confirm, commit

For any change touching more than two rows:

1. \`propose_setlist_changes(setlistId, proposals[])\` returns a \`stageId\`
   and, per row, \`confidence\`, \`flags\` and \`explanation\`. Nothing is
   written yet.
2. Show the proposal as a table (#, action, title, confidence, flags, notes)
   with a summary line: how many high, medium and low, that the stage expires
   in 10 minutes, and that the author can reply "commit" or say what to fix.
3. When the author confirms, call \`commit_staged_changes(stageId,
   lastSeenVersion)\`. Every add, update and removal lands in one transaction.
4. If the author wants a row changed, stage again. A stale-version rejection
   keeps the stage: re-read with \`get_setlist\` and commit with the new version.

Single-row changes need no stage: use \`update_track\` or
\`add_track_to_setlist\` directly.

Before you hand a setlist back, run \`verify_setlist_charts\` and go through
any row you committed at low confidence with the author. To fix a row, use
\`update_track\`, or \`swap_chart\` to refresh its title from the new chart.
On a chart change the row keeps a played key the author gave; otherwise it
takes the new chart's written key. Say \`keyChanged\` ("key now D, was E").

Nothing needs publishing. A setlist is live as soon as it exists, and
everything downstream selects by date. Never tell the author a setlist needs
publishing.

## Charts

- A chart you wrote in this chat: \`create_chart\` with mode 'preview' (shows
  the rendered page; nothing saved) until the author approves, then mode
  'commit' with bondTo, only on the author's word. Revise with
  revisionOf:<fileId>. Never ask the author to upload what you wrote.
- A Drive folder the author already has: \`import_drive_folder\`.
- A new version of a library chart (a revised PDF, "v2"): pass
  revisionOf:<the old fileId> to the intake you use. Upcoming setlists move to
  it; past setlists keep the chart they had. When a duplicate refusal lists
  \`matches\`, offer revisionOf before force.
- Never ask anyone to paste a file into the chat for upload.

When in doubt, stage with \`propose_setlist_changes\` rather than writing
directly. The propose, confirm, commit loop is the trust contract.`

const INBOX_LINE = `- Chart files from any device: \`get_chart_inbox\`, hand the author the Drive
  folder link, then \`sync_chart_inbox\` once the files are in.`

const FEATURE_LABELS: Record<keyof OrgFeatures, string> = {
    perform: "Perform mode",
    mixer: "monitor mixer",
    driveInbox: "chart inbox",
    notifyBand: "band notifications",
    schedulingEmails: "scheduling emails",
    todayFeed: "today feed",
}

const LANGUAGE_NAMES: Record<string, string> = { en: "English", he: "Hebrew" }

export type AgentGuideMode = "verbatim" | "generated"

/** The mode a config asks for; a config without the field: crc verbatim, others generated. */
export function agentGuideModeOf(config: Pick<OrgConfig, "id" | "agentGuideMode">): AgentGuideMode {
    return config.agentGuideMode ?? (config.id === DEFAULT_ORG_ID ? "verbatim" : "generated")
}

export interface TenantGuideFacts {
    config: OrgConfig
    /** Display names of the tenant's admins and band leaders. */
    authors: string[]
}

function list(items: string[]): string {
    if (items.length <= 1) return items.join("")
    if (items.length === 2) return `${items[0]} and ${items[1]}`
    return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`
}

/** The generated guide for a tenant. Pure; plain and short. */
export function renderTenantGuide({ config, authors }: TenantGuideFacts): string {
    const name = config.name
    const band = config.vocabulary.mode === "band"
    const setlistWord = interpolate(config.vocabulary.overrides.setlist ?? STRING_BASE.setlist, tokensFor(config))
    const eventWord = band ? "show" : "service"

    const facts: string[] = []
    if (authors.length > 0) {
        facts.push(`- People who build ${setlistWord}s here: ${list(authors)}.`)
    }
    if (setlistWord !== "setlist") {
        facts.push(`- A setlist is called a "${setlistWord}" here. Each one is for a ${eventWord}.`)
    } else {
        facts.push(`- Each setlist is for a ${eventWord}.`)
    }
    if (!band) {
        const types = config.liturgy.serviceTypes.length > 0
            ? config.liturgy.serviceTypes.map((s) => s.label)
            : SERVICE_TYPE_CATALOG.map((s) => s.label)
        facts.push(`- Service types: ${types.join(", ")}.`)
    }
    facts.push(
        `- Time zone: ${config.locale.timeZone}. Language: ${LANGUAGE_NAMES[config.locale.language] ?? config.locale.language}.`,
    )
    // Phase 6: the effective flags (the mixer is crc-only whatever the flag says).
    const features = featuresOf(config)
    const on = (Object.keys(FEATURE_LABELS) as Array<keyof OrgFeatures>).filter((k) => features[k])
    if (on.length > 0) facts.push(`- Switched on: ${on.map((k) => FEATURE_LABELS[k]).join(", ")}.`)

    const intro = band
        ? `This connection serves ${name}, a band, and no one else. Everything you read or change here is ${name}'s: its ${setlistWord}s, charts and people.`
        : `This connection serves ${name}, a congregation, and no one else. Everything you read or change here is ${name}'s: its ${setlistWord}s, charts and people.`

    let core = AGENT_GUIDE_CORE
    if (features.driveInbox) {
        core = core.replace("- A Drive folder the author already has:", `${INBOX_LINE}\n- A Drive folder the author already has:`)
    }

    const parts = [`# Agent Guide — ${name}`, intro, `## About ${name}\n\n${facts.join("\n")}`]
    const own = config.agentGuide.trim()
    if (own) parts.push(own)
    parts.push(core)
    return parts.join("\n\n") + "\n"
}

/**
 * The instructions for a tenant's connector. `config` null (a tenant whose
 * config cannot be read): crc gets its legacy guide, anyone else the core
 * alone, which names no tenant.
 */
export function tenantInstructions(
    orgId: OrgId,
    config: OrgConfig | null,
    authors: string[],
): string | undefined {
    if (!config) return orgId === DEFAULT_ORG_ID ? LEGACY_AGENT_GUIDE : `# Agent Guide\n\n${AGENT_GUIDE_CORE}\n`
    if (agentGuideModeOf(config) === "verbatim") {
        return config.agentGuide ? config.agentGuide : LEGACY_AGENT_GUIDE
    }
    return renderTenantGuide({ config, authors })
}
