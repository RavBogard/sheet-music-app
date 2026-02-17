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
    date: new Date('2026-02-20'),
    hebrewDate: { day: 28, month: 'Shevat', year: '5786', display: '28 Shevat 5786' },
    parasha: 'Mishpatim',
    holiday: null,
    isShabbat: true,
}

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

// ── Template Engine ──

describe('buildSetlistFromTemplate', () => {
    it('produces tracks for each slot', () => {
        const tracks = buildSetlistFromTemplate(FRIDAY_NIGHT_TEMPLATE, mockLibrary, mockContext)
        expect(tracks.length).toBe(FRIDAY_NIGHT_TEMPLATE.length)
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
        // Should match at least some songs from our mock library
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
        // With limited mock library, some slots should be unmatched
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
})
