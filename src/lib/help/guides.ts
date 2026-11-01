/**
 * The four one-page Help guides (/help). The wording lives in the catalogue
 * (src/i18n/{en,he}/helpGuides.json) and mirrors docs/guides/*.md, which stay
 * the source of truth: this file only says which catalogue keys make up each
 * guide and in what order, so the pages render the same steps, in the same
 * order, in every language.
 */

export const HELP_SLUGS = ["michael", "drew", "before", "after"] as const
export type HelpSlug = (typeof HELP_SLUGS)[number]

export type HelpBlock =
    | { kind: "heading"; key: string }
    | { kind: "p"; key: string }
    /** Numbered steps. */
    | { kind: "ol"; keys: string[] }
    /** Plain bullets. */
    | { kind: "ul"; keys: string[] }
    /** Tick boxes: can be ticked on screen, nothing is saved. */
    | { kind: "checks"; keys: string[] }
    /** `head` entries may be null (an empty corner cell). */
    | { kind: "table"; head: (string | null)[]; rows: string[][]; rowHeader: boolean }

export interface HelpGuide {
    slug: HelpSlug
    /** The source file in docs/guides. */
    source: string
    titleKey: string
    cardKey: string
    blocks: HelpBlock[]
}

const NS = "helpGuides"
const k = (path: string) => `${NS}.${path}`
const ks = (prefix: string, names: string[]) => names.map((n) => k(`${prefix}.${n}`))
const seq = (prefix: string, count: number) => ks(prefix, Array.from({ length: count }, (_, i) => `item${i + 1}`))
const steps = (prefix: string, count: number) => ks(prefix, Array.from({ length: count }, (_, i) => `step${i + 1}`))

export const HELP_GUIDES: Record<HelpSlug, HelpGuide> = {
    michael: {
        slug: "michael",
        source: "docs/guides/michael-ipads.md",
        titleKey: k("michael.title"),
        cardKey: k("cardMichael"),
        blocks: [
            { kind: "p", key: k("michael.intro") },
            { kind: "heading", key: k("michael.once.heading") },
            { kind: "ol", keys: steps("michael.once", 8) },
            { kind: "heading", key: k("michael.phone.heading") },
            { kind: "p", key: k("michael.phone.body") },
            { kind: "heading", key: k("michael.pc.heading") },
            { kind: "ul", keys: seq("michael.pc", 3) },
            { kind: "heading", key: k("michael.midweek.heading") },
            { kind: "ul", keys: seq("michael.midweek", 2) },
            { kind: "heading", key: k("michael.broken.heading") },
            { kind: "p", key: k("michael.broken.body") },
        ],
    },
    drew: {
        slug: "drew",
        source: "docs/guides/drew-sound.md",
        titleKey: k("drew.title"),
        cardKey: k("cardDrew"),
        blocks: [
            { kind: "p", key: k("drew.intro") },
            { kind: "heading", key: k("drew.once.heading") },
            { kind: "ol", keys: steps("drew.once", 2) },
            { kind: "heading", key: k("drew.pieces.heading") },
            { kind: "ul", keys: ks("drew.pieces", ["assign", "limits", "console", "saved"]) },
            { kind: "heading", key: k("drew.before.heading") },
            { kind: "ul", keys: seq("drew.before", 2) },
            { kind: "heading", key: k("drew.after.heading") },
            { kind: "p", key: k("drew.after.intro") },
            { kind: "ul", keys: seq("drew.after", 2) },
            { kind: "p", key: k("drew.after.outro") },
            { kind: "heading", key: k("drew.down.heading") },
            { kind: "p", key: k("drew.down.intro") },
            { kind: "ol", keys: steps("drew.down", 3) },
            { kind: "p", key: k("drew.down.outro") },
        ],
    },
    before: {
        slug: "before",
        source: "docs/guides/pre-service.md",
        titleKey: k("before.title"),
        cardKey: k("cardBefore"),
        blocks: [
            {
                kind: "table",
                head: [null, k("before.schedule.friday"), k("before.schedule.saturday")],
                rows: [
                    ks("before.schedule", ["startsLabel", "startsFriday", "startsSaturday"]),
                    ks("before.schedule", ["arrivesLabel", "arrivesFriday", "arrivesSaturday"]),
                ],
                rowHeader: true,
            },
            { kind: "heading", key: k("before.power.heading") },
            { kind: "checks", keys: seq("before.power", 5) },
            { kind: "heading", key: k("before.arrive.heading") },
            { kind: "checks", keys: seq("before.arrive", 4) },
            { kind: "heading", key: k("before.five.heading") },
            { kind: "checks", keys: seq("before.five", 1) },
            { kind: "heading", key: k("before.wrong.heading") },
            {
                kind: "table",
                head: [k("before.wrong.youSee"), k("before.wrong.doThis")],
                rows: [1, 2, 3, 4, 5].map((n) => ks("before.wrong", [`row${n}Sees`, `row${n}Does`])),
                rowHeader: false,
            },
        ],
    },
    after: {
        slug: "after",
        source: "docs/guides/post-service.md",
        titleKey: k("after.title"),
        cardKey: k("cardAfter"),
        blocks: [
            { kind: "checks", keys: seq("after", 5) },
            { kind: "p", key: k("after.outro") },
        ],
    },
}

/** Every catalogue key a guide renders, for tests. */
export function guideKeys(guide: HelpGuide): string[] {
    const out = [guide.titleKey]
    for (const b of guide.blocks) {
        if (b.kind === "heading" || b.kind === "p") out.push(b.key)
        else if (b.kind === "table") out.push(...b.head.filter((h): h is string => h !== null), ...b.rows.flat())
        else out.push(...b.keys)
    }
    return out
}
