import '@testing-library/jest-dom'
import { describe, expect, it, vi } from 'vitest'
import type { DriveFile } from '@/types/models'

// Mocks as library-tenant-labels.golden.test.tsx.
const libraryState = vi.hoisted(() => ({ allFiles: [] as DriveFile[] }))
vi.mock('@/lib/library-store', () => ({
  useLibraryStore: () => ({ allFiles: libraryState.allFiles }),
}))
vi.mock('@/hooks/use-library', () => ({ useLibrary: () => ({}) }))

import { expectNoUntranslatedText, renderPseudo } from '@/test-utils/i18n'
import { SearchOverlay } from '../SearchOverlay'

libraryState.allFiles = [
  { id: 'a', name: 'Test Song A.pdf', mimeType: 'application/pdf', metadata: { key: 'Bb' } },
  { id: 'b', name: 'Test Song B.pdf', mimeType: 'application/pdf', collection: 'supplemental' },
  { id: 'c', name: 'Test Song C.pdf', mimeType: 'application/pdf', collection: 'nava' },
] as DriveFile[]

// Data: titles, collection (book) names, CRC's core section label (tenant config).
const ALLOW = ['Test Song A', 'Test Song B', 'Test Song C', 'Shireinu', 'Nava Tehilah', 'CRC Charts']

describe('SearchOverlay i18n (pseudo-locale)', () => {
  it('qps: header, results, "added" marker and add button come through t()', () => {
    const r = renderPseudo(
      <SearchOverlay
        isOpen
        onClose={() => {}}
        onSelect={() => {}}
        currentTrackFileIds={new Set(['a'])}
        canAddToSetlist
        onAddToSetlist={() => {}}
      />,
    )
    expectNoUntranslatedText(r.container, { allow: ALLOW })
    expect(r.container.querySelector('input')?.getAttribute('placeholder')).toMatch(/^⟦.*⟧$/)
  })

  it('qps: replace mode placeholder', () => {
    const r = renderPseudo(<SearchOverlay isOpen onClose={() => {}} onSelect={() => {}} replacingTrackId="t1" />)
    expectNoUntranslatedText(r.container, { allow: ALLOW })
  })

  it('qps-rtl: renders rtl with no untranslated text', () => {
    const r = renderPseudo(<SearchOverlay isOpen onClose={() => {}} onSelect={() => {}} />, { rtl: true })
    expect(r.container.querySelector('[dir="rtl"]')).not.toBeNull()
    expectNoUntranslatedText(r.container, { allow: ALLOW })
  })
})
