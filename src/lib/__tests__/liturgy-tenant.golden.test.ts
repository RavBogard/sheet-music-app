import { afterEach, describe, expect, it } from 'vitest'

import { clearPrimedOrgConfigs } from '@/lib/org/config-cache'
import { getAllTemplateKeys, TEMPLATE_LABELS } from '@/lib/liturgical-templates'
import { listBooksTool } from '@/lib/mcp/tools/books'

/**
 * Multi-tenant phase 1 golden (lane 3, surfaces 4+5): the
 * service-type (template) set and the book list, exactly as e0ad18b4 produced
 * them. None of these were tenant-aware, so brotherslazaroff gets the same
 * answers as crc.
 */

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

describe('P1 golden: service types and books (crc + brotherslazaroff)', () => {
    afterEach(() => clearPrimedOrgConfigs())

    for (const org of ['crc', 'brotherslazaroff']) {
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
