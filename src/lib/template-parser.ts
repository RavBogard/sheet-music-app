import { DEFAULT_ORG_ID } from "@/lib/org/registry"
import { rabbiSlotsFor } from "@/lib/org/tenant-lists"
import type { OrgId } from "@/lib/org/types"

/**
 * Map natural language service descriptions to template keys and rabbi identifiers.
 * Returns { templateKey, rabbi } or null if no template matches.
 */
export function parseTemplateRequest(
    text: string,
    orgId: OrgId = DEFAULT_ORG_ID,
): { templateKey: string; rabbi?: string; date?: Date } | null {
    const lower = text.toLowerCase()

    // Extract date from message (e.g., "March 14", "for March 14th", "on 3/14")
    let date: Date | undefined
    const dateMatch = text.match(/(?:for|on)\s+(\w+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?)/i)
    if (dateMatch) {
        const parsed = new Date(dateMatch[1].replace(/(st|nd|rd|th)/i, ''))
        if (!isNaN(parsed.getTime())) {
            // If no year specified, use current year (or next year if date already passed)
            if (!dateMatch[1].match(/\d{4}/)) {
                const now = new Date()
                parsed.setFullYear(now.getFullYear())
                if (parsed < now) parsed.setFullYear(now.getFullYear() + 1)
            }
            date = parsed
        }
    }

    // Template matching with rabbi detection. The rabbi slots and the words
    // that pick them are tenant config (liturgy.rabbiSlots; CRC's daniel_karen
    // and randy when a tenant lists none). Order matters: every Friday match
    // before any morning match, slots and words in their listed order.
    const slots = rabbiSlotsFor(orgId)
    if (lower.includes('friday')) {
        for (const slot of slots) {
            if (slot.match.some((w) => lower.includes(w.toLowerCase()))) return { templateKey: 'friday_night', rabbi: slot.key, date }
        }
    }
    if (lower.includes('saturday') || lower.includes('morning')) {
        for (const slot of slots) {
            if (slot.match.some((w) => lower.includes(w.toLowerCase()))) return { templateKey: 'shabbat_morning', rabbi: slot.key, date }
        }
    }

    // Non-rabbi-specific templates
    const templatePatterns: [RegExp, string][] = [
        [/friday\s*night|kabbalat\s*shabbat|erev\s*shabbat/, 'friday_night'],
        [/shir\s*shabbat/, 'shir_shabbat'],
        [/shabbat\s*morning|saturday\s*morning/, 'shabbat_morning'],
        [/b.?nei\s*mitzvah\s*(saturday|morning)/i, 'bnei_mitzvah_saturday'],
        [/havdalah\s*b.?nei\s*mitzvah/i, 'havdalah_bnei_mitzvah'],
        [/rosh\s*hashanah\s*evening/i, 'rosh_hashanah_evening'],
        [/rosh\s*hashanah\s*morning/i, 'rosh_hashanah_morning'],
        [/rosh\s*hashanah/i, 'rosh_hashanah_evening'],  // default to evening
        [/kol\s*nidre/i, 'yom_kippur_kol_nidre'],
        [/yom\s*kippur\s*morning/i, 'yom_kippur_morning'],
        [/yom\s*kippur\s*afternoon|neilah/i, 'yom_kippur_afternoon'],
        [/yom\s*kippur/i, 'yom_kippur_kol_nidre'],  // default to kol nidre
        [/sukkot/i, 'sukkot'],
        [/simchat\s*torah/i, 'simchat_torah'],
        [/passover|pesach/i, 'passover'],
        [/shavuot/i, 'shavuot'],
    ]

    for (const [pattern, key] of templatePatterns) {
        if (pattern.test(lower)) {
            return { templateKey: key, date }
        }
    }

    return null
}
