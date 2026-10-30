import { afterEach, describe, expect, it } from 'vitest'

import { clearPrimedOrgConfigs } from '@/lib/org/config-cache'
import { parseTemplateRequest } from '@/lib/template-parser'
import { getAllTemplateKeys, TEMPLATE_LABELS } from '@/lib/liturgical-templates'
import { listBooksTool } from '@/lib/mcp/tools/books'

/**
 * Multi-tenant phase 1 golden (lane 3, surfaces 4+5): rabbi slot keys, the
 * service-type (template) set and the book list, exactly as e0ad18b4 produced
 * them. None of these were tenant-aware, so brotherslazaroff gets the same
 * answers as crc.
 */

const PHRASES = [
    'Daniel friday',
    'karen friday night',
    'Randy Friday',
    'daniel saturday',
    'daniel shabbat morning',
    'Karen morning',
    'karen shabbat morning',
    'randy saturday',
    'randy shabbat morning',
    'friday night',
    'kabbalat shabbat',
    'shir shabbat',
    'shabbat morning',
    'saturday morning',
    "b'nei mitzvah saturday",
    'havdalah bnei mitzvah',
    'rosh hashanah',
    'kol nidre',
    'neilah',
    'sukkot',
    'something else entirely',
    'daniel tuesday',
]

const GOLDEN_PARSES: Array<{ templateKey: string; rabbi?: string } | null> = [
    { templateKey: 'friday_night', rabbi: 'daniel_karen' },
    { templateKey: 'friday_night', rabbi: 'daniel_karen' },
    { templateKey: 'friday_night', rabbi: 'randy' },
    { templateKey: 'shabbat_morning', rabbi: 'daniel_karen' },
    { templateKey: 'shabbat_morning', rabbi: 'daniel_karen' },
    { templateKey: 'shabbat_morning', rabbi: 'daniel_karen' },
    { templateKey: 'shabbat_morning', rabbi: 'daniel_karen' },
    { templateKey: 'shabbat_morning', rabbi: 'randy' },
    { templateKey: 'shabbat_morning', rabbi: 'randy' },
    { templateKey: 'friday_night' },
    { templateKey: 'friday_night' },
    { templateKey: 'shir_shabbat' },
    { templateKey: 'shabbat_morning' },
    { templateKey: 'shabbat_morning' },
    { templateKey: 'bnei_mitzvah_saturday' },
    { templateKey: 'havdalah_bnei_mitzvah' },
    { templateKey: 'rosh_hashanah_evening' },
    { templateKey: 'yom_kippur_kol_nidre' },
    { templateKey: 'yom_kippur_afternoon' },
    { templateKey: 'sukkot' },
    null,
    null,
]

const GOLDEN_TEMPLATE_KEYS = [
    'friday_night',
    'shir_shabbat',
    'shabbat_morning',
    'bnei_mitzvah_saturday',
    'havdalah_bnei_mitzvah',
    'rosh_hashanah_evening',
    'rosh_hashanah_morning',
    'yom_kippur_kol_nidre',
    'yom_kippur_morning',
    'yom_kippur_afternoon',
    'sukkot',
    'simchat_torah',
    'passover',
    'shavuot',
]

const GOLDEN_TEMPLATE_LABELS: Record<string, string> = {
    friday_night: 'Friday Night',
    shir_shabbat: 'Shir Shabbat',
    shabbat_morning: 'Shabbat Morning',
    bnei_mitzvah_saturday: "B'nei Mitzvah Saturday",
    havdalah_bnei_mitzvah: "Havdalah B'nei Mitzvah",
    rosh_hashanah_evening: 'Rosh Hashanah Evening',
    rosh_hashanah_morning: 'Rosh Hashanah Morning',
    yom_kippur_kol_nidre: 'Yom Kippur Kol Nidre',
    yom_kippur_morning: 'Yom Kippur Morning',
    yom_kippur_afternoon: 'Yom Kippur Afternoon/Neilah',
    sukkot: 'Sukkot',
    simchat_torah: 'Simchat Torah',
    passover: 'Passover',
    shavuot: 'Shavuot',
}

const GOLDEN_BOOKS = [
    { slug: 'crc-friday', title: 'CRC Friday Siddur', tier: 'pagemap', pages: 48 },
    { slug: 'crc-saturday', title: 'CRC Saturday Siddur', tier: 'pagemap', pages: 102 },
    { slug: 'crc-machzor-2008', title: 'CRC Machzor (2008)', tier: 'pagemap', pages: 215 },
    { slug: 'shabbat-maariv', title: 'Shirei Shabbat — Friday Night', tier: 'feed' },
    { slug: 'shabbat-shacharit', title: 'Shirei Shabbat — Shabbat Morning', tier: 'feed' },
    { slug: 'shirei-tshuvah', title: 'Shirei Tshuvah — Rosh Hashanah', tier: 'feed' },
    { slug: 'legacy-shabbat-evening', title: 'CRC Kabbalat Shabbat (feed)', tier: 'feed' },
    { slug: 'legacy-shabbat-morning', title: 'CRC Shabbat Morning (feed)', tier: 'feed' },
    { slug: 'legacy-beit-mitzvah', title: 'CRC Beit Mitzvah Siddur (feed)', tier: 'feed', pages: 63 },
]

describe('P1 golden: rabbi slots, service types and books (crc + brotherslazaroff)', () => {
    afterEach(() => clearPrimedOrgConfigs())

    for (const org of ['crc', 'brotherslazaroff']) {
        it(`${org}: parseTemplateRequest picks today's rabbi keys`, () => {
            const got = PHRASES.map((p) => {
                const r = (parseTemplateRequest as (t: string, o?: string) => ReturnType<typeof parseTemplateRequest>)(p, org)
                if (!r) return null
                return r.rabbi ? { templateKey: r.templateKey, rabbi: r.rabbi } : { templateKey: r.templateKey }
            })
            expect(got).toEqual(GOLDEN_PARSES)
        })

        it(`${org}: list_books lists every registered book`, () => {
            const res = (listBooksTool as (o?: string) => ReturnType<typeof listBooksTool>)(org)
            expect(res.ok).toBe(true)
            expect(res.books.map(({ slug, title, tier }) => ({ slug, title, tier }))).toEqual(
                GOLDEN_BOOKS.map(({ slug, title, tier }) => ({ slug, title, tier })),
            )
            for (const g of GOLDEN_BOOKS) {
                if (g.pages !== undefined) expect(res.books.find((b) => b.slug === g.slug)?.pages).toBe(g.pages)
            }
        })
    }

    it('the template (service type) catalogue is unchanged', () => {
        expect(getAllTemplateKeys()).toEqual(GOLDEN_TEMPLATE_KEYS)
        expect(Object.keys(TEMPLATE_LABELS)).toEqual(GOLDEN_TEMPLATE_KEYS)
        for (const k of GOLDEN_TEMPLATE_KEYS) expect(TEMPLATE_LABELS[k].label).toBe(GOLDEN_TEMPLATE_LABELS[k])
        expect(
            Object.fromEntries(GOLDEN_TEMPLATE_KEYS.map((k) => [k, TEMPLATE_LABELS[k].category])),
        ).toEqual({
            friday_night: 'regular',
            shir_shabbat: 'regular',
            shabbat_morning: 'regular',
            bnei_mitzvah_saturday: 'regular',
            havdalah_bnei_mitzvah: 'regular',
            rosh_hashanah_evening: 'holiday',
            rosh_hashanah_morning: 'holiday',
            yom_kippur_kol_nidre: 'holiday',
            yom_kippur_morning: 'holiday',
            yom_kippur_afternoon: 'holiday',
            sukkot: 'holiday',
            simchat_torah: 'holiday',
            passover: 'holiday',
            shavuot: 'holiday',
        })
    })
})
