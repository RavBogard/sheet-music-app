import { describe, it, expect } from 'vitest'
import {
    getTemplate,
    buildSetlistFromTemplate,
    generateSetlistName,
    FRIDAY_NIGHT_TEMPLATE,
    SHABBAT_MORNING_TEMPLATE,
} from './liturgical-templates'
import type { DriveFile } from '@/types/models'
import type { ServiceContext } from './liturgical-calendar'

// ── Mock Data ──

const mockLibrary: DriveFile[] = [
    { id: '1', name: 'Candle Lighting Blessing.pdf', mimeType: 'application/pdf' },
    { id: '2', name: 'Shalom Aleichem - Traditional.pdf', mimeType: 'application/pdf' },
    { id: '3', name: "L'cha Dodi (Carlebach).pdf", mimeType: 'application/pdf' },
    { id: '4', name: 'Bar\'chu.pdf', mimeType: 'application/pdf' },
    { id: '5', name: 'Shema Yisrael.pdf', mimeType: 'application/pdf' },
    { id: '6', name: 'Mi Chamocha.pdf', mimeType: 'application/pdf' },
    { id: '7', name: 'Adon Olam - Hymn.pdf', mimeType: 'application/pdf' },
    { id: '8', name: 'Ashrei.pdf', mimeType: 'application/pdf' },
    { id: '9', name: 'Oseh Shalom.pdf', mimeType: 'application/pdf' },
    { id: '10', name: 'Aleinu.pdf', mimeType: 'application/pdf' },
    { id: 'folder1', name: 'Sheet Music', mimeType: 'application/vnd.google-apps.folder' },
]

const mockContext: ServiceContext = {
    type: 'friday_night',
    date: new Date(2026, 1, 20), // Feb 20, 2026 local time to avoid timezone shift
    hebrewDate: { day: 28, month: 'Shevat', year: '5786', display: '28 Shevat 5786' },
    parasha: 'Mishpatim',
    holiday: null,
    isShabbat: true,
}

// ── All 16 Template Keys ──

const REGULAR_KEYS = [
    'friday_night',
    'shir_shabbat',
    'shabbat_morning',
    'bnei_mitzvah_saturday',
    'havdalah_bnei_mitzvah',
]

const HOLIDAY_KEYS = [
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

// ── Template Registry ──

describe('getTemplate', () => {
    it('returns friday_night template', () => {
        const template = getTemplate('friday_night')
        expect(template).toBe(FRIDAY_NIGHT_TEMPLATE)
        expect(template!.length).toBeGreaterThan(10)
    })

    it('returns shabbat_morning template', () => {
        const template = getTemplate('shabbat_morning')
        expect(template).toBe(SHABBAT_MORNING_TEMPLATE)
        expect(template!.length).toBeGreaterThan(15)
    })

    it('returns null for unknown template', () => {
        expect(getTemplate('purim_spiel')).toBeNull()
    })

    it('returns a valid template for all 14 registered service types', () => {
        const allKeys = [...REGULAR_KEYS, ...HOLIDAY_KEYS]
        for (const key of allKeys) {
            const template = getTemplate(key)
            expect(template, `Template for "${key}" should exist`).not.toBeNull()
            expect(Array.isArray(template)).toBe(true)
            expect(template!.length).toBeGreaterThan(0)
        }
    })

    it('each regular template has at least 10 slots', () => {
        for (const key of REGULAR_KEYS) {
            const template = getTemplate(key)!
            expect(template.length, `${key} should have 10+ slots`).toBeGreaterThanOrEqual(10)
        }
    })

    it('each holiday stub has at least 5 slots', () => {
        for (const key of HOLIDAY_KEYS) {
            const template = getTemplate(key)!
            expect(template.length, `${key} should have 5+ slots`).toBeGreaterThanOrEqual(5)
        }
    })
})

// ── Template Structure ──

describe('Template structure', () => {
    it('friday_night has headers and songs', () => {
        const headers = FRIDAY_NIGHT_TEMPLATE.filter(s => s.type === 'header')
        const songs = FRIDAY_NIGHT_TEMPLATE.filter(s => s.type === 'song' || (!s.type && !s.isHeader))
        expect(headers.length).toBeGreaterThan(0)
        expect(songs.length).toBeGreaterThan(headers.length)
    })

    it('all song slots have search queries', () => {
        const songs = FRIDAY_NIGHT_TEMPLATE.filter(s => s.type === 'song' || (!s.type && !s.isHeader))
        for (const slot of songs) {
            expect(slot.queries.length, `${slot.label} has no queries`).toBeGreaterThan(0)
        }
    })

    it('shabbat_morning includes Torah service section', () => {
        const torahHeader = SHABBAT_MORNING_TEMPLATE.find(s => s.label.includes('Torah') && s.type === 'header')
        expect(torahHeader).toBeDefined()
    })

    it('friday_night includes service flow items', () => {
        const readings = FRIDAY_NIGHT_TEMPLATE.filter(s => s.type === 'reading')
        const prayers = FRIDAY_NIGHT_TEMPLATE.filter(s => s.type === 'prayer')
        const transitions = FRIDAY_NIGHT_TEMPLATE.filter(s => s.type === 'transition')
        expect(readings.length).toBeGreaterThan(0)
        expect(prayers.length).toBeGreaterThan(0)
        expect(transitions.length).toBeGreaterThan(0)
    })

    it('service flow slots have performer and estimatedMinutes', () => {
        const flowSlots = FRIDAY_NIGHT_TEMPLATE.filter(s =>
            s.type && ['reading', 'prayer', 'transition'].includes(s.type)
        )
        for (const slot of flowSlots) {
            expect(slot.defaultPerformer, `${slot.label} has no performer`).toBeTruthy()
            expect(slot.estimatedMinutes, `${slot.label} has no estimatedMinutes`).toBeGreaterThan(0)
        }
    })
})

// ── Rabbi Variant Conditionals ──

describe('rabbi variant filtering', () => {
    it('FRIDAY_NIGHT_TEMPLATE includes rabbi-variant conditionals (onlyFor)', () => {
        const danielSlots = FRIDAY_NIGHT_TEMPLATE.filter(s => s.onlyFor?.includes('daniel_karen'))
        const randySlots = FRIDAY_NIGHT_TEMPLATE.filter(s => s.onlyFor?.includes('randy'))
        expect(danielSlots.length, 'Should have daniel_karen-only slots').toBeGreaterThanOrEqual(1)
        expect(randySlots.length, 'Should have randy-only slots').toBeGreaterThanOrEqual(1)
    })

    it('when context.rabbi=randy, daniel_karen-only slots are excluded', () => {
        const context: ServiceContext = { ...mockContext, rabbi: 'randy' } as any
        const tracks = buildSetlistFromTemplate(FRIDAY_NIGHT_TEMPLATE, mockLibrary, context)

        const danielOnlyLabels = FRIDAY_NIGHT_TEMPLATE
            .filter(s => s.onlyFor?.includes('daniel_karen') && !s.onlyFor?.includes('randy'))
            .map(s => s.label)

        for (const label of danielOnlyLabels) {
            const found = tracks.some(t => t.title.includes(label))
            expect(found, `"${label}" should be excluded for rabbi=randy`).toBe(false)
        }
    })

    it('when context.rabbi=daniel_karen, randy-only slots are excluded', () => {
        const context: ServiceContext = { ...mockContext, rabbi: 'daniel_karen' } as any
        const tracks = buildSetlistFromTemplate(FRIDAY_NIGHT_TEMPLATE, mockLibrary, context)

        const randyOnlyLabels = FRIDAY_NIGHT_TEMPLATE
            .filter(s => s.onlyFor?.includes('randy') && !s.onlyFor?.includes('daniel_karen'))
            .map(s => s.label)

        for (const label of randyOnlyLabels) {
            const found = tracks.some(t => t.title.includes(label))
            expect(found, `"${label}" should be excluded for rabbi=daniel_karen`).toBe(false)
        }
    })

    it('SHABBAT_MORNING_TEMPLATE has rabbi-variant conditionals', () => {
        const danielSlots = SHABBAT_MORNING_TEMPLATE.filter(s => s.onlyFor?.includes('daniel_karen'))
        const randySlots = SHABBAT_MORNING_TEMPLATE.filter(s => s.onlyFor?.includes('randy'))
        expect(danielSlots.length, 'Should have daniel_karen-only slots').toBeGreaterThanOrEqual(1)
        expect(randySlots.length, 'Should have randy-only slots').toBeGreaterThanOrEqual(1)
    })
})

// ── Template Engine ──

describe('buildSetlistFromTemplate', () => {
    it('produces tracks for each slot', () => {
        const tracks = buildSetlistFromTemplate(FRIDAY_NIGHT_TEMPLATE, mockLibrary, mockContext)
        // Total tracks should equal template length minus any filtered onlyFor slots
        // (no rabbi set in context, so onlyFor slots with rabbi-specific values should still be included
        //  because the filtering is now rabbi-based, not service-type-based)
        expect(tracks.length).toBeGreaterThanOrEqual(FRIDAY_NIGHT_TEMPLATE.length - 2)
    })

    it('creates header tracks for header slots', () => {
        const tracks = buildSetlistFromTemplate(FRIDAY_NIGHT_TEMPLATE, mockLibrary, mockContext)
        const headers = tracks.filter(t => t.type === 'header')
        const templateHeaders = FRIDAY_NIGHT_TEMPLATE.filter(s => s.type === 'header')
        expect(headers.length).toBe(templateHeaders.length)
    })

    it('matches library files to song slots', () => {
        const tracks = buildSetlistFromTemplate(FRIDAY_NIGHT_TEMPLATE, mockLibrary, mockContext)
        const matched = tracks.filter(t => t.fileId)
        expect(matched.length).toBeGreaterThan(3)
    })

    it('does not use folders as matches', () => {
        const tracks = buildSetlistFromTemplate(FRIDAY_NIGHT_TEMPLATE, mockLibrary, mockContext)
        const folderTrack = tracks.find(t => t.fileId === 'folder1')
        expect(folderTrack).toBeUndefined()
    })

    it('does not assign same file to two slots', () => {
        const tracks = buildSetlistFromTemplate(FRIDAY_NIGHT_TEMPLATE, mockLibrary, mockContext)
        const fileIds = tracks.filter(t => t.fileId).map(t => t.fileId)
        const uniqueIds = new Set(fileIds)
        expect(uniqueIds.size).toBe(fileIds.length)
    })

    it('marks unmatched slots with (unmatched)', () => {
        const tracks = buildSetlistFromTemplate(FRIDAY_NIGHT_TEMPLATE, mockLibrary, mockContext)
        const unmatched = tracks.filter(t => t.title.includes('(unmatched)'))
        expect(unmatched.length).toBeGreaterThan(0)
    })

    it('annotates Torah headers with parasha', () => {
        const tracks = buildSetlistFromTemplate(SHABBAT_MORNING_TEMPLATE, mockLibrary, {
            ...mockContext,
            type: 'shabbat_morning',
            parasha: 'Ki Tisa',
        })
        const torahHeader = tracks.find(t => t.type === 'header' && t.title.includes('Torah') && t.title.includes('Ki Tisa'))
        expect(torahHeader).toBeDefined()
    })

    it('strips file extension from matched titles', () => {
        const tracks = buildSetlistFromTemplate(FRIDAY_NIGHT_TEMPLATE, mockLibrary, mockContext)
        const matched = tracks.filter(t => t.fileId)
        for (const track of matched) {
            expect(track.title).not.toMatch(/\.pdf$/)
        }
    })

    it('produces valid tracks from each regular template', () => {
        for (const key of REGULAR_KEYS) {
            const template = getTemplate(key)!
            const context: ServiceContext = { ...mockContext, type: key as any }
            const tracks = buildSetlistFromTemplate(template, mockLibrary, context)
            expect(tracks.length, `${key} should produce tracks`).toBeGreaterThan(0)
        }
    })

    it('produces valid tracks from holiday stub templates', () => {
        for (const key of HOLIDAY_KEYS) {
            const template = getTemplate(key)!
            const context: ServiceContext = { ...mockContext, type: key as any }
            const tracks = buildSetlistFromTemplate(template, mockLibrary, context)
            expect(tracks.length, `${key} should produce tracks`).toBeGreaterThan(0)
        }
    })
})

// ── Name Generation ──

describe('generateSetlistName', () => {
    it('includes service type label', () => {
        const name = generateSetlistName(mockContext)
        expect(name).toContain('Friday Night')
    })

    it('includes parasha when available', () => {
        const name = generateSetlistName(mockContext)
        expect(name).toContain('Parashat Mishpatim')
    })

    it('includes formatted date', () => {
        const name = generateSetlistName(mockContext)
        expect(name).toContain('February 20')
    })

    it('omits parasha for non-Shabbat services', () => {
        const name = generateSetlistName({
            ...mockContext,
            type: 'rosh_hashanah',
            parasha: 'Ha\'azinu',
        })
        expect(name).toContain('Rosh Hashanah')
        expect(name).not.toContain('Parashat')
    })

    it('uses em dash separator', () => {
        const name = generateSetlistName(mockContext)
        expect(name).toContain(' — ')
    })

    it('generates names for new template types', () => {
        const shirCtx = { ...mockContext, type: 'shir_shabbat' as any }
        expect(generateSetlistName(shirCtx)).toContain('Shir Shabbat')

        const bneiCtx = { ...mockContext, type: 'bnei_mitzvah_saturday' as any }
        expect(generateSetlistName(bneiCtx)).toContain("B'nei Mitzvah")
    })
})

// ── v5: Service Flow Types ──

describe('v5 — service flow types in templates', () => {
    it('Friday night template includes non-song types', () => {
        const types = FRIDAY_NIGHT_TEMPLATE.map(s => s.type).filter(Boolean)
        expect(types).toContain('header')
        expect(types).toContain('reading')
        expect(types).toContain('prayer')
        expect(types).toContain('transition')
        expect(types).toContain('note')
    })

    it('Shabbat morning template includes sermon as note', () => {
        const sermon = SHABBAT_MORNING_TEMPLATE.find(s => s.label === 'Sermon')
        expect(sermon).toBeDefined()
        expect(sermon!.type).toBe('note')
        expect(sermon!.defaultPerformer).toBe('Rabbi')
        expect(sermon!.estimatedMinutes).toBe(15)
    })

    it('buildSetlistFromTemplate generates non-song tracks', () => {
        const tracks = buildSetlistFromTemplate(FRIDAY_NIGHT_TEMPLATE, mockLibrary, mockContext)
        const readings = tracks.filter(t => t.type === 'reading')
        const prayers = tracks.filter(t => t.type === 'prayer')
        const transitions = tracks.filter(t => t.type === 'transition')
        expect(readings.length).toBeGreaterThan(0)
        expect(prayers.length).toBeGreaterThan(0)
        expect(transitions.length).toBeGreaterThan(0)
    })

    it('non-song tracks include performer and duration', () => {
        const tracks = buildSetlistFromTemplate(FRIDAY_NIGHT_TEMPLATE, mockLibrary, mockContext)
        const kiddush = tracks.find(t => t.title === 'Kiddush')
        expect(kiddush).toBeDefined()
        expect(kiddush!.type).toBe('transition')
        expect(kiddush!.performer).toBe('Rabbi')
        expect(kiddush!.estimatedMinutes).toBe(2)
        expect(kiddush!.description).toBe('Blessing over wine')
    })

    it('Torah reading gets parasha annotation', () => {
        const tracks = buildSetlistFromTemplate(FRIDAY_NIGHT_TEMPLATE, mockLibrary, mockContext)
        const reading = tracks.find(t => t.type === 'reading' && t.title.includes('Torah'))
        expect(reading).toBeDefined()
        expect(reading!.description).toContain('Parashat Mishpatim')
    })
})
