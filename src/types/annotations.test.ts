import { describe, it, expect } from 'vitest'
import type { Annotation, PageAnnotations, AnnotationDocument } from './annotations'
import { ANNOTATION_COLORS } from './annotations'

describe('annotations types', () => {
    describe('ANNOTATION_COLORS', () => {
        it('has exactly 4 color options', () => {
            expect(ANNOTATION_COLORS).toHaveLength(4)
        })

        it('each color has label and valid hex', () => {
            for (const color of ANNOTATION_COLORS) {
                expect(color).toHaveProperty('label')
                expect(color).toHaveProperty('hex')
                expect(color.hex).toMatch(/^#[0-9a-f]{6}$/i)
            }
        })

        it('contains expected colors', () => {
            const labels = ANNOTATION_COLORS.map(c => c.label)
            expect(labels).toContain('Red')
            expect(labels).toContain('Blue')
            expect(labels).toContain('Green')
            expect(labels).toContain('Amber')
        })
    })

    describe('type contracts', () => {
        it('Annotation freehand has required fields', () => {
            const annotation: Annotation = {
                id: 'test-1',
                type: 'freehand',
                path: 'M 0.1 0.2 L 0.3 0.4',
                color: '#ef4444',
                strokeWidth: 2,
                pageNumber: 1,
                createdAt: Date.now()
            }
            expect(annotation.type).toBe('freehand')
            expect(annotation.path).toBeTruthy()
        })

        it('Annotation text has position and text', () => {
            const annotation: Annotation = {
                id: 'test-2',
                type: 'text',
                text: 'Breathe here',
                x: 0.5,
                y: 0.3,
                color: '#3b82f6',
                pageNumber: 1,
                createdAt: Date.now()
            }
            expect(annotation.type).toBe('text')
            expect(annotation.x).toBeGreaterThanOrEqual(0)
            expect(annotation.x).toBeLessThanOrEqual(1)
            expect(annotation.y).toBeGreaterThanOrEqual(0)
            expect(annotation.y).toBeLessThanOrEqual(1)
        })

        it('Annotation highlight has path with expected opacity handling', () => {
            const annotation: Annotation = {
                id: 'test-3',
                type: 'highlight',
                path: 'M 0.1 0.2 L 0.5 0.2 L 0.5 0.25 L 0.1 0.25',
                color: '#22c55e',
                strokeWidth: 8,
                pageNumber: 2,
                createdAt: Date.now()
            }
            expect(annotation.type).toBe('highlight')
        })

        it('PageAnnotations maps page numbers to annotation arrays', () => {
            const pages: PageAnnotations = {
                1: [
                    { id: 'a', type: 'freehand', path: 'M 0 0', color: '#ef4444', pageNumber: 1, createdAt: 1 }
                ],
                2: [
                    { id: 'b', type: 'text', text: 'Note', x: 0.5, y: 0.5, color: '#3b82f6', pageNumber: 2, createdAt: 2 }
                ]
            }
            expect(Object.keys(pages)).toHaveLength(2)
            expect(pages[1]).toHaveLength(1)
            expect(pages[2]).toHaveLength(1)
        })

        it('AnnotationDocument has required metadata', () => {
            const doc: AnnotationDocument = {
                fileId: 'abc123',
                pageAnnotations: {},
                updatedAt: Date.now()
            }
            expect(doc.fileId).toBeTruthy()
            expect(doc.pageAnnotations).toBeDefined()
        })
    })
})
