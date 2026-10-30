import { CRC_RABBI_SLOTS, SERVICE_TYPE_CATALOG } from "@/lib/templates/service-types"

/**
 * Setlist memory, release 1 — read-time classification of a stored setlist.
 *
 * Nothing here writes. The stored `templateType` / `rabbi` / `name` fields are
 * messy (kebab-case legacy types, HTML-escaped rabbi text, per-instrument
 * copies of one service), so history reads classify each setlist on the fly.
 * An unknown value classifies to null, never to a guess.
 */

export type RabbiSlotKey = "daniel_karen" | "randy"

export interface ServiceClass {
    /** A SERVICE_TYPE_CATALOG key, or null. */
    serviceType: string | null
    rabbiSlot: RabbiSlotKey | null
    special: boolean
    /** Instrument label of a per-instrument copy ("… · Bb"), else null. */
    part: string | null
}

/** The instrument labels a per-instrument setlist copy ends with. */
export const SETLIST_PART_LABELS = [
    "Bb",
    "Eb",
    "C",
    "Bass Clef",
    "Vocals",
    "Guitar",
    "Piano/Keys",
] as const

const CATALOG_KEYS = new Set(SERVICE_TYPE_CATALOG.map((e) => e.key))
const CATALOG_CATEGORY = new Map(SERVICE_TYPE_CATALOG.map((e) => [e.key, e.category]))

const TEMPLATE_ALIASES: Record<string, string> = {
    "kabbalat-shabbat": "friday_night",
    "shir-shabbat": "shir_shabbat",
    bnei_mitzvah_havdallah: "havdalah_bnei_mitzvah",
    "rosh-hashanah-day": "rosh_hashanah_morning",
    "erev-rosh-hashanah": "rosh_hashanah_evening",
    "kol-nidre": "yom_kippur_kol_nidre",
    "kol-nidre-alt": "yom_kippur_kol_nidre",
    neilah: "yom_kippur_afternoon",
}

const SPECIAL_TEMPLATE_TYPES = new Set(["campfire", "concert", "other"])

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")
}

const PART_RE = new RegExp(
    ` · (${SETLIST_PART_LABELS.map(escapeRegExp).join("|")})\\s*$`,
)

export function setlistPart(name: string): string | null {
    const m = PART_RE.exec(name)
    return m ? m[1] : null
}

function mapTemplateType(templateType: string | null | undefined): string | null {
    if (typeof templateType !== "string" || !templateType.trim()) return null
    const tt = templateType.trim()
    if (CATALOG_KEYS.has(tt)) return tt
    const alias = TEMPLATE_ALIASES[tt]
    if (alias) return alias
    const snake = tt.replace(/-/g, "_")
    if (CATALOG_KEYS.has(snake)) return snake
    return null
}

function serviceTypeFor(name: string, templateType: string | null | undefined): string | null {
    if (/shir shabbat/i.test(name)) return "shir_shabbat"
    const mapped = mapTemplateType(templateType)
    if (mapped) return mapped
    if (/\b(bar|bat|b'?nai|b'?nei|bnei) mitzvah\b/i.test(name)) return "bnei_mitzvah_saturday"
    if (/shabbat morning/i.test(name)) return "shabbat_morning"
    if (/kabbalat|friday/i.test(name)) return "friday_night"
    return null
}

const HTML_ENTITIES: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
}

export function decodeHtml(s: string): string {
    return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body: string) => {
        if (body[0] === "#") {
            const code =
                body[1] === "x" || body[1] === "X"
                    ? parseInt(body.slice(2), 16)
                    : parseInt(body.slice(1), 10)
            return Number.isFinite(code) ? String.fromCodePoint(code) : whole
        }
        return HTML_ENTITIES[body.toLowerCase()] ?? whole
    })
}

function rabbiSlotFor(rabbi: string | null | undefined): RabbiSlotKey | null {
    if (typeof rabbi !== "string" || !rabbi.trim()) return null
    const text = decodeHtml(rabbi)
        .replace(/\([^)]*\)/g, " ")
        .toLowerCase()
    const hits = CRC_RABBI_SLOTS.filter((slot) =>
        slot.match.some((word) =>
            new RegExp(`\\b${escapeRegExp(word.toLowerCase())}\\b`).test(text),
        ),
    )
    return hits.length === 1 ? (hits[0].key as RabbiSlotKey) : null
}

/** A stored rabbi-slot value if it is a known slot key, else null. */
export function storedRabbiSlot(v: unknown): RabbiSlotKey | null {
    return CRC_RABBI_SLOTS.some((slot) => slot.key === v) ? (v as RabbiSlotKey) : null
}

/**
 * Classify a setlist. Values stored on the setlist (`serviceType`,
 * `rabbiSlot`, `special`, written only by explicit author actions) win; a stored value that is missing,
 * null or not a known key falls back to inference from name / templateType /
 * rabbi text. `part` always comes from the name.
 */
export function classifyService(s: {
    name: string
    templateType?: string | null
    rabbi?: string | null
    serviceType?: string | null
    rabbiSlot?: string | null
    special?: boolean | null
}): ServiceClass {
    const name = typeof s.name === "string" ? s.name : ""
    const part = setlistPart(name)
    const serviceType = mapTemplateType(s.serviceType) ?? serviceTypeFor(name, s.templateType)
    const rabbiSlot = storedRabbiSlot(s.rabbiSlot) ?? rabbiSlotFor(s.rabbi)
    const tt = typeof s.templateType === "string" ? s.templateType.trim() : ""
    const special =
        typeof s.special === "boolean"
            ? s.special
            : (serviceType !== null && CATALOG_CATEGORY.get(serviceType) === "holiday") ||
              /\b(with|w\/)\s/i.test(name) ||
              /memorial/i.test(name) ||
              SPECIAL_TEMPLATE_TYPES.has(tt) ||
              serviceType === null
    return { serviceType, rabbiSlot, special, part }
}

/**
 * The stored class to write next to an author's own `templateType` / `rabbi`
 * edit, normalised exactly as classifyService reads them, so a stored value
 * can never go stale against the fields it was taken from. Only the keys
 * given are returned (`templateType` -> `serviceType`, `rabbi` -> `rabbiSlot`);
 * a value that maps to nothing stores null.
 */
export function storedClassFor(v: {
    templateType?: string | null
    rabbi?: string | null
}): { serviceType?: string | null; rabbiSlot?: RabbiSlotKey | null } {
    const out: { serviceType?: string | null; rabbiSlot?: RabbiSlotKey | null } = {}
    if (v.templateType !== undefined) out.serviceType = mapTemplateType(v.templateType)
    if (v.rabbi !== undefined) out.rabbiSlot = rabbiSlotFor(v.rabbi)
    return out
}

/** The rabbi slot a free-text rabbi entry names, or null. */
export function rabbiSlotOf(rabbi: string | null | undefined): RabbiSlotKey | null {
    return rabbiSlotFor(rabbi)
}

/** The catalog key a free `templateType` / service-type string maps to, or null. */
export function catalogServiceType(value: string | null | undefined): string | null {
    return mapTemplateType(value)
}
