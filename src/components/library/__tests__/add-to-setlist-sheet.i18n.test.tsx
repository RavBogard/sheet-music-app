import '@testing-library/jest-dom'
import { fireEvent, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// Mock radix dialog portal to render inline (as add-to-setlist-sheet.test.tsx).
vi.mock('@radix-ui/react-dialog', async () => {
  const actual = await vi.importActual<typeof import('@radix-ui/react-dialog')>('@radix-ui/react-dialog')
  return {
    ...actual,
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }
})

import { expectNoUntranslatedText, renderPseudo } from '@/test-utils/i18n'
import { AddToSetlistSheet } from '@/components/library/AddToSetlistSheet'
import type { Setlist } from '@/types/models'

const setlists: Setlist[] = [
  { id: 'sl-1', name: 'Test Set One', date: new Date('2026-03-15'), updatedAt: new Date('2026-03-15T12:00:00'), trackCount: 5, ownerId: 'u' } as Setlist,
  { id: 'sl-2', name: 'Test Set Two', date: new Date('2026-03-16'), updatedAt: new Date('2026-03-16T12:00:00'), trackCount: 1, ownerId: 'u' } as Setlist,
]

// Data: setlist names. "Close" is the shared Sheet primitive's sr-only close
// label (src/components/ui/sheet.tsx — not this lane's file).
const ALLOW = ['Test Set One', 'Test Set Two', 'Close']

function sheet(overrides: Partial<React.ComponentProps<typeof AddToSetlistSheet>> = {}) {
  return (
    <AddToSetlistSheet
      isOpen
      onOpenChange={vi.fn()}
      setlists={setlists}
      loading={false}
      searchQuery=""
      onSearchChange={vi.fn()}
      onSelectSetlist={vi.fn()}
      createNewSetlist={vi.fn(async () => {})}
      pendingCount={3}
      {...overrides}
    />
  )
}

describe('AddToSetlistSheet i18n (pseudo-locale)', () => {
  it('qps: picker, rows (date + count) and the create form come through t()', () => {
    renderPseudo(sheet())
    // Open the inline "new setlist" form.
    const search = screen.getByRole('textbox')
    fireEvent.click(search.parentElement!.parentElement!.querySelector(':scope > button')!)
    expect(screen.getAllByRole('textbox')).toHaveLength(2)
    const body = document.body
    expectNoUntranslatedText(body, { allow: ALLOW })
    expect(screen.getAllByText(/⟦/).length).toBeGreaterThan(3)
  })

  it('qps: empty and no-match states', () => {
    const r1 = renderPseudo(sheet({ setlists: [] }))
    expectNoUntranslatedText(document.body, { allow: ALLOW })
    r1.unmount()
    renderPseudo(sheet({ setlists: [], searchQuery: 'zzz', pendingCount: 1 }))
    expectNoUntranslatedText(document.body, { allow: [...ALLOW, /zzz/] })
  })

  it('qps-rtl: renders rtl with no untranslated text', () => {
    const r = renderPseudo(sheet(), { rtl: true })
    expect(r.baseElement.querySelector('[dir="rtl"]')).not.toBeNull()
    expectNoUntranslatedText(document.body, { allow: ALLOW })
  })
})
