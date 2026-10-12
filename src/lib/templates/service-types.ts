/**
 * Multi-tenant phase 1 — the built-in service types (template keys), their
 * picker labels and picker groups, in catalogue order.
 *
 * This used to live inline in liturgical-templates.ts TEMPLATE_LABELS. It is
 * here, dependency-free, so tenant config (config-code.ts) can import it
 * without pulling the template bodies and the book page tables into every
 * bundle that reads a tenant string. liturgical-templates.ts builds
 * TEMPLATE_LABELS from it, so the two cannot drift.
 */
export interface ServiceTypeCatalogEntry {
    key: string
    label: string
    category: "regular" | "holiday"
}

export const SERVICE_TYPE_CATALOG: readonly ServiceTypeCatalogEntry[] = [
    { key: "friday_night", label: "Friday Night", category: "regular" },
    { key: "shir_shabbat", label: "Shir Shabbat", category: "regular" },
    { key: "shabbat_morning", label: "Shabbat Morning", category: "regular" },
    { key: "bnei_mitzvah_saturday", label: "B'nei Mitzvah Saturday", category: "regular" },
    { key: "havdalah_bnei_mitzvah", label: "Havdalah B'nei Mitzvah", category: "regular" },
    { key: "rosh_hashanah_evening", label: "Rosh Hashanah Evening", category: "holiday" },
    { key: "rosh_hashanah_morning", label: "Rosh Hashanah Morning", category: "holiday" },
    { key: "yom_kippur_kol_nidre", label: "Yom Kippur Kol Nidre", category: "holiday" },
    { key: "yom_kippur_morning", label: "Yom Kippur Morning", category: "holiday" },
    { key: "yom_kippur_afternoon", label: "Yom Kippur Afternoon/Neilah", category: "holiday" },
    { key: "sukkot", label: "Sukkot", category: "holiday" },
    { key: "simchat_torah", label: "Simchat Torah", category: "holiday" },
    { key: "passover", label: "Passover", category: "holiday" },
    { key: "shavuot", label: "Shavuot", category: "holiday" },
]

/**
 * The rabbi slot keys a template slot's `onlyFor` names, and the words in a
 * request that pick them (template-parser.ts). These are CRC's two rabbi
 * pairings; a tenant with no `liturgy.rabbiSlots` gets them, exactly as every
 * tenant did before phase 1.
 */
export interface RabbiSlot {
    key: string
    label: string
    match: string[]
}

export const CRC_RABBI_SLOTS: readonly RabbiSlot[] = [
    { key: "daniel_karen", label: "Rabbi Daniel / Rabbi Karen", match: ["daniel", "karen"] },
    { key: "randy", label: "Rabbi Randy", match: ["randy"] },
]
